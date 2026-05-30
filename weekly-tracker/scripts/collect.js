#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');

// Ensure we resolve modules relative to the weekly-tracker root
const libDir = path.join(__dirname, '..', 'lib');
const { getDb, upsertProject, getActiveProjects, upsertWeeklyReport, upsertProjectTarget, getWeeklyReports, getWeekSummaryStats } = require(path.join(libDir, 'db'));
const { loadConfig, getWeekRange } = require(path.join(libDir, 'config'));
const { ensureRepo, collectProjectCommits, readKeyFiles, getHeadSha, getFirstCommitDate } = require(path.join(libDir, 'git-collector'));
const { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress, formatWeeklyDescription } = require(path.join(libDir, 'llm'));

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary-only');

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function generateWeekRanges(startDate, endDate) {
  const ranges = [];
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  // Align to Monday
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);

  const end = new Date(endDate);

  while (d < end) {
    const weekStart = fmtDate(d);
    const sunday = new Date(d);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    const weekEnd = sunday > end ? fmtDate(end) : fmtDate(sunday);
    ranges.push({ weekStart: fmtDate(d), weekEnd });
    d.setDate(d.getDate() + 7);
  }
  return ranges;
}

function walkDir(dir, prefix, files, max) {
  if (files.length >= max) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (files.length >= max) return;
    if (e.isFile() && /\.(js|ts|json|jsx|tsx|py|go|rs)$/.test(e.name)) {
      files.push(path.join(prefix, e.name));
    } else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      walkDir(path.join(dir, e.name), path.join(prefix, e.name), files, max);
    }
  }
}

function scanKeyFiles(repoDir, maxFiles) {
  const files = [];
  const priority = ['package.json', 'tsconfig.json', 'README.md', '.gitignore'];
  for (const p of priority) {
    if (fs.existsSync(path.join(repoDir, p))) files.push(p);
  }
  for (const dir of ['src', 'lib']) {
    const dirPath = path.join(repoDir, dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, dir, files, maxFiles);
    }
  }
  return files.slice(0, maxFiles);
}

async function main() {
  const db = getDb();
  const config = loadConfig();
  const { weekStart, weekEnd } = getWeekRange();

  console.log(`Collecting data for week: ${weekStart} to ${weekEnd}\n`);

  // Sync projects to DB
  for (const project of config.projects) {
    upsertProject(project);
    const saved = db.prepare('SELECT id FROM projects WHERE name = ?').get(project.name);
    if (saved && project.target) {
      upsertProjectTarget(saved.id, project.target);
    }
  }

  const activeProjects = getActiveProjects();
  const reports = [];
  const projectTargets = {};

  for (const project of activeProjects) {
    console.log(`  Pulling ${project.name} (${project.platform})...`);

    const target = db.prepare('SELECT * FROM project_targets WHERE project_id = ? AND active = 1').get(project.id);
    if (target) {
      projectTargets[project.name] = target;
    }

    // Ensure repo is cloned before any git operations
    const repoReady = await ensureRepo(project);
    if (!repoReady) {
      console.log(`    ⚠ ${project.name}: unreachable, skipping`);
      continue;
    }

    // Detect if this is a new project (no weekly_reports rows yet)
    const lastWeek = db.prepare('SELECT MAX(week_start) as ws FROM weekly_reports WHERE project_id = ?').get(project.id);
    const lastSha = db.prepare('SELECT last_analyzed_sha FROM projects WHERE id = ?').get(project.id)?.last_analyzed_sha || null;

    try {
      if (!lastWeek || !lastWeek.ws) {
        // === NEW PROJECT ===
        await newProjectFlow(project, target, weekStart, weekEnd);
      } else if (lastSha) {
        // === EXISTING PROJECT — incremental ===
        await incrementalFlow(project, target, weekStart, weekEnd, lastSha);
      } else {
        // === LEGACY — existing project without sha checkpoint ===
        await legacyFlow(project, target, weekStart, weekEnd);
      }
    } catch (err) {
      console.log(`    ⚠ ${project.name}: error — ${err.message}`);
    }
  }

  function pushReport(data, project) {
    reports.push({ ...data, project_name: project.name, platform: project.platform });
  }

  // === NEW PROJECT FLOW ===
  async function newProjectFlow(project, target, weekStart, weekEnd) {
    console.log(`    [NEW] Backfilling history...`);

    // Get first commit date for backfill range
    const firstCommitDate = await getFirstCommitDate(project);
    let firstDate = firstCommitDate ? new Date(firstCommitDate) : new Date();
    const ranges = generateWeekRanges(firstDate, weekEnd);
    const pastRanges = ranges.filter((r) => r.weekStart !== weekStart);

    // Backfill past weeks with LLM descriptions
    let backfilled = 0;
    for (const range of pastRanges) {
      const data = await collectProjectCommits(project, range.weekStart, range.weekEnd);
      if (!data) continue;
      data.projectId = project.id;

      if (data.commitCount > 0) {
        data.thisWeekDescription = await generateWeekDescription(project, target, data.commitMessages, { readFiles: false });
      }

      data.commitMessages = data.commitMessages.map(({ diff, ...rest }) => rest);
      upsertWeeklyReport(data);
      backfilled++;
      console.log(`    Backfilled ${range.weekStart} (${data.commitCount} commits)`);
    }

    if (backfilled > 0) {
      console.log(`    Backfilled ${backfilled} historical weeks`);
    }

    // Generate baseline overall_progress from current codebase state
    if (target) {
      const repoDir = path.join(os.tmpdir(), 'weekly-tracker-cache', project.name);
      const keyFiles = scanKeyFiles(repoDir, 15);
      const fileContents = await readKeyFiles(project, keyFiles);
      const baseline = await generateBaselineProgress(project.name, target, fileContents);
      if (baseline) {
        db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(baseline, target.id);
        console.log(`    Baseline progress generated from ${keyFiles.length} key files`);
      }
    }

    // Process current week with full LLM pipeline (skip overall — baseline already set)
    await processWeeklyReport(project, target, weekStart, weekEnd, { skipOverall: true });

    // Save checkpoint
    const headSha = await getHeadSha(project);
    if (headSha) {
      db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(headSha, project.id);
    }
  }

  // Shared: generate a weekly description from commit messages
  // readFiles=false for past weeks (current files don't reflect past state)
  async function generateWeekDescription(project, target, commitMessages, options = {}) {
    const stage1Result = await generateWeeklyProgressDescription(project.name, target, commitMessages);

    if (typeof stage1Result === 'string') {
      return stage1Result;
    }

    if (stage1Result && stage1Result.filesToRead && options.readFiles !== false) {
      const fileContents = await readKeyFiles(project, stage1Result.filesToRead);
      return await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
    }

    return formatWeeklyDescription(stage1Result.stage1, commitMessages.length);
  }

  // === INCREMENTAL FLOW ===
  async function incrementalFlow(project, target, weekStart, weekEnd, lastSha) {
    const data = await collectProjectCommits(project, weekStart, weekEnd, { shaAfter: lastSha });
    if (!data) {
      console.log(`    ⚠ ${project.name}: unreachable, skipping`);
      return;
    }

    if (data.commitMessages.length === 0) {
      console.log(`    - No new commits since ${lastSha.substring(0, 7)}`);
      data.projectId = project.id;
      upsertWeeklyReport(data);
      pushReport(data, project);
      return;
    }

    console.log(`    ${data.commitCount} new commits since ${lastSha.substring(0, 7)}`);

    data.projectId = project.id;

    if (data.commitMessages.length > 0) {
      data.thisWeekDescription = await generateWeekDescription(project, target, data.commitMessages, { readFiles: true });
    }

    upsertWeeklyReport(data);
    pushReport(data, project);

    if (target) {
      const overall = await generateOverallProgress(project.name, target, data.thisWeekDescription || '', data.commitMessages, {});
      if (overall) {
        db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
      }
    }

    // Update checkpoint
    const headSha = await getHeadSha(project);
    if (headSha) {
      db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(headSha, project.id);
    }
  }

  // === LEGACY FLOW (existing project, no sha checkpoint) ===
  async function legacyFlow(project, target, weekStart, weekEnd) {
    await processWeeklyReport(project, target, weekStart, weekEnd);

    // Save checkpoint so next run is incremental
    const headSha = await getHeadSha(project);
    if (headSha) {
      db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(headSha, project.id);
    }
  }

  // === Shared: process current week with full LLM pipeline ===
  async function processWeeklyReport(project, target, weekStart, weekEnd, options = {}) {
    const data = await collectProjectCommits(project, weekStart, weekEnd);
    if (!data) {
      console.log(`    ⚠ ${project.name}: unreachable, skipping`);
      return;
    }

    data.projectId = project.id;

    if (data.commitMessages.length > 0) {
      data.thisWeekDescription = await generateWeekDescription(project, target, data.commitMessages, { readFiles: true });
      console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
    } else {
      console.log(`    - No commits this week`);
    }

    data.commitMessages = data.commitMessages.map(({ diff, ...rest }) => rest);
    upsertWeeklyReport(data);
    pushReport(data, project);

    if (target && !options.skipOverall) {
      const overall = await generateOverallProgress(
        project.name,
        target,
        data.thisWeekDescription || '',
        data.commitMessages,
        {}  // fileContents not available here; overall progress uses description + db state
      );
      if (overall) {
        db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
      }
    }
  }

  // Generate overall weekly summary
  if (reports.length > 0) {
    console.log('\nGenerating weekly summary...');
    try {
      const summary = await generateWeeklySummary(reports, projectTargets);
      const stats = getWeekSummaryStats(weekStart);
      console.log(`\n--- Week of ${weekStart} Summary ---`);
      console.log(summary);
      console.log(`\nStats: ${stats?.active_projects || 0} active projects, ${stats?.total_commits || 0} commits, ${stats?.total_files_changed || 0} files changed`);
    } catch (err) {
      console.log(`  ⚠ Summary generation failed: ${err.message}`);
    }
  }

  console.log('\nCollection complete.');
}

if (summaryOnly) {
  const db = getDb();
  const { weekStart } = getWeekRange();
  const reports = getWeeklyReports(weekStart);
  if (reports.length === 0) {
    console.log('No reports for this week. Run `collect` first.');
  } else {
    console.log(`Week of ${weekStart}:`);
    for (const r of reports) {
      console.log(`  ${r.project_name}: ${r.commit_count} commits — ${r.this_week_description || 'no description'}`);
    }
  }
} else {
  main().catch((err) => {
    console.error('Collection failed:', err);
    process.exit(1);
  });
}

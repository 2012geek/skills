#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');

// Ensure we resolve modules relative to the weekly-tracker root
const libDir = path.join(__dirname, '..', 'lib');
const { getDb, upsertProject, getActiveProjects, upsertWeeklyReport, upsertProjectTarget, getWeeklyReports, getWeekSummaryStats } = require(path.join(libDir, 'db'));
const { loadConfig, getWeekRange } = require(path.join(libDir, 'config'));
const { collectProjectCommits, readKeyFiles, getHeadSha, getFirstCommitDate } = require(path.join(libDir, 'git-collector'));
const { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress } = require(path.join(libDir, 'llm'));

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
    // Cap at 6 months back
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (firstDate > sixMonthsAgo) firstDate = sixMonthsAgo;

    const ranges = generateWeekRanges(firstDate, weekEnd);
    const pastRanges = ranges.filter((r) => r.weekStart !== weekStart);

    // Backfill past weeks (commit metadata only, no LLM)
    for (const range of pastRanges) {
      const data = await collectProjectCommits(project, range.weekStart, range.weekEnd);
      if (!data) continue;
      data.projectId = project.id;
      upsertWeeklyReport(data);
    }

    if (pastRanges.length > 0) {
      console.log(`    Backfilled ${pastRanges.length} historical weeks`);
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

    // Process current week with full LLM pipeline
    await processWeeklyReport(project, target, weekStart, weekEnd);

    // Save checkpoint
    const headSha = await getHeadSha(project);
    if (headSha) {
      db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(headSha, project.id);
    }
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
    let fileContents = {};

    if (data.commitMessages.length > 0) {
      const stage1Result = await generateWeeklyProgressDescription(project.name, target, data.commitMessages);

      if (typeof stage1Result === 'string') {
        data.thisWeekDescription = stage1Result;
      } else if (stage1Result && stage1Result.filesToRead) {
        fileContents = await readKeyFiles(project, stage1Result.filesToRead);
        data.thisWeekDescription = await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
      }
    }

    upsertWeeklyReport(data);
    pushReport(data, project);

    if (target) {
      const overall = await generateOverallProgress(project.name, target, data.thisWeekDescription || '', data.commitMessages, fileContents);
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
  async function processWeeklyReport(project, target, weekStart, weekEnd) {
    const data = await collectProjectCommits(project, weekStart, weekEnd);
    if (!data) {
      console.log(`    ⚠ ${project.name}: unreachable, skipping`);
      return;
    }

    data.projectId = project.id;

    let fileContents = {};

    if (data.commitMessages.length > 0) {
      const stage1Result = await generateWeeklyProgressDescription(project.name, target, data.commitMessages);

      if (typeof stage1Result === 'string') {
        data.thisWeekDescription = stage1Result;
      } else if (stage1Result && stage1Result.filesToRead) {
        fileContents = await readKeyFiles(project, stage1Result.filesToRead);
        data.thisWeekDescription = await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
      }

      console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
    } else {
      console.log(`    - No commits this week`);
    }

    upsertWeeklyReport(data);
    pushReport(data, project);

    if (target) {
      const overall = await generateOverallProgress(
        project.name,
        target,
        data.thisWeekDescription || '',
        data.commitMessages,
        fileContents
      );
      if (overall) {
        db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
      }
    }
  }

  // Generate overall weekly summary
  if (reports.length > 0) {
    console.log('\nGenerating weekly summary...');
    const summary = await generateWeeklySummary(reports, projectTargets);

    // Store the summary in a meta-report (attached to each project as summary)
    const stats = getWeekSummaryStats(weekStart);
    console.log(`\n--- Week of ${weekStart} Summary ---`);
    console.log(summary);
    console.log(`\nStats: ${stats?.active_projects || 0} active projects, ${stats?.total_commits || 0} commits, ${stats?.total_files_changed || 0} files changed`);
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

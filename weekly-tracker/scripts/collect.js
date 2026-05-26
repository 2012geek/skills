#!/usr/bin/env node

const path = require('path');

// Ensure we resolve modules relative to the weekly-tracker root
const libDir = path.join(__dirname, '..', 'lib');
const { getDb, upsertProject, getActiveProjects, upsertWeeklyReport, upsertProjectTarget, getWeeklyReports, getWeekSummaryStats } = require(path.join(libDir, 'db'));
const { loadConfig, getWeekRange } = require(path.join(libDir, 'config'));
const { collectProjectCommits, readKeyFiles } = require(path.join(libDir, 'git-collector'));
const { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress } = require(path.join(libDir, 'llm'));

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary-only');

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

    try {
      const data = await collectProjectCommits(project, weekStart, weekEnd);
      if (!data) {
        console.log(`    ⚠ ${project.name}: unreachable, skipping`);
        continue;
      }

      data.projectId = project.id;

      let fileContents = {};

      if (data.commitMessages.length > 0) {
        // Stage 1: Analyze diffs
        const stage1Result = await generateWeeklyProgressDescription(project.name, target, data.commitMessages);

        if (typeof stage1Result === 'string') {
          // Fallback: stage 1 returned formatted text directly (no files to read)
          data.thisWeekDescription = stage1Result;
        } else if (stage1Result && stage1Result.filesToRead) {
          // Stage 2: Read key files and synthesize
          fileContents = await readKeyFiles(project, stage1Result.filesToRead);
          data.thisWeekDescription = await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
        }

        console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
      } else {
        console.log(`    - No commits this week`);
      }

      upsertWeeklyReport(data);
      reports.push({ ...data, project_name: project.name, platform: project.platform });

      // Update overall progress (now re-synthesized, not appended)
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
    } catch (err) {
      console.log(`    ⚠ ${project.name}: error — ${err.message}`);
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

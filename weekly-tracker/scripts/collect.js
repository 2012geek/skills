#!/usr/bin/env node

const path = require('path');

// Ensure we resolve modules relative to the weekly-tracker root
const libDir = path.join(__dirname, '..', 'lib');
const { getDb, upsertProject, getActiveProjects, upsertWeeklyReport, upsertProjectTarget, getWeeklyReports, getWeekSummaryStats } = require(path.join(libDir, 'db'));
const { loadConfig, getWeekRange } = require(path.join(libDir, 'config'));
const { collectProjectCommits } = require(path.join(libDir, 'git-collector'));
const { generateWeeklySummary, generateProgressDescription, generateOverallProgress } = require(path.join(libDir, 'llm'));

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

      if (data.commitMessages.length > 0) {
        data.thisWeekDescription = await generateProgressDescription(data.commitMessages, project.name, target);
        console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
      } else {
        console.log(`    - No commits this week`);
      }

      upsertWeeklyReport(data);
      reports.push({ ...data, project_name: project.name, platform: project.platform });

      // Update overall progress
      if (target && data.commitCount > 0) {
        const allCommits = db.prepare(`
          SELECT commit_messages FROM weekly_reports
          WHERE project_id = ? AND week_start >= ?
          ORDER BY week_start DESC
        `).all(project.id, target.set_at || '2020-01-01');

        const allMessages = allCommits.flatMap((r) => {
          try { return JSON.parse(r.commit_messages); } catch { return []; }
        });

        if (allMessages.length > 0) {
          const overall = await generateOverallProgress(
            allMessages.map((c) => `${c.hash} ${c.author}: ${c.message}`),
            project.name,
            target
          );
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

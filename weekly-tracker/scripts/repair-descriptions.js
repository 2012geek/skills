#!/usr/bin/env node

const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');
const { getDb, getProjectByName, upsertWeeklyReport } = require(path.join(libDir, 'db'));
const { ensureRepo, collectProjectCommits, readKeyFiles } = require(path.join(libDir, 'git-collector'));
const { generateWeeklyProgressDescription, synthesizeWithFiles, formatWeeklyDescription } = require(path.join(libDir, 'llm'));

async function generateDescription(project, target, commitMessages, readFiles = false) {
  const stage1Result = await generateWeeklyProgressDescription(project.name, target, commitMessages);

  if (typeof stage1Result === 'string') {
    return stage1Result;
  }

  if (stage1Result && stage1Result.filesToRead && readFiles) {
    const fileContents = await readKeyFiles(project, stage1Result.filesToRead);
    return await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
  }

  return formatWeeklyDescription(stage1Result.stage1, commitMessages.length);
}

async function repairProject(projectName) {
  const db = getDb();
  const project = getProjectByName(projectName);
  if (!project) {
    console.error(`Project "${projectName}" not found`);
    return false;
  }

  const target = db.prepare('SELECT * FROM project_targets WHERE project_id = ? AND active = 1').get(project.id);

  // Find weeks with commits but no description
  const emptyWeeks = db.prepare(`
    SELECT * FROM weekly_reports
    WHERE project_id = ? AND commit_count > 0 AND (this_week_description = '' OR this_week_description IS NULL)
    ORDER BY week_start ASC
  `).all(project.id);

  if (emptyWeeks.length === 0) {
    console.log(`  ${projectName}: all weeks already have descriptions`);
    return true;
  }

  console.log(`  ${projectName}: ${emptyWeeks.length} weeks need repair`);

  const repoReady = await ensureRepo(project);
  if (!repoReady) {
    console.error(`  ${projectName}: repo unreachable, skipping`);
    return false;
  }

  let fixed = 0;
  for (const week of emptyWeeks) {
    const data = await collectProjectCommits(project, week.week_start, week.week_end);
    if (!data || data.commitCount === 0) {
      console.log(`    ${week.week_start}: no commits found, skipping`);
      continue;
    }

    data.projectId = project.id;
    data.thisWeekDescription = await generateDescription(project, target, data.commitMessages, false);
    data.commitMessages = data.commitMessages.map(({ diff, ...rest }) => rest);
    upsertWeeklyReport(data);
    fixed++;
    console.log(`    ${week.week_start}: repaired (${data.commitCount} commits)`);
  }

  console.log(`  ${projectName}: fixed ${fixed}/${emptyWeeks.length} weeks`);
  return true;
}

async function main() {
  const db = getDb();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let projectName = null;
  for (const arg of args) {
    if (!arg.startsWith('--')) {
      projectName = arg;
      break;
    }
  }

  if (projectName) {
    // Repair a specific project
    const weeks = db.prepare(`
      SELECT COUNT(*) as cnt FROM weekly_reports wr
      JOIN projects p ON wr.project_id = p.id
      WHERE p.name = ? AND wr.commit_count > 0 AND (wr.this_week_description = '' OR wr.this_week_description IS NULL)
    `).get(projectName);

    console.log(`\nProject: ${projectName}`);
    console.log(`  Weeks needing repair: ${weeks.cnt}`);
    if (dryRun) {
      console.log('  --dry-run: no changes made');
      return;
    }

    await repairProject(projectName);
    return;
  }

  // Repair all projects
  const projects = db.prepare(`
    SELECT DISTINCT p.name, p.id FROM projects p
    JOIN weekly_reports wr ON wr.project_id = p.id
    WHERE wr.commit_count > 0 AND (wr.this_week_description = '' OR wr.this_week_description IS NULL)
  `).all();

  if (projects.length === 0) {
    console.log('No projects need repair.');
    return;
  }

  console.log(`${projects.length} projects need repair:`);
  for (const p of projects) {
    const cnt = db.prepare(`
      SELECT COUNT(*) as cnt FROM weekly_reports
      WHERE project_id = ? AND commit_count > 0 AND (this_week_description = '' OR this_week_description IS NULL)
    `).get(p.id);
    console.log(`  ${p.name}: ${cnt.cnt} weeks`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no changes made');
    return;
  }

  for (const p of projects) {
    await repairProject(p.name);
  }
}

main().catch((err) => {
  console.error('Repair failed:', err);
  process.exit(1);
});

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'weekly.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      clone_url TEXT,
      default_branch TEXT DEFAULT 'main',
      last_analyzed_sha TEXT,
      active INTEGER DEFAULT 1
    );

    `);
    try { db.exec('ALTER TABLE projects ADD COLUMN last_analyzed_sha TEXT'); } catch {}

    db.exec(`

    CREATE TABLE IF NOT EXISTS weekly_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id),
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      commit_count INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      additions INTEGER DEFAULT 0,
      deletions INTEGER DEFAULT 0,
      top_authors TEXT DEFAULT '[]',
      commit_messages TEXT DEFAULT '[]',
      summary TEXT,
      raw_log TEXT DEFAULT '',
      this_week_description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, week_start)
    );

    CREATE TABLE IF NOT EXISTS project_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) UNIQUE,
      target TEXT NOT NULL,
      description TEXT,
      set_at DATE,
      overall_progress TEXT,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS qa_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start DATE,
      question TEXT,
      answer TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function upsertProject(project) {
  const stmt = db.prepare(`
    INSERT INTO projects (name, platform, owner, repo, clone_url, default_branch, active)
    VALUES (@name, @platform, @owner, @repo, @cloneUrl, @defaultBranch, @active)
    ON CONFLICT(name) DO UPDATE SET
      platform = @platform,
      owner = @owner,
      repo = @repo,
      clone_url = @cloneUrl,
      default_branch = @defaultBranch,
      active = @active
  `);
  return stmt.run({
    name: project.name,
    platform: project.platform,
    owner: project.owner,
    repo: project.repo,
    cloneUrl: project.cloneUrl || '',
    defaultBranch: project.defaultBranch || 'main',
    active: project.active !== false ? 1 : 0,
  });
}

function getActiveProjects() {
  return db.prepare('SELECT * FROM projects WHERE active = 1').all();
}

function getProjectByName(name) {
  return db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
}

function upsertWeeklyReport(report) {
  const stmt = db.prepare(`
    INSERT INTO weekly_reports (project_id, week_start, week_end, commit_count, files_changed, additions, deletions, top_authors, commit_messages, summary, raw_log, this_week_description)
    VALUES (@project_id, @week_start, @week_end, @commit_count, @files_changed, @additions, @deletions, @top_authors, @commit_messages, @summary, @raw_log, @this_week_description)
    ON CONFLICT(project_id, week_start) DO UPDATE SET
      commit_count = @commit_count,
      files_changed = @files_changed,
      additions = @additions,
      deletions = @deletions,
      top_authors = @top_authors,
      commit_messages = @commit_messages,
      summary = @summary,
      raw_log = @raw_log,
      this_week_description = @this_week_description
  `);
  return stmt.run({
    project_id: report.projectId,
    week_start: report.weekStart,
    week_end: report.weekEnd,
    commit_count: report.commitCount || 0,
    files_changed: report.filesChanged || 0,
    additions: report.additions || 0,
    deletions: report.deletions || 0,
    top_authors: JSON.stringify(report.topAuthors || []),
    commit_messages: JSON.stringify(report.commitMessages || []),
    summary: report.summary || '',
    raw_log: report.rawLog || '',
    this_week_description: report.thisWeekDescription || '',
  });
}

function getWeeklyReports(weekStart) {
  return db.prepare(`
    SELECT wr.*, p.name as project_name, p.platform, p.owner, p.repo
    FROM weekly_reports wr
    JOIN projects p ON wr.project_id = p.id
    WHERE wr.week_start = ?
    ORDER BY p.name ASC
  `).all(weekStart);
}

function getAllWeekStarts() {
  return db.prepare('SELECT DISTINCT week_start FROM weekly_reports ORDER BY week_start DESC').all();
}

function getWeekReportForProject(projectId, weekStart) {
  return db.prepare('SELECT * FROM weekly_reports WHERE project_id = ? AND week_start = ?').get(projectId, weekStart);
}

function upsertProjectTarget(projectId, target) {
  const overall = target.overallProgress || '';
  const stmt = db.prepare(`
    INSERT INTO project_targets (project_id, target, description, set_at, overall_progress, active)
    VALUES (@projectId, @target, @description, @setAt, @overallProgress, 1)
    ON CONFLICT(project_id) DO UPDATE SET
      target = @target,
      description = @description,
      set_at = @setAt,
      overall_progress = CASE WHEN @overallProgress != '' THEN @overallProgress ELSE overall_progress END
  `);
  return stmt.run({
    projectId,
    target: target.goal,
    description: target.description || '',
    setAt: target.setAt || null,
    overallProgress: overall,
  });
}

function getTargetForProject(projectId) {
  return db.prepare('SELECT * FROM project_targets WHERE project_id = ? AND active = 1').get(projectId);
}


function getLastAnalyzedSha(projectId) {
  const row = db.prepare('SELECT last_analyzed_sha FROM projects WHERE id = ?').get(projectId);
  return row?.last_analyzed_sha || null;
}

function setLastAnalyzedSha(projectId, sha) {
  db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(sha, projectId);
}

function getWeekSummaryStats(weekStart) {
  return db.prepare(`
    SELECT
      COUNT(DISTINCT project_id) as active_projects,
      SUM(commit_count) as total_commits,
      SUM(files_changed) as total_files_changed,
      SUM(additions) as total_additions,
      SUM(deletions) as total_deletions
    FROM weekly_reports
    WHERE week_start = ?
  `).get(weekStart);
}

function getProjectsRangeData(from, to) {
  const rows = db.prepare(`
    SELECT wr.week_start, wr.commit_count, wr.files_changed, wr.additions,
           wr.deletions, wr.top_authors, wr.commit_messages,
           p.id as project_id, p.name as project_name, p.platform, p.owner, p.repo
    FROM weekly_reports wr
    JOIN projects p ON wr.project_id = p.id
    WHERE p.active = 1
      AND wr.week_start >= ?
      AND wr.week_start <= ?
    ORDER BY p.name ASC, wr.week_start ASC
  `).all(from, to);

  // Group by project
  const projectMap = new Map();
  const weekSet = new Set();

  for (const row of rows) {
    weekSet.add(row.week_start);
    if (!projectMap.has(row.project_name)) {
      projectMap.set(row.project_name, {
        name: row.project_name,
        platform: row.platform,
        owner: row.owner,
        repo: row.repo,
        project_id: row.project_id,
        weeks: {},
        allAuthors: new Set(),
      });
    }
    const proj = projectMap.get(row.project_name);
    proj.weeks[row.week_start] = {
      commitCount: row.commit_count,
      filesChanged: row.files_changed,
      additions: row.additions,
      deletions: row.deletions,
    };
    const authors = JSON.parse(row.top_authors || '[]');
    for (const a of authors) proj.allAuthors.add(a.name || a);
  }

  const weekLabels = Array.from(weekSet).sort();

  const projects = [];
  for (const proj of projectMap.values()) {
    const target = getTargetForProject(proj.project_id);
    const weeklyActivity = weekLabels.map(
      (w) => (proj.weeks[w] ? proj.weeks[w].commitCount : 0)
    );
    projects.push({
      name: proj.name,
      platform: proj.platform,
      owner: proj.owner,
      repo: proj.repo,
      target: target
        ? { goal: target.target, description: target.description, overallProgress: target.overall_progress }
        : null,
      totalCommits: weeklyActivity.reduce((a, b) => a + b, 0),
      contributors: Array.from(proj.allAuthors),
      weeklyActivity,
    });
  }

  return { projects, weekLabels };
}

function getProjectTimeline(name, from, to) {
  const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
  if (!project) return null;

  const target = getTargetForProject(project.id);

  const weeks = db.prepare(`
    SELECT * FROM weekly_reports
    WHERE project_id = ? AND week_start >= ? AND week_start <= ?
    ORDER BY week_start DESC
  `).all(project.id, from, to);

  return {
    project: {
      name: project.name,
      platform: project.platform,
      owner: project.owner,
      repo: project.repo,
    },
    target: target
      ? { goal: target.target, description: target.description, setAt: target.set_at, overallProgress: target.overall_progress }
      : null,
    weeks: weeks.map((w) => ({
      weekStart: w.week_start,
      weekEnd: w.week_end,
      commitCount: w.commit_count,
      filesChanged: w.files_changed,
      additions: w.additions,
      deletions: w.deletions,
      topAuthors: JSON.parse(w.top_authors || '[]'),
      commitMessages: (() => {
        const msgs = JSON.parse(w.commit_messages || '[]');
        return msgs.map(({ diff, files, ...rest }) => rest);
      })(),
      thisWeekDescription: w.this_week_description,
      summary: w.summary,
    })),
  };
}

module.exports = {
  getDb,
  upsertProject,
  getActiveProjects,
  getProjectByName,
  upsertWeeklyReport,
  getWeeklyReports,
  getAllWeekStarts,
  getWeekReportForProject,
  upsertProjectTarget,
  getTargetForProject,
  getWeekSummaryStats,
  getLastAnalyzedSha,
  setLastAnalyzedSha,
  getProjectsRangeData,
  getProjectTimeline,
};

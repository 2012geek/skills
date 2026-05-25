# Weekly Project Tracker — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Claude Code skill + Express web server that tracks weekly git activity across multi-platform projects and provides an LLM-powered dashboard with Q&A chat.

**Architecture:** Two layers (Express server + Claude Code skill) sharing a SQLite database. The skill handles data collection and report generation; the server handles dashboard rendering and Q&A chat via Claude API.

**Tech Stack:** Node.js 18+, Express, better-sqlite3, simple-git, @anthropic-ai/sdk, Chart.js (CDN), vanilla HTML/CSS/JS frontend

---

### Task 1: Project Scaffolding

**Files:**
- Create: `weekly-tracker/package.json`
- Create: `weekly-tracker/SKILL.md`
- Create: `weekly-tracker/config.example.json`
- Create: `weekly-tracker/.gitignore`

**Step 1: Create directory structure**

```bash
mkdir -p weekly-tracker/{lib,agents,scripts,public}
```

**Step 2: Write package.json**

```json
{
  "name": "weekly-tracker",
  "version": "1.0.0",
  "description": "Multi-platform weekly git activity tracker with LLM-powered dashboard and Q&A",
  "main": "server.js",
  "scripts": {
    "collect": "node scripts/collect.js",
    "serve": "node scripts/serve.js",
    "summary": "node scripts/collect.js --summary-only"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "express": "^4.21.0",
    "simple-git": "^3.25.0",
    "@anthropic-ai/sdk": "^0.32.0"
  }
}
```

Run: `cd weekly-tracker && npm install`
Expected: dependencies install without errors.

**Step 3: Write SKILL.md**

```markdown
---
name: weekly-tracker
description: "Weekly multi-project git activity tracker. Use when you need to collect weekly git commits across projects, generate LLM-powered progress reports, or start the dashboard server. Supports GitHub, AtomicGit, GitLab, and other git platforms."
---

# Weekly Project Tracker

## Overview

Tracks weekly git activity across multiple projects on different platforms (GitHub, AtomicGit, GitLab, etc.). Features a web dashboard with LLM-generated progress summaries and a Q&A chat powered by Claude API.

## Commands

- `/weekly-tracker collect` — Pull this week's git data and generate reports
- `/weekly-tracker serve` — Start the web dashboard server
- `/weekly-tracker summary` — Print the LLM weekly summary to terminal

## Setup

1. Copy `config.example.json` to `config.json` and configure your projects
2. Set platform tokens (e.g., `GITHUB_TOKEN`, `ATOMICGIT_TOKEN`) as env vars
3. Run `npm run collect` to pull your first weekly report
4. Run `npm run serve` to start the dashboard at http://localhost:3456

## Configuration

See `config.example.json` for the full configuration format. Each project needs: name, platform, owner, repo, cloneUrl. Optional: target goal with description and set date.
```

**Step 4: Write config.example.json**

```json
{
  "projects": [
    {
      "name": "example-project",
      "platform": "github",
      "owner": "my-org",
      "repo": "my-repo",
      "cloneUrl": "git@github.com:my-org/my-repo.git",
      "defaultBranch": "main",
      "active": true,
      "target": {
        "goal": "Example target goal",
        "description": "Optional longer description of the target",
        "setAt": "2026-01-01"
      }
    }
  ],
  "platforms": {
    "github": {
      "tokenEnv": "GITHUB_TOKEN"
    },
    "atomicgit": {
      "tokenEnv": "ATOMICGIT_TOKEN",
      "apiUrl": "https://api.atomicgit.com"
    },
    "gitlab": {
      "tokenEnv": "GITLAB_TOKEN",
      "apiUrl": "https://gitlab.com"
    }
  },
  "schedule": {
    "dayOfWeek": "monday",
    "time": "09:00"
  },
  "server": {
    "port": 3456,
    "host": "0.0.0.0"
  }
}
```

**Step 5: Write .gitignore**

```
node_modules/
weekly.db
config.json
*.log
```

**Step 6: Commit**

```bash
git add weekly-tracker/
git commit -m "feat: scaffold weekly-tracker skill with package.json and SKILL.md"
```

---

### Task 2: Database Layer

**Files:**
- Create: `weekly-tracker/lib/db.js`

**Step 1: Write db.js**

```javascript
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
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      clone_url TEXT,
      default_branch TEXT DEFAULT 'main',
      active INTEGER DEFAULT 1
    );

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
      project_id INTEGER REFERENCES projects(id),
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

// --- Projects ---

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

// --- Weekly Reports ---

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
    ORDER BY wr.commit_count DESC
  `).all(weekStart);
}

function getAllWeekStarts() {
  return db.prepare('SELECT DISTINCT week_start FROM weekly_reports ORDER BY week_start DESC').all();
}

function getWeekReportForProject(projectId, weekStart) {
  return db.prepare('SELECT * FROM weekly_reports WHERE project_id = ? AND week_start = ?').get(projectId, weekStart);
}

// --- Project Targets ---

function upsertProjectTarget(projectId, target) {
  const stmt = db.prepare(`
    INSERT INTO project_targets (project_id, target, description, set_at, overall_progress, active)
    VALUES (@projectId, @target, @description, @setAt, @overallProgress, 1)
    ON CONFLICT(project_id) DO UPDATE SET
      target = @target,
      description = @description,
      set_at = @setAt,
      overall_progress = @overallProgress
  `);
  return stmt.run({
    projectId,
    target: target.goal,
    description: target.description || '',
    setAt: target.setAt || null,
    overallProgress: target.overallProgress || '',
  });
}

function getTargetForProject(projectId) {
  return db.prepare('SELECT * FROM project_targets WHERE project_id = ? AND active = 1').get(projectId);
}

// --- Q&A Cache ---

function getCachedAnswer(weekStart, question) {
  return db.prepare('SELECT * FROM qa_cache WHERE week_start = ? AND question = ?').get(weekStart, question);
}

function cacheAnswer(weekStart, question, answer) {
  db.prepare('INSERT OR REPLACE INTO qa_cache (week_start, question, answer) VALUES (?, ?, ?)').run(weekStart, question, answer);
}

// --- Aggregation ---

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
  getCachedAnswer,
  cacheAnswer,
  getWeekSummaryStats,
};
```

**Step 2: Test that the module loads**

Run: `cd weekly-tracker && node -e "const db = require('./lib/db'); db.getDb(); console.log('DB initialized OK')"`
Expected: `DB initialized OK` (creates weekly.db if not exists)

**Step 3: Commit**

```bash
git add weekly-tracker/lib/db.js
git commit -m "feat: add SQLite database layer with schema and CRUD operations"
```

---

### Task 3: Config Loader

**Files:**
- Create: `weekly-tracker/lib/config.js`

**Step 1: Write config.js**

```javascript
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found. Copy config.example.json to config.json and edit it.');
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  validateConfig(config);
  return config;
}

function validateConfig(config) {
  if (!config.projects || !Array.isArray(config.projects)) {
    console.error('config.json must have a "projects" array');
    process.exit(1);
  }
  for (const p of config.projects) {
    if (!p.name || !p.platform || !p.owner || !p.repo || !p.cloneUrl) {
      console.error(`Project "${p.name || 'unknown'}" is missing required fields: name, platform, owner, repo, cloneUrl`);
      process.exit(1);
    }
    const platformConfig = config.platforms?.[p.platform];
    if (!platformConfig) {
      console.error(`Platform "${p.platform}" for project "${p.name}" is not defined in config.platforms`);
      process.exit(1);
    }
    const tokenEnv = platformConfig.tokenEnv;
    if (tokenEnv && !process.env[tokenEnv]) {
      console.warn(`Warning: ${tokenEnv} is not set. Pulling "${p.name}" may fail.`);
    }
  }
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const fmt = (d) => d.toISOString().split('T')[0];
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

module.exports = { loadConfig, getWeekRange };
```

**Step 2: Test config loading**

Run: `cd weekly-tracker && node -e "const { loadConfig } = require('./lib/config'); loadConfig(); console.log('Config loaded OK')"`
Expected: Error about missing config.json (since it doesn't exist yet — expected)

**Step 3: Commit**

```bash
git add weekly-tracker/lib/config.js
git commit -m "feat: add config loader with validation and week range helper"
```

---

### Task 4: Multi-Platform Git Collector

**Files:**
- Create: `weekly-tracker/lib/git-collector.js`

**Step 1: Write git-collector.js**

```javascript
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.tmpdir(), 'weekly-tracker-cache');

async function collectProjectCommits(project, weekStart, weekEnd) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const git = simpleGit();

  // Clone or pull
  if (fs.existsSync(path.join(repoDir, '.git'))) {
    try {
      await git.cwd(repoDir).fetch('origin');
      await git.cwd(repoDir).checkout(project.defaultBranch || 'main');
      await git.cwd(repoDir).pull('origin', project.defaultBranch || 'main');
    } catch (err) {
      console.warn(`Pull failed for ${project.name}, using cached data: ${err.message}`);
    }
  } else {
    fs.mkdirSync(repoDir, { recursive: true });
    try {
      await git.clone(project.cloneUrl, repoDir, ['--single-branch', '--branch', project.defaultBranch || 'main']);
    } catch (err) {
      console.error(`Clone failed for ${project.name}: ${err.message}`);
      return null;
    }
  }

  const localGit = simpleGit(repoDir);

  // Get commits from this week
  const logResult = await localGit.log([
    '--after', weekStart,
    '--before', weekEnd,
    '--no-merges',
  ]);

  const commits = logResult.all || [];

  if (commits.length === 0) {
    return {
      projectId: null,
      weekStart,
      weekEnd,
      commitCount: 0,
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      topAuthors: [],
      commitMessages: [],
      rawLog: '',
      thisWeekDescription: '',
    };
  }

  // Compute stats
  const authorMap = {};
  const fileSet = new Set();
  let totalAdditions = 0;
  let totalDeletions = 0;
  const commitMessages = [];

  for (const commit of commits) {
    const author = commit.author_name;
    authorMap[author] = (authorMap[author] || 0) + 1;

    commitMessages.push({
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      author,
      date: commit.date,
    });

    // Get diff stats per commit
    try {
      const diff = await localGit.diff(['--stat', commit.hash, `${commit.hash}~1`]);
      const lines = diff.split('\n');
      for (const line of lines) {
        const match = line.match(/(\d+) insertion.*?(\d+) deletion/);
        if (match) {
          totalAdditions += parseInt(match[1]) || 0;
          totalDeletions += parseInt(match[2]) || 0;
        }
        const fileMatch = line.match(/^\s*(\S.+?)\s+\|/);
        if (fileMatch) fileSet.add(fileMatch[1].trim());
      }
    } catch {
      // Skip diff for this commit
    }
  }

  const topAuthors = Object.entries(authorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, commits: count }));

  const rawLog = commits.map((c) => `${c.hash.substring(0, 7)} ${c.author_name}: ${c.message}`).join('\n');

  return {
    projectId: null,
    weekStart,
    weekEnd,
    commitCount: commits.length,
    filesChanged: fileSet.size,
    additions: totalAdditions,
    deletions: totalDeletions,
    topAuthors,
    commitMessages,
    rawLog,
    thisWeekDescription: '',
  };
}

module.exports = { collectProjectCommits };
```

**Step 2: Test module loads**

Run: `cd weekly-tracker && node -e "const { collectProjectCommits } = require('./lib/git-collector'); console.log('git-collector loaded OK')"`
Expected: `git-collector loaded OK`

**Step 3: Commit**

```bash
git add weekly-tracker/lib/git-collector.js
git commit -m "feat: add multi-platform git collector with clone/pull and stat computation"
```

---

### Task 5: LLM Integration

**Files:**
- Create: `weekly-tracker/lib/llm.js`

**Step 1: Write llm.js**

```javascript
const Anthropic = require('@anthropic-ai/sdk');

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not set. LLM features will be disabled.');
      return null;
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

async function generateWeeklySummary(reports, projectTargets) {
  const claude = getClient();
  if (!claude) return 'LLM summary unavailable (ANTHROPIC_API_KEY not set).';

  const context = reports.map((r) => ({
    project: r.project_name || r.projectName,
    commits: r.commit_count || r.commitCount,
    authors: JSON.parse(typeof r.top_authors === 'string' ? r.top_authors : '[]'),
    target: projectTargets[r.project_name || r.projectName] || null,
    commits_detail: (JSON.parse(typeof r.commit_messages === 'string' ? r.commit_messages : '[]') || []).slice(0, 30),
  }));

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a project analyst. Write a concise weekly summary (2-3 paragraphs) based on the provided git commit data. Highlight key themes, notable changes, and progress toward project targets. Be specific and reference actual commits and authors. Do not fabricate information not present in the data.',
    messages: [{
      role: 'user',
      content: `Weekly project data:\n${JSON.stringify(context, null, 2)}\n\nWrite the weekly summary.`,
    }],
  });

  return msg.content[0].text;
}

async function askQuestion(question, weekData) {
  const claude = getClient();
  if (!claude) return 'Q&A unavailable (ANTHROPIC_API_KEY not set).';

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a project analyst. Answer questions about the projects using ONLY the provided git commit data. If the data does not contain the answer, say so. Cite specific commits (hash and author) when relevant. Be concise.',
    messages: [{
      role: 'user',
      content: `Git commit data for the week:\n${JSON.stringify(weekData, null, 2)}\n\nQuestion: ${question}`,
    }],
  });

  return msg.content[0].text;
}

async function generateProgressDescription(commits, projectName, target) {
  const claude = getClient();
  if (!claude) return '';

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'You describe project progress concisely based on git commits. Write 1-3 sentences describing what was accomplished this week for a specific project. Be specific about what changed.',
    messages: [{
      role: 'user',
      content: `Project: ${projectName}\nTarget: ${target?.goal || 'none'}\nThis week's commits:\n${commits.map((c) => `${c.hash} ${c.author}: ${c.message}`).join('\n')}\n\nDescribe this week's progress in 1-3 sentences.`,
    }],
  });

  return msg.content[0].text;
}

async function generateOverallProgress(allCommitMessages, projectName, target) {
  const claude = getClient();
  if (!claude) return '';

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'You describe overall project progress concisely based on all git commits since the target was set. Describe what has been completed, what is in progress, and what remains.',
    messages: [{
      role: 'user',
      content: `Project: ${projectName}\nTarget: ${target?.goal || 'none'}\nAll commits since target was set:\n${allCommitMessages.join('\n')}\n\nDescribe the overall progress in 1-3 sentences.`,
    }],
  });

  return msg.content[0].text;
}

module.exports = { generateWeeklySummary, askQuestion, generateProgressDescription, generateOverallProgress };
```

**Step 2: Test module loads**

Run: `cd weekly-tracker && node -e "const llm = require('./lib/llm'); console.log('llm.js loaded OK')"`
Expected: `llm.js loaded OK` (with warning about missing API key, which is fine)

**Step 3: Commit**

```bash
git add weekly-tracker/lib/llm.js
git commit -m "feat: add LLM integration for summaries, Q&A, and progress descriptions"
```

---

### Task 6: Data Collection Script

**Files:**
- Create: `weekly-tracker/scripts/collect.js`

**Step 1: Write collect.js**

```javascript
#!/usr/bin/env node

const { getDb, upsertProject, getActiveProjects, upsertWeeklyReport, upsertProjectTarget, getWeeklyReports, getWeekSummaryStats } = require('../lib/db');
const { loadConfig, getWeekRange } = require('../lib/config');
const { collectProjectCommits } = require('../lib/git-collector');
const { generateWeeklySummary, generateProgressDescription, generateOverallProgress } = require('../lib/llm');

const args = process.argv.slice(2);
const summaryOnly = args.includes('--summary-only');

async function main() {
  const db = getDb();
  const config = loadConfig();
  const { weekStart, weekEnd } = getWeekRange();

  console.log(`Collecting data for week: ${weekStart} to ${weekEnd}\n`);

  // Sync projects to DB
  for (const project of config.projects) {
    const result = upsertProject(project);
    if (project.target) {
      upsertProjectTarget(result.lastInsertRowid || getDb().prepare('SELECT id FROM projects WHERE name = ?').get(project.name).id, project.target);
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

      // Generate this week's progress description
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

    // Store summary in a meta row (project_id = 0)
    const stats = getWeekSummaryStats(weekStart);
    console.log(`\n--- Week of ${weekStart} Summary ---`);
    console.log(summary);
    console.log(`\nStats: ${stats?.active_projects || 0} active projects, ${stats?.total_commits || 0} commits, ${stats?.total_files_changed || 0} files changed`);
  }

  console.log('\nCollection complete.');
}

if (summaryOnly) {
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
```

**Step 2: Test the script loads**

Run: `cd weekly-tracker && node scripts/collect.js --summary-only`
Expected: Error about missing config.json (expected — needs user to create it)

**Step 3: Commit**

```bash
git add weekly-tracker/scripts/collect.js
git commit -m "feat: add data collection script with LLM progress descriptions"
```

---

### Task 7: Express Server & API Routes

**Files:**
- Create: `weekly-tracker/server.js`

**Step 1: Write server.js**

```javascript
const express = require('express');
const path = require('path');
const { getDb, getWeeklyReports, getAllWeekStarts, getWeekReportForProject, getTargetForProject, getWeekSummaryStats, getCachedAnswer, cacheAnswer } = require('./lib/db');
const { askQuestion } = require('./lib/llm');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: Get week data
app.get('/api/week/:date', (req, res) => {
  try {
    const weekStart = req.params.date;
    const reports = getWeeklyReports(weekStart);
    const stats = getWeekSummaryStats(weekStart);

    const projects = reports.map((r) => {
      const target = getTargetForProject(r.project_id);
      return {
        name: r.project_name,
        platform: r.platform,
        owner: r.owner,
        repo: r.repo,
        commitCount: r.commit_count,
        filesChanged: r.files_changed,
        additions: r.additions,
        deletions: r.deletions,
        topAuthors: JSON.parse(r.top_authors || '[]'),
        commitMessages: JSON.parse(r.commit_messages || '[]'),
        summary: r.summary,
        thisWeekDescription: r.this_week_description,
        target: target ? {
          goal: target.target,
          description: target.description,
          setAt: target.set_at,
          overallProgress: target.overall_progress,
        } : null,
      };
    });

    res.json({ weekStart, stats, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get available weeks
app.get('/api/weeks', (_req, res) => {
  try {
    const weeks = getAllWeekStarts();
    res.json(weeks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Q&A
app.post('/api/ask', async (req, res) => {
  try {
    const { question, weekStart } = req.body;
    if (!question || !weekStart) {
      return res.status(400).json({ error: 'question and weekStart are required' });
    }

    // Check cache
    const cached = getCachedAnswer(weekStart, question);
    if (cached) {
      return res.json({ answer: cached.answer, cached: true });
    }

    const reports = getWeeklyReports(weekStart);
    if (reports.length === 0) {
      return res.json({ answer: 'No data available for that week.' });
    }

    const weekData = reports.map((r) => ({
      project: r.project_name,
      commits: r.commit_count,
      authors: JSON.parse(r.top_authors || '[]'),
      commitMessages: JSON.parse(r.commit_messages || '[]').slice(0, 50),
      progressDescription: r.this_week_description,
    }));

    const answer = await askQuestion(question, weekData);
    cacheAnswer(weekStart, question, answer);

    res.json({ answer, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
```

**Step 2: Test server loads**

Run: `cd weekly-tracker && node -e "const app = require('./server'); console.log('server.js loaded OK')"`
Expected: `server.js loaded OK`

**Step 3: Commit**

```bash
git add weekly-tracker/server.js
git commit -m "feat: add Express server with /api/week, /api/weeks, and /api/ask routes"
```

---

### Task 8: Serve Script

**Files:**
- Create: `weekly-tracker/scripts/serve.js`

**Step 1: Write serve.js**

```javascript
#!/usr/bin/env node

const app = require('../server');
const { loadConfig } = require('../lib/config');
const { getDb } = require('../lib/db');

const config = loadConfig();
const port = config.server?.port || 3456;
const host = config.server?.host || '0.0.0.0';

// Initialize DB on startup
getDb();

app.listen(port, host, () => {
  console.log(`Weekly Tracker running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop');
});
```

**Step 2: Commit**

```bash
git add weekly-tracker/scripts/serve.js
git commit -m "feat: add serve script entry point"
```

---

### Task 9: Dashboard Frontend

**Files:**
- Create: `weekly-tracker/public/dashboard.html`
- Create: `weekly-tracker/public/style.css`
- Create: `weekly-tracker/public/chat.js`

**Step 1: Write dashboard.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Project Tracker</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>Weekly Project Tracker</h1>
      <div class="week-nav">
        <button id="prev-week">←</button>
        <span id="week-label">Loading...</span>
        <button id="next-week">→</button>
        <input type="date" id="date-picker" style="display:none">
        <button id="date-picker-btn">📅</button>
      </div>
    </header>

    <section class="summary-cards" id="summary-cards">
      <div class="card"><div class="card-value" id="stat-projects">-</div><div class="card-label">Active Projects</div></div>
      <div class="card"><div class="card-value" id="stat-commits">-</div><div class="card-label">Commits</div></div>
      <div class="card"><div class="card-value" id="stat-files">-</div><div class="card-label">Files Changed</div></div>
      <div class="card"><div class="card-value" id="stat-authors">-</div><div class="card-label">Authors</div></div>
    </section>

    <section class="project-table" id="project-table">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>Commits</th>
            <th>Authors</th>
            <th>Target</th>
            <th>Overall</th>
            <th>This Week</th>
          </tr>
        </thead>
        <tbody id="project-rows"></tbody>
      </table>
    </section>

    <section class="ai-summary" id="ai-summary">
      <h2>AI Weekly Summary</h2>
      <p id="summary-text">Select a week to see the summary.</p>
    </section>

    <section class="qa-panel" id="qa-panel">
      <h2>Ask About Your Projects</h2>
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input">
        <input type="text" id="question-input" placeholder="e.g., what did Zhang San work on this week?">
        <button id="ask-btn">Ask</button>
      </div>
    </section>
  </div>

  <script src="/chat.js"></script>
</body>
</html>
```

**Step 2: Write style.css**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
.container { max-width: 1200px; margin: 0 auto; padding: 20px; }

header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
header h1 { font-size: 24px; }
.week-nav { display: flex; gap: 8px; align-items: center; }
.week-nav button { padding: 6px 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer; }

.summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.card { background: #fff; padding: 16px; border-radius: 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.card-value { font-size: 28px; font-weight: bold; color: #2563eb; }
.card-label { font-size: 13px; color: #666; margin-top: 4px; }

.project-table { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; overflow: hidden; }
.project-table table { width: 100%; border-collapse: collapse; }
.project-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.project-table td { padding: 10px 14px; font-size: 14px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
.project-table tr:hover td { background: #f8fafc; }

.commit-detail { display: none; background: #f8fafc; }
.commit-detail.open { display: table-row; }
.commit-detail td { padding: 8px 14px 8px 30px; font-size: 12px; color: #555; border-bottom: 1px solid #e2e8f0; }
.commit-detail .hash { font-family: monospace; color: #2563eb; margin-right: 8px; }
.commit-detail .author { color: #888; }

.ai-summary { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
.ai-summary h2 { font-size: 16px; margin-bottom: 12px; }

.qa-panel { background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.qa-panel h2 { font-size: 16px; margin-bottom: 12px; }
.chat-messages { max-height: 400px; overflow-y: auto; margin-bottom: 12px; }
.chat-messages .msg { margin-bottom: 10px; padding: 8px 12px; border-radius: 6px; }
.chat-messages .msg.user { background: #e8f0fe; }
.chat-messages .msg.assistant { background: #f0fdf4; }
.chat-input { display: flex; gap: 8px; }
.chat-input input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; }
.chat-input button { padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; }

.expand-btn { cursor: pointer; color: #2563eb; font-size: 12px; }
</style>
```

**Step 3: Write chat.js**

```javascript
let currentWeek = '';

// Week navigation
async function loadWeeks() {
  const res = await fetch('/api/weeks');
  const weeks = await res.json();
  if (weeks.length > 0) {
    currentWeek = weeks[0].week_start;
    loadWeek(currentWeek);
  } else {
    document.getElementById('week-label').textContent = 'No data yet';
  }
}

async function loadWeek(weekStart) {
  currentWeek = weekStart;
  document.getElementById('week-label').textContent = `Week of ${weekStart}`;

  const res = await fetch(`/api/week/${weekStart}`);
  const data = await res.json();

  // Summary cards
  const stats = data.stats || {};
  document.getElementById('stat-projects').textContent = stats.active_projects || 0;
  document.getElementById('stat-commits').textContent = stats.total_commits || 0;
  document.getElementById('stat-files').textContent = stats.total_files_changed || 0;
  document.getElementById('stat-authors').textContent = new Set(
    data.projects.flatMap(p => (p.topAuthors || []).map(a => a.name))
  ).size || 0;

  // Project table
  const tbody = document.getElementById('project-rows');
  tbody.innerHTML = '';

  for (const p of data.projects) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${esc(p.name)}</strong><br><span style="font-size:12px;color:#888">${esc(p.platform)}/${esc(p.owner)}/${esc(p.repo)}</span></td>
      <td><span class="expand-btn" data-project="${esc(p.name)}">${p.commitCount} ▼</span></td>
      <td>${p.topAuthors.length}</td>
      <td>${p.target ? esc(p.target.goal) : '<span style="color:#999">—</span>'}</td>
      <td style="font-size:13px">${p.target?.overallProgress || '<span style="color:#999">—</span>'}</td>
      <td style="font-size:13px">${p.thisWeekDescription || (p.commitCount === 0 ? '<span style="color:#999">No activity</span>' : '<span style="color:#999">—</span>')}</td>
    `;

    // Expandable commit detail row
    const detailTr = document.createElement('tr');
    detailTr.className = 'commit-detail';
    detailTr.id = `detail-${p.name.replace(/\W/g, '_')}`;
    detailTr.innerHTML = `<td colspan="6">${p.commitMessages.map(c =>
      `<span class="hash">${esc(c.hash)}</span> ${esc(c.message)} <span class="author">(${esc(c.author)})</span>`
    ).join('<br>') || 'No commits'}</td>`;

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  }

  // AI Summary — collect from projects with summaries or use first non-empty
  const summaryProject = data.projects.find(p => p.summary);
  const summaryEl = document.getElementById('summary-text');
  if (summaryProject && summaryProject.summary) {
    summaryEl.textContent = summaryProject.summary;
  } else {
    summaryEl.textContent = data.projects.length === 0
      ? 'No project data for this week. Run `npm run collect` to pull data.'
      : 'No summary available for this week.';
  }

  // Attach expand handlers
  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = `detail-${btn.dataset.project.replace(/\W/g, '_')}`;
      document.getElementById(id).classList.toggle('open');
    });
  });
}

// Q&A
document.getElementById('ask-btn').addEventListener('click', async () => {
  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question) return;

  const messages = document.getElementById('chat-messages');
  messages.innerHTML += `<div class="msg user"><strong>You:</strong> ${esc(question)}</div>`;
  input.value = '';

  messages.innerHTML += `<div class="msg assistant"><em>Thinking...</em></div>`;

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, weekStart: currentWeek }),
    });
    const data = await res.json();

    messages.lastChild.innerHTML = `<strong>AI:</strong> ${esc(data.answer)}`;
  } catch (err) {
    messages.lastChild.innerHTML = `<strong>Error:</strong> ${esc(err.message)}`;
  }

  messages.scrollTop = messages.scrollHeight;
});

// Navigation
document.getElementById('prev-week').addEventListener('click', async () => {
  const weeks = await (await fetch('/api/weeks')).json();
  const idx = weeks.findIndex(w => w.week_start === currentWeek);
  if (idx < weeks.length - 1) loadWeek(weeks[idx + 1].week_start);
});

document.getElementById('next-week').addEventListener('click', async () => {
  const weeks = await (await fetch('/api/weeks')).json();
  const idx = weeks.findIndex(w => w.week_start === currentWeek);
  if (idx > 0) loadWeek(weeks[idx - 1].week_start);
});

document.getElementById('date-picker-btn').addEventListener('click', () => {
  const picker = document.getElementById('date-picker');
  picker.style.display = picker.style.display === 'none' ? 'inline' : 'none';
  picker.focus();
});

document.getElementById('date-picker').addEventListener('change', (e) => {
  const d = new Date(e.target.value);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  loadWeek(monday.toISOString().split('T')[0]);
});

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Init
loadWeeks();
```

**Step 4: Test frontend loads**

Run: `cd weekly-tracker && node -e "const fs = require('fs'); ['dashboard.html', 'style.css', 'chat.js'].forEach(f => { if (!fs.existsSync('public/'+f)) throw new Error(f + ' missing') }); console.log('All frontend files present')"`
Expected: `All frontend files present`

**Step 5: Commit**

```bash
git add weekly-tracker/public/
git commit -m "feat: add dashboard frontend with project table, Q&A chat, and history navigation"
```

---

### Task 10: Weekly Summarizer Agent

**Files:**
- Create: `weekly-tracker/agents/weekly-summarizer.md`

**Step 1: Write weekly-summarizer.md**

```markdown
---
name: weekly-summarizer
description: Generates a concise weekly summary from git commit data across multiple projects
model: claude-sonnet-4-6
---

# Weekly Summarizer Agent

You are a project analyst. Your task is to generate a weekly summary based on git commit data from multiple projects.

## Input Format

You will receive JSON data containing per-project commit statistics:
- Project name and platform
- Commit count, files changed, additions/deletions
- Top authors with commit counts
- Commit messages (hash, message, author, date)
- Project target goal (if set)
- Previous overall progress (if available)

## Output

Write a 2-3 paragraph summary covering:

1. **Overall activity** — total commits, projects active, busiest project
2. **Key changes** — highlight 2-4 notable changes across projects (features, fixes, refactors)
3. **Target progress** — for projects with targets, note significant progress or stalled work

## Rules

- Only reference information present in the data — do not fabricate
- Cite specific projects and authors by name
- Keep each paragraph under 3 sentences
- Be specific: "project-a shipped the token refresh fix (commit e4f5g6h by Li Si)" not "some projects made progress"
```

**Step 2: Commit**

```bash
git add weekly-tracker/agents/weekly-summarizer.md
git commit -m "feat: add weekly summarizer LLM agent"
```

---

### Task 11: Integration Test

**Files:**
- Create: `weekly-tracker/test/integration.test.js`

**Step 1: Write integration test**

```javascript
const { getDb } = require('../lib/db');
const { getWeekRange } = require('../lib/config');
const app = require('../server');
const http = require('http');

let server;

beforeAll((done) => {
  // Use in-memory DB by setting env
  process.env.SQLITE_PATH = ':memory:';
  server = http.createServer(app);
  server.listen(0, done);
});

afterAll((done) => {
  server.close(done);
});

function getPort() {
  return server.address().port;
}

function fetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://localhost:${getPort()}`);
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, body }); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

test('GET /api/weeks returns array', async () => {
  const res = await fetch('/api/weeks');
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('GET /api/week/:date returns structure', async () => {
  const { weekStart } = getWeekRange();
  const res = await fetch(`/api/week/${weekStart}`);
  expect(res.status).toBe(200);
  expect(res.body).toHaveProperty('weekStart');
  expect(res.body).toHaveProperty('projects');
  expect(res.body).toHaveProperty('stats');
});

test('POST /api/ask validates input', async () => {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: {},
  });
  expect(res.status).toBe(400);
});

test('GET / serves dashboard HTML', async () => {
  const url = new URL('/', `http://localhost:${getPort()}`);
  const req = http.request(url, { method: 'GET' }, (res) => {
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
  req.end();
});
```

**Step 2: Add test script to package.json**

Edit `weekly-tracker/package.json`: add `"test": "jest"` to scripts, add `jest` to devDependencies.

Run: `cd weekly-tracker && npm install --save-dev jest`

**Step 3: Run tests**

Run: `cd weekly-tracker && npx jest --testPathPattern=test/integration.test.js`
Expected: Tests pass (4 passing)

**Step 4: Commit**

```bash
git add weekly-tracker/test/ weekly-tracker/package.json weekly-tracker/package-lock.json
git commit -m "test: add integration tests for API routes"
```

---

### Implementation Order

1. Task 1: Scaffolding
2. Task 2: Database Layer
3. Task 3: Config Loader
4. Task 4: Git Collector
5. Task 5: LLM Integration
6. Task 6: Data Collection Script
7. Task 7: Express Server & API
8. Task 8: Serve Script
9. Task 9: Dashboard Frontend
10. Task 10: Weekly Summarizer Agent
11. Task 11: Integration Tests

**Total estimated time:** ~2 hours

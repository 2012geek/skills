# Weekly Project Tracker — Design Document

**Date:** 2026-05-25
**Status:** Approved

## Overview

A Claude Code skill + lightweight Express web server that tracks weekly git activity across 15-50 projects on multiple git platforms (GitHub, AtomicGit, GitLab, etc.). Generates weekly reports with LLM summaries and provides a Q&A chat interface grounded in actual commit data.

## Architecture

Two layers sharing one SQLite database:

```
Web Server (Express)
├── Dashboard (weekly overview, project activity, commit details)
├── Q&A Chat (RAG-powered, Claude API)
└── API Layer (REST)

         ↓↑ SQLite (weekly.db)

Claude Code Skill
├── Git Collector (multi-platform)
├── Report Generator (stats + LLM summary)
└── Weekly Summarizer Agent
```

**Directory structure:**

```
weekly-tracker/
├── SKILL.md
├── package.json
├── server.js
├── lib/
│   ├── git-collector.js
│   ├── report-generator.js
│   ├── db.js
│   └── llm.js
├── agents/
│   └── weekly-summarizer.md
├── scripts/
│   ├── collect.js
│   └── serve.js
├── public/
│   ├── dashboard.html
│   ├── chat.js
│   └── style.css
└── config.json
```

## Data Model

```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  clone_url TEXT,
  default_branch TEXT DEFAULT 'main',
  active INTEGER DEFAULT 1
);

CREATE TABLE weekly_reports (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  commit_count INTEGER,
  files_changed INTEGER,
  additions INTEGER,
  deletions INTEGER,
  top_authors JSON,
  commit_messages JSON,
  summary TEXT,
  raw_log TEXT,
  this_week_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, week_start)
);

CREATE TABLE project_targets (
  id INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  target TEXT NOT NULL,
  description TEXT,
  set_at DATE,
  overall_progress TEXT,
  active INTEGER DEFAULT 1
);

CREATE TABLE qa_cache (
  id INTEGER PRIMARY KEY,
  week_start DATE,
  question TEXT,
  answer TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Dashboard Design

### Summary Cards
Projects active, Commits total, Files changed, Authors count — for the selected week.

### Project Activity Table
Per-project rows showing: commit count, author count, target goal, overall progress (LLM-generated description), and this week's progress (LLM-generated description based on the week's commits).

### Per-Project Detail (expandable)
Each project row expands to show the full commit list with hash, message, and author — newest first.

### AI Weekly Summary
LLM-generated paragraph summarizing the week's activity across all projects.

### History Navigation
Arrow buttons + date picker to browse past weeks.

## Q&A Chat

RAG-based chat panel that answers free-form questions about project activity. Flow:

1. User asks a question → server retrieves relevant week's data from SQLite
2. Server sends question + commit data as context to Claude API
3. Response streams back to the chat UI

Example questions: "who worked on project-a?", "what features were added?", "compare this week to last week", "show me all of Zhang San's commits".

## Config Format

```json
{
  "projects": [
    {
      "name": "project-a",
      "platform": "github",
      "owner": "my-org",
      "repo": "auth-service",
      "cloneUrl": "git@github.com:my-org/auth-service.git",
      "active": true,
      "target": {
        "goal": "Auth v2.0 refactor",
        "description": "Refactor authentication from JWT to session-based",
        "setAt": "2026-04-01"
      }
    }
  ],
  "platforms": {
    "github": { "tokenEnv": "GITHUB_TOKEN" },
    "atomicgit": { "tokenEnv": "ATOMICGIT_TOKEN", "apiUrl": "https://api.atomicgit.com" }
  },
  "schedule": { "dayOfWeek": "monday", "time": "09:00" },
  "server": { "port": 3456, "host": "0.0.0.0" }
}
```

## Skill Usage

```
/weekly-tracker collect     → pull this week's data and generate report
/weekly-tracker serve       → start the web server
/weekly-tracker summary     → print LLM summary to terminal
```

## Error Handling

| Scenario | Handling |
|----------|----------|
| Git clone fails | Log error, skip project, report as "unreachable" |
| Token missing/expired | Show clear error with env var name |
| LLM API fails | Fallback to template-based summary, flag in UI |
| No commits this week | Show project as "no activity" with last active date |
| Duplicate week pull | Skip via UNIQUE constraint, log "already collected" |
| Port conflict | Detect, warn, offer to kill old process |

## Excluded
- Daily breakdown chart
- Author leaderboard
- Percentage-based progress bars

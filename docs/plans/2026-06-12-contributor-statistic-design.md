# contributor-statistic Skill Design

## Overview

A Claude Code skill that clones a GitHub repository, analyzes each contributor's activity using git commands, uses LLM agents to judge commit importance and write narrative summaries, and generates a Chinese-language `report.md` with a summary table and detailed per-contributor profiles.

## Architecture

```
contributor-statistic/
├── SKILL.md                     # Skill definition
├── README.md                    # User-facing docs
├── package.json                 # Dependencies (simple-git, @anthropic-ai/sdk)
├── config.json                  # Optional LLM/filter config
├── scripts/
│   └── analyze.js               # Main entry: clone → analyze → generate report
├── lib/
│   ├── git-analyzer.js          # Runs git commands, parses output, groups by contributor
│   ├── commit-filter.js         # Size-based candidate filtering (>100 lines changed)
│   ├── llm-runner.js            # Runs LLM agents for importance judgment and narratives
│   ├── report-generator.js      # Builds markdown report from analyzed data
│   └── github-url.js            # Constructs commit/PR URLs from repo remote origin
├── agents/
│   ├── commit-importance.md     # LLM agent: judges which commits are important per contributor
│   └── contributor-summary.md   # LLM agent: writes narrative summary per contributor
└── tests/
    ├── test-git-analyzer.test.js
    ├── test-commit-filter.test.js
    └── test-report-generator.test.js
```

## Data Flow (6-Step Pipeline)

```
1. Clone repo      → git clone <url> to temp dir (or use --repo-path for local)
2. Extract data    → git shortlog -sn, git log --format/--numstat for per-contributor stats
3. Size filter     → auto-include commits with >100 lines changed as candidates
4. LLM importance  → commit-importance agent picks top N important commits per person
5. LLM narrative   → contributor-summary agent writes Chinese narrative per person
6. Generate report → assemble summary table + per-person profiles into report.md
```

### Step 1 — Clone

Uses `simple-git` to clone the specified repo URL into a temp directory. `--repo-path` allows analyzing a local repo instead. Temp clone is cleaned up after analysis unless `--keep-clone` is passed.

### Step 2 — Extract

Git commands executed:
- `git shortlog -sn --all` — ranked contributor list by commit count
- `git log --format="%H|%an|%ae|%ai|%s" --all` — full commit history
- `git log --numstat --format="%H|%an" --all` — lines added/removed per commit per author
- `git log --format="%H" --diff-filter=A --all` — files each contributor created

### Step 3 — Size Filter

Commits changing >100 lines (additions + deletions) are auto-included as importance candidates. No hardcoded keyword filtering — importance is determined by the LLM agent.

### Step 4 — LLM Importance Judgment

The `commit-importance` agent receives:
- Author name + email
- List of candidate commits (hash, date, subject, lines changed, files touched)
- All other commits as context (hash, subject)

Returns: ranked list of top 5 important commits with reasons why each is significant.

### Step 5 — LLM Narrative

The `contributor-summary` agent receives:
- Author name + email
- Total commits, lines changed, file categories touched
- The 5 important commits with reasons
- Time range context

Returns: Chinese natural-language narrative describing what the person did, their impact, and areas of focus.

### Step 6 — Generate Report

Builds `report.md` with:
- Header: repo name, analysis date, time range, repo URL
- Summary table: contributor | commits | lines added | lines removed | files touched
- Per-person profiles: narrative overview, contribution areas, important commits with clickable URLs

## Report Format

```markdown
# 贡献者统计报告 — <repo-name>

> 分析时间: 2026-06-12 | 时间范围: 全部历史 | 仓库: https://github.com/org/repo

## 总览

| 贡献者 | 提交数 | 新增行数 | 删除行数 | 涉及文件数 |
|--------|--------|----------|----------|------------|
| Alice  | 142    | 8,230    | 2,100    | 45         |
| Bob    | 87     | 3,500    | 1,800    | 32         |

---

## Alice (alice@example.com)

**贡献概述**: [LLM-generated narrative]

**主要贡献领域**: 认证模块、CI 流水线、核心 API

**关键提交**:
- [commit subject](https://github.com/org/repo/commit/abc123) — [importance reason from LLM]
- [commit subject](https://github.com/org/repo/commit/def456) — [importance reason from LLM]

---

*报告由 contributor-statistic skill 自动生成*
```

## CLI Interface

```bash
# Basic — clone and analyze a repo
node scripts/analyze.js --repo https://github.com/org/repo

# With time range filter (e.g. summit period)
node scripts/analyze.js --repo https://github.com/org/repo --since 2026-05-01 --until 2026-06-12

# Analyze a local repo (skip clone)
node scripts/analyze.js --repo-path /path/to/local/repo

# Output to specific file
node scripts/analyze.js --repo https://github.com/org/repo --output ./my-report.md

# Skip LLM (just stats + size-filtered commits, no narratives)
node scripts/analyze.js --repo https://github.com/org/repo --no-llm

# Keep cloned repo after analysis
node scripts/analyze.js --repo https://github.com/org/repo --keep-clone

# Filter by branch
node scripts/analyze.js --repo https://github.com/org/repo --branch main

# Filter by author
node scripts/analyze.js --repo https://github.com/org/repo --author alice
```

## Configuration

```json
{
  "anthropic": { "apiKey": "sk-ant-..." },
  "contributorStatistic": {
    "maxImportantCommits": 5,
    "lineChangeThreshold": 100
  }
}
```

No hardcoded keywords — all importance judgment is LLM-driven.

## Key Design Decisions

1. **git clone directly** — no REST API dependency, works with any git repo
2. **LLM-driven importance judgment** — no hardcoded keyword lists; the commit-importance agent decides what's significant based on context
3. **Two LLM agents** — commit-importance (picks important commits) and contributor-summary (writes narrative), keeping responsibilities separated
4. **Size threshold as candidate filter** — 100+ lines changed auto-qualifies as candidate, reducing LLM input size while still surfacing large changes
5. **Chinese output** — consistent with existing skill conventions in this repo
6. **Node.js + simple-git** — follows established skill patterns in this monorepo
7. **Full history + optional --since/--until** — supports both all-time analysis and summit-period filtering
# Weekly Tracker — New Project Backfill Design

**Date**: 2026-05-26
**Status**: Approved

## Problem

When a new project is added to `config.json` and `collect` runs for the first time, it only collects the current week's commits. The overall progress analysis is based on a narrow 1-week window, missing the full picture of a project that has months of prior history.

## Solution

On first run for a new project: backfill all past weeks (commit metadata only), generate a baseline `overall_progress` from current codebase state, then only do incremental analysis on subsequent runs.

## Schema Change

```sql
ALTER TABLE projects ADD COLUMN last_analyzed_sha TEXT;
```

- `NULL` = new project, needs backfill + baseline
- non-NULL = SHA checkpoint for incremental collection

## Detection

A project is "new" when it has no rows in `weekly_reports`:

```sql
SELECT MAX(week_start) FROM weekly_reports WHERE project_id = ?
```

Returns `NULL` → trigger backfill flow.

## Flow

### New Project (first collect run)

1. Clone repo
2. Get date of first commit: `git log --reverse --format=%ai -1`
3. Generate all [weekStart, weekEnd] ranges from first commit to last week
4. For each historical week:
   - `collectProjectCommits(project, weekStart, weekEnd)` — commit metadata only
   - `upsertWeeklyReport(data)` — no `this_week_description`, no LLM
5. Run **baseline LLM analysis** on current codebase state:
   - Read key files (package.json, entry points, config, core modules)
   - Generate comprehensive `overall_progress` → store in `project_targets`
6. Process current week with full two-stage LLM pipeline
7. Save `HEAD` SHA to `projects.last_analyzed_sha`

### Existing Project (subsequent collect runs)

1. `git pull`
2. `git log <last_analyzed_sha>..HEAD` → get only new commits
3. If no new commits → skip
4. If new commits:
   - Run existing two-stage LLM pipeline on new commits
   - Update `overall_progress` (merge with baseline)
   - Save new `HEAD` SHA to `projects.last_analyzed_sha`

### Week Transition

When `collect` runs in a new week, if there are no new commits since `last_analyzed_sha`, it still creates a `weekly_reports` row with `commit_count = 0` for the current week. This maintains the timeline even in inactive weeks.

## LLM Calls

| Scenario | Calls | Purpose |
|----------|-------|---------|
| New project backfill | 0 | Commit metadata only, no per-week analysis |
| New project baseline | 1 | Analyze current codebase state → `overall_progress` |
| New project current week | 2 | Stage 1 diff analysis + Stage 2 file synthesis → `this_week_description` |
| Incremental with new commits | 2 | Same two-stage pipeline on `lastSha..HEAD` diff |
| Incremental, no new commits | 0 | Skip |

## Key Decisions

- **Backfill is metadata-only**: historical weeks get commit count, authors, files, messages — but no LLM descriptions. Keeps API cost at 1 baseline call per new project.
- **`last_analyzed_sha` as checkpoint**: precise commit-level tracking, safe against interruptions and mid-week re-runs.
- **No schema change beyond one column**: `weekly_reports` rows for backfilled weeks have `this_week_description = NULL`, which the UI already handles.

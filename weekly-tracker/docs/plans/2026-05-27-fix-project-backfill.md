# Fix Project Data Backfill

## Problem

New projects (agent-robot, agent-chiplet-offload, verituna, agent-d3a) only show 2 weeks of history. The `getFirstCommitDate` function silently fails, causing the backfill to skip.

## Root Cause

`lib/git-collector.js` — `getFirstCommitDate` uses `git log --reverse --format=%ai -1`:

1. `--format=%ai` breaks simple-git's log parser (parsed date field is empty)
2. `git log --reverse -1` returns the HEAD commit, not the root commit

When `firstCommitDate` is null, `newProjectFlow` falls back to `new Date()` (today). Combined with the 6-month cap, this results in generating week ranges from 6 months ago to today — but since `collectProjectCommits` uses `--after/--before` for the week range (not for incremental), it only finds commits in each week's range, explaining why only 2 weeks had data.

## Fix

### 1. `lib/git-collector.js` — Fix `getFirstCommitDate`

Replace the single broken call with two efficient calls:
- `git rev-list --max-parents=0 HEAD` to find the root commit hash
- `git log -1 <hash>` to get the parsed date

### 2. `scripts/collect.js` — Remove 6-month cap

Delete the 6-month cap so backfill runs from the actual first commit.

### 3. DB reset

Clear partial data for the 4 projects and reset `last_analyzed_sha` to trigger re-backfill on next collect.

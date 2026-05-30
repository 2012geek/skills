# Fix English Weekly Descriptions

## Problem

Some weekly descriptions are generated in English instead of Chinese. The `this_week_description` field should always be in Chinese (with English technical terms/file paths mixed in).

**Affected weeks** (fully English bullet points):
- `agent-chiplet-offload 2026-05-18` — 8 commits, all English
- `agent-d3a 2026-04-13` — 90 commits, all English

## Root Cause

`generateWeeklyProgressDescription` (stage 1) asks the LLM for JSON with `completed`/`in_progress` arrays. The system prompt is in Chinese but doesn't explicitly instruct "each item must be in Chinese". When stage 2 (`synthesizeWithFiles`) isn't invoked, `formatWeeklyDescription` wraps the raw JSON items with Chinese headers (`### 已完成`) — preserving whatever language the LLM used for the array items.

## Fix

### Part 1: Enforce Chinese in LLM prompts

In `llm.js`, add explicit Chinese output requirement to:
- `generateWeeklyProgressDescription` stage 1 system prompt: add `"每项描述必须用中文撰写"`
- `formatWeeklyDescription`: no change needed (it just wraps headers)

### Part 2: Add `--fix-language` mode to `repair-descriptions.js`

New flag that:
1. Scans all weeks with `commit_count > 0` and existing descriptions
2. Detects English descriptions: if >80% of non-path characters in bullet points are ASCII
3. Re-generates only those weeks using `generateDescription`

### Part 3: Execute fix

Run the script against the 2 affected weeks to regenerate Chinese descriptions.

## Files Changed

- `lib/llm.js` — prompt language enforcement
- `scripts/repair-descriptions.js` — add `--fix-language` mode

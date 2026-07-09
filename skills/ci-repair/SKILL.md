---
name: ci-repair
description: Auto-repair GitCode MR CI failures through iterative analysis and fixing until gate checks pass
argument-hint: [MR-number]
arguments: [mr]
allowed-tools: Bash(node *) Read Edit Write AskUserQuestion
---

# GitCode CI Auto-Repair

Automatically fix CI failures on GitCode MRs. Iteratively analyzes failures, generates fixes, commits with --amend, and loops until CI passes.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set.
2. Run the repair:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/ci-repair/scripts/repair.js $mr
   ```
3. The script will:
   - Detect CI status from MR labels
   - Parse failure types from bot comments
   - Apply fixes (ruff, mypy, prettier, commit signoff)
   - Use `git commit --amend` to avoid extra commits
   - Trigger `/retest` and loop until pass
4. Report final status — did CI pass?

## Configuration

Requires `GITCODE_TOKEN` environment variable or `config.json` in project root.

---
name: pr
description: Automate GitCode PR creation and semantic PR description generation using LLM analysis
argument-hint: [PR-number]
arguments: [pr]
allowed-tools: Bash(node *) Read AskUserQuestion
---

# GitCode PR Creation Tool

Create GitCode Pull Requests with auto-generated semantic descriptions from diffs.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set.
2. Generate a semantic PR description:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/pr/scripts/generate-semantic-desc-v3.js $pr
   ```
3. Or create a PR directly:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/pr/scripts/create-pr.js
   ```
4. Report the PR URL and description to the user.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `generate-semantic-desc-v3.js` | LLM-driven semantic PR description generation (recommended) |
| `create-pr.js` | Local repo PR creation |
| `browser-pr.js` | Browser automation PR creation |

## Configuration

Requires `GITCODE_TOKEN` environment variable or `config.json` in project root.

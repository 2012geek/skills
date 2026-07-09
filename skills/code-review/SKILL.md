---
name: code-review
description: Review a GitCode Pull Request using multi-agent code review pipeline
argument-hint: [PR-number or PR-URL]
arguments: [pr]
allowed-tools: Bash(node *) Read AskUserQuestion
---

# GitCode Code Review

Review GitCode Pull Request using the multi-agent code review pipeline.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set. If not, tell the user to set it via `export GITCODE_TOKEN=<token>` or in `.env`.
2. Run the review:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/gitcode-reviewer.js --pr $pr
   ```
3. If the user wants a preview without posting comments, add --dry-run:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/gitcode-reviewer.js --pr $pr --dry-run
   ```
4. If the user wants faster review without validation, add --skip-validation.
5. Summarize the review results for the user — how many issues found, severity levels, key findings.

## Other available scripts

- Create PR: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/create-pr.js`
- Update PR: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/update-pr.js`
- Smart PR description: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/generate-smart-pr-desc.js`

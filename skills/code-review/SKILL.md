---
name: code-review
description: Review a GitCode Pull Request using multi-agent code review pipeline
argument-hint: [PR-number or PR-URL]
arguments: [pr]
allowed-tools: Bash(node *) Bash(find *) Bash(rm *) Read Agent AskUserQuestion
---

# GitCode Code Review

Review a GitCode Pull Request using the multi-agent code review pipeline. The Node.js script generates agent prompts but does not execute AI review — Claude must execute the prompts and feed results back.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set. If not, tell the user to set it via `export GITCODE_TOKEN=<token>` or in `.env`.

2. Generate agent prompts by running the reviewer script with --auto-review --dry-run --force:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/gitcode-reviewer.js --pr $pr --auto-review --dry-run --force
   ```
   This saves prompts to `.temp-review/pr-$pr-prompts.json`.

3. Read the prompts JSON file at `.temp-review/pr-$pr-prompts.json`.

4. Execute each agent prompt as a parallel Claude Agent (subagent_type="general-purpose", model="sonnet"):
   - bug-scanner-diff (agents[0])
   - bug-scanner-diff-2 (agents[1])
   - code-analyzer (agents[2])
   - semantic-analyzer (agents[3])
   - python-classmethod-checker (agents[4]) — only if the PR contains Python classmethod issues.

   Tell each agent: "Read the prompts file, follow your specific agent prompt, and output issues as JSON."

5. Collect all issues from agent outputs. Combine into a single JSON array and save to `.temp-review/pr-$pr-issues.json`:
   ```json
   [{"file":"path","line":42,"type":"bug","severity":"error","confidence":90,"title":"title","description":"desc","contextCode":"code","fix":{"code":"fix","explanation":"why"}}]
   ```

6. Feed issues back to the reviewer script for validation and posting:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/gitcode-reviewer.js --pr $pr --issues-from-json .temp-review/pr-$pr-issues.json
   ```
   For preview only (no posting), add --dry-run. For speed, add --skip-validation.

7. Clean up temp files:
   ```bash
   rm -rf .temp-review
   ```

8. Summarize the review results for the user — how many issues found, severity levels, key findings.

## Other available scripts

- Create PR: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/create-pr.js`
- Update PR: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/update-pr.js`
- Smart PR description: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review/scripts/generate-smart-pr-desc.js`

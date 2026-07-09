---
name: code-review-repair
description: Automatically repair GitCode PR review comments using LLM to generate fixes
allowed-tools: Bash Read Write Edit AskUserQuestion
---

# GitCode Code Review Repair

Automatically repairs GitCode PR review comments by fetching unresolved feedback, using LLM to generate fixes, replying to each comment with solutions, and committing with git commit --amend.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set.
2. Parse PR URL to extract owner, repo, PR number.
3. Run the repair script:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/code-review-repair/scripts/repair-pr.js
   ```
4. The script will:
   - Fetch review status and unresolved comments
   - Generate fixes using LLM
   - Reply to each review comment
   - Commit fixes with `git commit --amend`
5. Summarize the repair results — how many comments fixed, links to replies.

## Configuration

Requires `GITCODE_TOKEN` environment variable or `config.json` in project root with GitCode token and Anthropic API key.

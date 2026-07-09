---
name: code-review
description: Review GitCode pull requests with a self-contained multi-agent prompt pipeline, validate JSON review findings, and post GitCode inline comments. Use when the user asks to review a GitCode PR, generate review prompts, submit review issues from JSON, or create/update GitCode PR metadata with this skill's scripts.
---

# GitCode Code Review

Review a GitCode pull request using this skill's Node.js scripts and bundled agent prompts. The reviewer script fetches PR context, generates prompts for review agents, accepts JSON findings, validates them, and posts GitCode inline comments.

## Configuration

Use either environment variables or a `config.json` in the current working directory:

```bash
export GITCODE_TOKEN=<token>
export GITCODE_OWNER=<owner>
export GITCODE_REPO=<repo>
export GITCODE_BASE_URL=https://api.gitcode.com
```

```json
{
  "gitcode": {
    "token": "<token>",
    "owner": "<owner>",
    "repo": "<repo>",
    "baseUrl": "https://api.gitcode.com"
  },
  "codeReview": {
    "confidenceThreshold": 80,
    "skipValidation": false
  }
}
```

When running from a plugin host that exposes the skill directory, use that path directly, for example `${CLAUDE_SKILL_DIR}/scripts/gitcode-reviewer.js`. Otherwise run the script by absolute path or from a checkout containing `skills/code-review`.

## Steps

1. Verify configuration: require `GITCODE_TOKEN` and explicit `GITCODE_OWNER`/`GITCODE_REPO` or equivalent `config.json` values. Do not rely on the built-in default repository unless the user explicitly wants it.

2. Generate agent prompts by running the reviewer script with `--auto-review --dry-run --force`:
   ```bash
   node <skill-dir>/scripts/gitcode-reviewer.js --pr <pr-number> --auto-review --dry-run --force
   ```
   This saves prompts to `.temp-review/pr-<pr-number>-prompts.json`.

3. Read the prompts JSON file at `.temp-review/pr-<pr-number>-prompts.json`.

4. Execute each agent prompt in parallel with the available agent/subagent mechanism:
   - bug-scanner-diff (agents[0])
   - bug-scanner-diff-2 (agents[1])
   - code-analyzer (agents[2])
   - semantic-analyzer (agents[3])
   - python-classmethod-checker (agents[4]) only when the PR touches Python class or `@classmethod` code.

   Tell each agent: "Read the prompts file, follow your specific agent prompt, and output issues as JSON."

5. Collect all issues from agent outputs. Combine into a single JSON array and save to `.temp-review/pr-<pr-number>-issues.json`:
   ```json
   [{"file":"path","line":42,"type":"bug","severity":"error","confidence":90,"title":"title","description":"desc","contextCode":"code","fix":{"code":"fix","explanation":"why"}}]
   ```

6. Feed issues back to the reviewer script for validation and posting:
   ```bash
   node <skill-dir>/scripts/gitcode-reviewer.js --pr <pr-number> --issues-from-json .temp-review/pr-<pr-number>-issues.json
   ```
   For preview only (no posting), add --dry-run. For speed, add --skip-validation.

7. Clean up temp files:
   ```bash
   rm -rf .temp-review
   ```

8. Summarize the review results for the user — how many issues found, severity levels, key findings.

## Other available scripts

- Create PR: `node <skill-dir>/scripts/create-pr.js`
- Update PR: `node <skill-dir>/scripts/update-pr.js`
- Smart PR description: `node <skill-dir>/scripts/generate-smart-pr-desc.js`

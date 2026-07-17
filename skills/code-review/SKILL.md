---
name: code-review
description: Review GitCode pull requests with a self-contained multi-agent prompt pipeline, validate JSON review findings, post or delete GitCode inline comments, and create/update GitCode PR metadata with this skill's scripts.
---

# GitCode Code Review

Review a GitCode pull request using this skill's Node.js scripts and bundled agent prompts. The reviewer script fetches PR context, generates prompts for review agents, accepts JSON findings, validates them, and posts GitCode inline comments.

## Configuration

Use either environment variables or a config file in the current working directory. The reviewer checks `gitcode-review.config.json` first, then falls back to `config.json`:

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
    "skipValidation": false,
    "commentLanguage": "en",
    "reviewGuidePath": "path/to/review-guide.md"
  }
}
```

When `reviewGuidePath` is set in config.json, the reviewer auto-loads it — no need to pass `--review-guide` on the CLI. This enables **config-based composition**: projects configure their review guide and language preference in config.json, and this skill picks them up automatically.

When running from a plugin host that exposes the skill directory, use that path directly, for example `${CLAUDE_SKILL_DIR}/scripts/gitcode-reviewer.js`. Otherwise run the script by absolute path or from a checkout containing `skills/code-review`.

## Steps

1. Verify configuration. Use separate tool calls — do not combine `if`/`echo`/`cat` into one bash command, since combined commands don't match permission rules and will prompt.
   - Check the token with a narrow echo: `echo "GITCODE_TOKEN set: ${GITCODE_TOKEN:+yes}"` (no value printed — just whether it's set).
   - Read `gitcode-review.config.json` (or `config.json`) with the Read tool to confirm `owner`, `repo`, `commentLanguage`, and `reviewGuidePath`. Do not `cat` it.
   - If `GITCODE_TOKEN` is unset, stop and tell the user to export it. Do not rely on the built-in default repository unless the user explicitly wants it.

2. Resolve comment language:
   - If `codeReview.commentLanguage` is set in config, use it directly.
   - Else ask the user which language to use for public review comments: English (`en`) or Chinese (`zh`).

3. Resolve review guide:
   - If `codeReview.reviewGuidePath` is set in config, use it directly.
   - Else ask the user if they want to use a project-specific review guide, and which file to use.
   - If no guide is provided, proceed without one.

4. Generate agent prompts to a file. Pass `--prompts-to` with no path to use the default scratch location `.tmp/gitcode-review/pr-<pr-number>/prompts.json` under the current working directory:
   ```bash
   node <skill-dir>/scripts/gitcode-reviewer.js --pr <pr-number> --auto-review --prompts-to --dry-run --force --comment-language <en|zh> [--review-guide <path>]
   ```
   The script creates the directory and writes `prompts.json`. No stdout parsing is needed — agents read the file directly.

5. Execute each agent prompt in parallel with the available agent/subagent mechanism:
   - bug-scanner-diff (agents[0])
   - bug-scanner-diff-2 (agents[1])
   - code-analyzer (agents[2])
   - semantic-analyzer (agents[3])
   - python-classmethod-checker (agents[4]) only when the PR touches Python class or `@classmethod` code.

   Tell each agent: "Use the `Read` tool to read `.tmp/gitcode-review/pr-<pr-number>/prompts.json`, extract `agents[<i>].prompt`, follow it, then use the `Write` tool to write your findings as a JSON array to `.tmp/gitcode-review/pr-<pr-number>/issue-<i>.json`."

   The issues JSON schema for each file (a top-level array, or an object with an `issues` array — both forms are accepted by `--collect-issues-from`):
   ```json
   [{"file":"path","line":42,"type":"bug","severity":"error","confidence":90,"title":"title","description":"desc","contextCode":"code","fix":{"code":"fix","explanation":"why"}}]
   ```

6. Preview formatted comments without posting. The script aggregates every `issue-*.json` in the directory (skipping `prompts.json` and `issues-combined.json`), so no manual JSON merging is needed:
   ```bash
   node <skill-dir>/scripts/gitcode-reviewer.js --pr <pr-number> --collect-issues-from .tmp/gitcode-review/pr-<pr-number> --comment-language <en|zh> --skip-validation
   ```

7. Ask the user to approve each review point before posting. Do not post comments unless the user explicitly approves. To post all approved comments:
   ```bash
   node <skill-dir>/scripts/gitcode-reviewer.js --pr <pr-number> --collect-issues-from .tmp/gitcode-review/pr-<pr-number> --post --approve-all --comment-language <en|zh>
   ```
   For selective posting by 1-based index, use `--approve 1,3` instead of `--approve-all`. For an interactive per-comment confirmation, use `--post` without `--approve` flags in a TTY.

8. Summarize the review results for the user — how many issues found, severity levels, key findings.

The `.tmp/gitcode-review/pr-<pr-number>/` scratch directory should be in the project's `.gitignore` (a single `.tmp/` line covers it). Each PR gets its own subdirectory, so cross-PR state never collides.

## Permission auto-allow notes

- The entire flow is now three plain `node <skill-dir>/scripts/gitcode-reviewer.js ...` commands plus `Read`/`Write` tool calls. No `python3 -c`, no heredoc, no shell pipes. As long as `Bash(node <skill-dir>/scripts/gitcode-reviewer.js *)` (or the broader `Bash(node *)`) is in the project's `settings.json` allowlist, there are **zero** permission prompts.
- **Never** inline JSON via `python3 -c '...' | node ...` or `node ... <<'EOF' ... EOF'`. Both forms trigger Claude Code's safety checks (the first because `#` comments inside the quoted argument look like hidden arguments; the second because heredoc bodies defeat the `*` wildcard). Always write JSON with the `Write` tool — it doesn't go through the Bash permission layer at all.
- The legacy `--prompts-stdout`, `--write-temp`, `--issues-from-stdin`, and `--issues-from-json` flags are still supported for backward compatibility and CI use, but the recommended flow uses `--prompts-to` and `--collect-issues-from`.

## Other available scripts

- Create PR: `node <skill-dir>/scripts/create-pr.js`
- Update PR: `node <skill-dir>/scripts/update-pr.js`
- Smart PR description: `node <skill-dir>/scripts/generate-smart-pr-desc.js`
- Preview matching PR comments before deletion:
  ```bash
  node <skill-dir>/scripts/delete-pr-comments.js --pr <pr-number> --all-ai
  node <skill-dir>/scripts/delete-pr-comments.js --pr <pr-number> --comment-id <comment-id>
  ```
- Delete matching PR comments only after explicit user approval:
  ```bash
  node <skill-dir>/scripts/delete-pr-comments.js --pr <pr-number> --comment-id <comment-id> --ui-auth --yes
  node <skill-dir>/scripts/delete-pr-comments.js --pr <pr-number> --all-ai --ui-auth --yes
  ```
  Use `--ui-auth` when the public GitCode API returns `405 METHOD_NOT_ALLOWED`; it uses the SDK browser-auth flow and may open a GitCode login browser once. GitCode may refuse to delete discussion root comments that already have replies.

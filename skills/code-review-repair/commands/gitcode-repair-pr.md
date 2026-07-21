---
name: gitcode-repair-pr
description: Repair GitCode PR review comments — Claude generates fixes, the script applies them and replies on the PR.
allowed-tools:
  - AskUserQuestion
  - Bash
  - Read
  - Write
  - Edit
---

# GitCode PR Review Comment Repair

Two-stage scaffolding: a Node.js script collects unresolved GitCode PR review comments and PR context into a JSON file; Claude (running this command) reads the JSON, generates fixes with `Edit`/`Write`, and writes another JSON file; the script then applies the fixes to a checked-out PR, posts nested DiffNote replies, and runs `git commit --amend`.

No external Anthropic API call — Claude IS the LLM.

## Usage

```
/gitcode-repair-pr <PR_URL>
```

Example: `/gitcode-repair-pr https://gitcode.com/openeuler/vla-factory/pull/4`

## Configuration

Set `GITCODE_TOKEN` env var, or create `config.json` / `gitcode-review.config.json` in the project root:

```json
{
  "gitcode": { "token": "<token>", "owner": "<owner>", "repo": "<repo>", "baseUrl": "https://api.gitcode.com" }
}
```

No `anthropic.apiKey` needed.

## Workflow

1. **Collect**: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review-repair/scripts/repair-pr.js --collect <PR_URL>`
   - Fetches unresolved comments, checks out PR at `~/.cache/gitcode-repair/<owner>-<repo>-<N>/`, writes `.tmp/code-review-repair/pr-<N>/context.json`.

2. **Claude generates fixes**: Read `context.json`, for each comment use `Edit` on `comments[i].absPath`, then write `.tmp/code-review-repair/pr-<N>/fixes.json` with one entry per comment.

3. **Apply**: `node ${CLAUDE_PLUGIN_ROOT}/skills/code-review-repair/scripts/repair-pr.js --apply <PR_URL> [--dry-run]`
   - Reads `fixes.json`, applies patches/deletes/reverts to checkout, posts nested DiffNote replies via xauth_token, runs `git commit --amend --no-edit`.

## Script Reference

```
${CLAUDE_PLUGIN_ROOT}/skills/code-review-repair/scripts/repair-pr.js
```

## Tips

- Use `--dry-run` on `--apply` to preview without posting replies or amending commit.
- Checkout at `~/.cache/gitcode-repair/` is persistent — `--collect` skips cloning if `.git` exists. `rm -rf` the dir to force fresh clone.
- The script does NOT push to remote. Use the `pr` skill or `git push --force-with-lease` to publish the amended commit.

## Troubleshooting

**API Error**: Check GitCode token has `repo` and `pull_request` scopes.

**Commit Amend Error**: The checkout must be on the PR branch with uncommitted changes. If empty, `--apply` prints "No changes to commit" and skips the amend.

**Scraping Fails**: If web scraping for review status fails, ensure PR page is accessible and HTML structure hasn't changed.

**xauth_token Missing**: Nested DiffNote replies fall back to standalone PR comments. Run `node scripts/xauth-extractor.js` once to cache the token.

---
name: pr
description: Generate and apply semantic PR descriptions for GitCode using a two-stage collect→Claude→apply flow
argument-hint: [PR-number or PR-URL]
arguments: [pr]
allowed-tools: Bash(node *) Read Write Edit AskUserQuestion
---

# GitCode PR Description Generator (two-stage)

Generate a semantic PR description for a GitCode PR from the real diff, then
PATCH it back to the PR. Claude IS the LLM — no external Anthropic API call,
no `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` needed.

Mirrors the `code-review-repair` skill architecture: a Node.js script
collects PR context into a JSON file; Claude (running this skill) reads the
JSON, generates a description from the real diff (any file type, not just
`.py`), and writes another JSON file; the script then applies it to the PR
via the GitCode API.

## Configuration

Set `GITCODE_TOKEN` env var, or create `gitcode-review.config.json` in the
project root (same file used by `code-review-repair`):

```json
{
  "gitcode": {
    "owner": "<owner>",
    "repo": "<repo>",
    "baseUrl": "https://api.gitcode.com",
    "token": "<optional, else GITCODE_TOKEN env>"
  }
}
```

No `anthropic.apiKey` needed.

## Project root resolution

The scripts resolve the project root (where `.tmp/` lands) by walking up
from `process.cwd()` looking for, in order:

1. `gitcode-review.config.json` — strongest signal (created by `/gitcode-tools-setup`).
2. `.git` — fallback for projects without that file.
3. If neither is found and cwd is inside the plugin cache, the script
   **throws** rather than silently writing scratch files into the plugin dir.

**Always invoke this skill from the project root** (or a subdir of it).

## Steps

1. **Collect**: fetch PR metadata + commits + files (with patches and file
   contents), write `pr-context.json`:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/pr/scripts/collect-pr-context.js <PR-number or PR-URL>
   ```
   - Writes `.tmp/pr-<N>/pr-context.json` under the project root.
   - `--max-file-bytes 20000` (default) — truncate full file contents to
     keep the JSON bounded. Patches are kept whole.

2. **Claude generates the description**: read `.tmp/pr-<N>/pr-context.json`
   with the `Read` tool. Then:
   - Read the PR title, commit subjects, file list, and each file's `patch`
     (and `content` when useful for context — e.g. for understanding which
     function a modified block belongs to).
   - Write a semantic PR body in Markdown. Structure:
     - `## 概述 / Summary` — 1-2 paragraph description of what this PR does
       and why. Derive from commit messages + actual diff. If the commit
       messages are ambiguous, trust the diff.
     - `## 主要变更 / Key Changes` — bullet list, one per logical change.
       Group related file changes together. Reference files with backticks
       (e.g. `\`src/foo.py\``). Mention added/removed/renamed public
       surfaces (functions, classes, CLI flags, config keys).
     - `## 测试建议 / Test Suggestions` — concrete commands the reviewer
       can run, derived from the actual file types in the PR:
       - `.py` files in `tests/`: `pytest <path> -v`
       - `.py` files outside `tests/`: `python -m py_compile <path>` (at
         least check syntax)
       - `.yaml`/`.yml`: `python -c "import yaml; yaml.safe_load(open('<path>'))"`
         or `yamllint <path>`
       - `.json`: `python -c "import json; json.load(open('<path>'))"`
       - `.md`: visual review
       - `.sh`: `bash -n <path>` (syntax check)
       - If no tests exist, say so honestly — do NOT fabricate test names.
     - Do NOT include a "Section to remove" block — that's an artifact of
       the old template.
   - Use `AskUserQuestion` to confirm the generated description with the
     user before writing it back, especially for PRs touching many files.
   - Title: if the existing PR title is clearly wrong or generic (e.g.
     `Update foo.py`), propose a new one. Otherwise keep it (`title: null`).
   - Write `.tmp/pr-<N>/pr-description.json` using the `Write` tool:
     ```json
     {
       "prNumber": <N>,
       "title": "new title or null to keep existing",
       "body": "full markdown body",
       "summary": "one-line summary for CLI logging",
       "generatedAt": "2026-07-22T...",
       "model": "claude code (pr skill)"
     }
     ```

3. **Apply**: read `pr-description.json`, PATCH the PR:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/pr/scripts/apply-pr-description.js <PR-number or PR-URL> [--dry-run]
   ```
   - `--dry-run`: prints the preview and skips the PATCH.
   - On success, the PR body (and title if provided) is updated on GitCode.

## JSON contracts

### `pr-context.json` (script writes, Claude reads)

```json
{
  "prUrl": "https://gitcode.com/<owner>/<repo>/pull/<N>",
  "owner": "<owner>", "repo": "<repo>", "prNumber": <N>,
  "collectedAt": "2026-07-22T...",
  "prMetadata": {
    "title": "...", "body": "...", "state": "open", "draft": false,
    "labels": ["bug"],
    "headRepo": "owner/repo", "headBranch": "feature-x", "headSha": "abc123",
    "baseRepo": "owner/repo", "baseBranch": "master", "baseSha": "def456",
    "user": "author", "createdAt": "...", "updatedAt": "...",
    "mergedAt": null, "mergeable": true,
    "changesCount": 5, "additionsCount": 42, "deletionsCount": 7
  },
  "commits": [
    { "sha": "abc123abcd", "message": "feat: add foo", "author": "...", "date": "..." }
  ],
  "files": [
    {
      "filename": "src/foo.py",
      "status": "modified",
      "additions": 10, "deletions": 2, "changes": 12,
      "patch": "@@ ... @@ ...",
      "content": "...full file up to 20000 bytes from head ref..."
    }
  ],
  "stats": { "fileCount": 5, "totalAdditions": 42, "totalDeletions": 7 }
}
```

### `pr-description.json` (Claude writes, script reads)

```json
{
  "prNumber": 4,
  "title": "feat: add semantic PR description generator",
  "body": "## 概述 / Summary\n...\n\n## 主要变更 / Key Changes\n- ...\n\n## 测试建议 / Test Suggestions\n- `pytest tests/test_foo.py -v`",
  "summary": "Two-stage pr skill refactor",
  "generatedAt": "2026-07-22T08:30:00.000Z",
  "model": "claude code (pr skill)"
}
```

- `title`: null to keep existing. Any non-null string replaces it.
- `body`: null to keep existing. Any string replaces it.

## Notes

- The scratch dir at `.tmp/pr/pr-<N>/` is NOT auto-cleaned — you can inspect
  `pr-context.json` and `pr-description.json` after the run, or re-run
  `--apply` after editing `pr-description.json` to push a revised body.
- The scripts do NOT push commits or modify the branch — only the PR
  description (title + body) via the v5 PATCH endpoint. To amend commits,
  use `code-review-repair`.
- For creating a new PR from a local branch (not updating an existing PR's
  description), the old `create-pr.js` script is still present but is not
  part of the two-stage flow.

## Available Scripts

| Script | Purpose |
|--------|---------|
| `collect-pr-context.js` | Stage 1: fetch PR context → `pr-context.json` |
| `apply-pr-description.js` | Stage 2: apply `pr-description.json` → GitCode PR |
| `create-pr.js` | Legacy: create a new PR from local branch (not two-stage) |
| `browser-pr.js` | Legacy: browser-automation PR creation |

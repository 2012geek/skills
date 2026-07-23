---
name: bot
description: Autonomous GitCode project monitor — scan, verify, create issues, fix with PRs
---

# gitcode-bot

Autonomously monitors GitCode projects for problems, creates Issues, and fixes them with PRs.

## Architecture

**You (Claude) are the LLM executor.** This SKILL.md tells you exactly what to do at each pipeline step. You read code, analyze it, generate fixes, and make decisions using your own reasoning. The Node.js CLI script (`scripts/cli.js`) handles only infrastructure — API calls, git operations, state persistence, config. You call it via Bash and parse its JSON output.

## Commands

- `/gitcode-bot init` — create ~/.gitcode-bot/config.json
- `/gitcode-bot scan` — one-shot scan + verify only
- `/gitcode-bot fix` — full pipeline (scan → verify → issue → fix → test → PR)
- `/gitcode-bot fix --issue 42` — fix a specific existing Issue
- `/gitcode-bot fix --immediate` — skip the wait stage
- `/gitcode-bot status` — show pipeline state for all projects

## CLI Reference

All infrastructure operations use one CLI script. Run via Bash, parse JSON output.

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js <command> [--key value ...]
```

Every command returns `{ ok: true|false, ... }` JSON. If `ok: false`, read the `error` field.

| Command | Args | Returns |
|---------|------|---------|
| `init` | none | `{ ok, configPath }` |
| `config` | none | `{ ok, projects: [{owner, repo, ...}] }` |
| `status` | none | `{ ok, projects: [{owner, repo, findings, botIssues, remoteIssues, remoteIssueList, fixes, prs, lastScanAt}] }` |
| `state-get` | `--project owner/repo` | `{ ok, findings, issues, fixes, prs, lastScanAt }` |
| `state-add-finding` | `--project owner/repo --finding '<JSON>'` | `{ ok, id: "f-auto-N" }` |
| `state-update-finding` | `--project owner/repo --id f1 --status confirmed` | `{ ok }` |
| `state-add-issue` | `--project owner/repo --issue '<JSON>'` | `{ ok }` |
| `state-update-issue` | `--project owner/repo --number 42 --status open` | `{ ok }` |
| `state-set-scan-time` | `--project owner/repo --time 'ISO'` | `{ ok }` |
| `state-add-fix` | `--project owner/repo --fix '<JSON>'` | `{ ok }` |
| `state-add-pr` | `--project owner/repo --pr '<JSON>'` | `{ ok }` |
| `dedup` | `--findings '<JSON_ARRAY>'` **or** `--findings-file <path>` | `{ ok, merged: [...] }` |
| `issue-check-dup` | `--project owner/repo --finding '<JSON>'` | `{ ok, duplicate: null | {number} }` |
| `issue-create` | `--project owner/repo --finding '<JSON>' --test '<JSON|null>'` | `{ ok, issueNumber, status }` |
| `issue-list` | `--project owner/repo` | `{ ok, issues: [...] }` |
| `issue-close` | `--project owner/repo --number 42` | `{ ok }` |
| `issue-comment` | `--project owner/repo --number 42 --body 'text'` | `{ ok }` |
| `wait-check` | `--project owner/repo --number 42` | `{ ok, shouldProceed: bool }` |
| `test-discover` | `--repo-path /local/path` | `{ ok, command: "npm test" | null }` |
| `test-run` | `--command "npm test" --repo-path /path` | `{ ok, passed, passCount, failCount, output }` |
| `git-clone` | `--project owner/repo` | `{ ok, localPath }` |
| `git-branch` | `--repo-path /path --name bot/fix-42` | `{ ok }` |
| `git-push` | `--repo-path /path --name bot/fix-42` | `{ ok }` |
| `pr-create` | `--project owner/repo --number 42 --branch bot/fix-42 --title "..." --body "..."` | `{ ok, prNumber, status }` |

**JSON strings**: For args like `--finding`, `--issue`, `--fix`, `--pr`, pass a single-quoted JSON string. Example: `--finding '{"severity":"medium","title":"null pointer","file":"src/main.py","line":42}'`

**Large JSON payloads (e.g. `dedup` findings arrays)**: prefer `--findings-file <path>` over `--findings '<JSON>'`. Inline single-quoted JSON breaks when the payload contains apostrophes or grows past the shell argv limit. Write the JSON to a file under `<project-root>/.tmp/gitcode-bot/scratch/findings.json` first, then pass `--findings-file <path>`. The CLI **refuses to read files outside `<project-root>/.tmp/gitcode-bot/`** — this guarantees scratch files stay co-located with the project and don't pollute `/tmp/` or `~/`.

## Reference Agent Files

Read these when you need domain guidance for each scan/fix phase:

- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/code-analyzer.md` — what kinds of code problems to find
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/issue-reader.md` — how to assess existing GitCode Issues
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/commit-watcher.md` — what to look for in recent commits
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/ci-failure-reader.md` — how to parse CI failures
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/code-fixer.md` — how to approach code fixes
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/test-reproducer.md` — how to write reproduction tests
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/pr-description-writer.md` — how to write PR descriptions

## Project root resolution

The CLI resolves the project root (where `.tmp/gitcode-bot/` lands) by walking
up from `process.cwd()` looking for, in order:

1. `gitcode-review.config.json` — strongest signal (created by `/gitcode-tools-setup`).
2. `.git` — fallback for projects without that file.
3. If neither is found and cwd is inside the plugin cache, the CLI **throws**
   rather than silently writing scratch files into the plugin dir.

All bot artifacts live under `<project-root>/.tmp/gitcode-bot/`:
- `config.json` — bot config (tokens, projects)
- `state/<owner>_<repo>.json` — findings / issues / fixes / PRs
- `repos/<owner>_<repo>/` — cloned repos used for reading and fixing
- `scratch/` — transient files (e.g. `findings.json` passed to `--findings-file`); the CLI validates any `--*-file` arg resolves under this dir

**Always invoke this skill from the project root** (or a subdir of it).
Env overrides `GITCODE_BOT_CONFIG_PATH` and `GITCODE_BOT_STATE_DIR` still work
for tests and one-off runs.

---

## Pipeline: /gitcode-bot init

Run:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js init
```

This writes an empty config to `<project-root>/.tmp/gitcode-bot/config.json`.
Then tell the user to edit that file with their GitCode token and project details:
```json
{
  "projects": [
    {
      "owner": "org-name",
      "repo": "repo-name",
      "gitcodeToken": "your_token",
      "waitHours": 24,
      "maxRetries": 3
    }
  ],
  "bot": {}
}
```

---

## Pipeline: /gitcode-bot status

Run the status command (combines config, local state, and remote Issues in one call):
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js status
```

Parse the JSON output. Print a summary table using all fields:
| Project | Findings | Bot Issues | Remote Issues | Fixes | PRs | Last Scan |
|---------|----------|------------|---------------|-------|-----|-----------|
| owner/repo | N | N | N | N | N | timestamp |

If `remoteIssues > 0`, list the remote Issues below the table:
- #N: title (state)

---

## Pipeline: /gitcode-bot scan

### Step 1: Load config

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js config
```

Parse the JSON. Get the `projects` array. If the user specified `--project owner/repo`, select only that project.

### Step 2: Read scan reference agents

Read the following files to understand what kinds of problems to look for:
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/code-analyzer.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/issue-reader.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/commit-watcher.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/ci-failure-reader.md`

### Step 3: Gather code context

For each project, gather information from multiple sources:

**a) List existing open Issues:**
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js issue-list --project owner/repo
```

**b) Clone the repo (if needed for deeper analysis):**
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js git-clone --project owner/repo
```
Use the `localPath` from the result to read files with your Read tool.

**c) Read source files:**
Focus on recently changed files and known hot-spots. Use `git log` and `git diff` in the cloned repo to identify recent changes:
```bash
cd <localPath> && git log --oneline -20
cd <localPath> && git diff HEAD~10 --name-only
```

### Step 4: Analyze and produce findings

Apply the scanning guidance from the agent reference files. For each problem found, produce a finding:

```json
{
  "severity": "security|critical|medium|low",
  "title": "short description",
  "description": "detailed explanation",
  "file": "path/to/file",
  "line": 10,
  "suggestion": "how to fix",
  "source": "code-analyzer|issue-reader|commit-watcher|ci-failure-reader"
}
```

Collect all findings into a JSON array.

### Step 5: Deduplicate findings

Write the findings array to a file under the bot workspace, then pass `--findings-file` (preferred over inline `--findings`, which breaks on apostrophes in JSON and on large payloads):

```bash
# Write findings to <project-root>/.tmp/gitcode-bot/scratch/findings.json
# (the Write tool — do NOT use /tmp/ or any path outside the project)

node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js dedup --findings-file <project-root>/.tmp/gitcode-bot/scratch/findings.json
```

The CLI refuses to read files outside `<project-root>/.tmp/gitcode-bot/` — this enforces that scratch files stay co-located with the project. Parse the `{ ok: true, merged: [...] }` output.

Parse the `{ ok: true, merged: [...] }` output.

### Step 6: Verify findings

For each merged finding, verify it by reading the actual code at the specified file and line. Use your Read tool to confirm the problem exists.

Assign a status:
- `confirmed` — you read the code and confirmed the bug exists
- `unverified` — you think it's likely but couldn't fully confirm
- `discarded` — false positive or already fixed

For each finding, update its status:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-add-finding --project owner/repo --finding '<JSON>'
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-update-finding --project owner/repo --id f-auto-N --status confirmed
```

### Step 7: Record scan completion

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-set-scan-time --project owner/repo --time '<ISO_TIMESTAMP>'
```

### Step 8: Print summary

| Severity | Count | Confirmed | Unverified | Discarded |
|----------|-------|-----------|------------|-----------|
| security | N | N | N | N |
| critical | N | N | N | N |
| medium | N | N | N | N |
| low | N | N | N | N |

---

## Pipeline: /gitcode-bot fix

Runs the full pipeline: **SCAN → VERIFY → ISSUE → WAIT → FIX → TEST → PR**

### Steps 1-7: Run the scan pipeline first

Execute all steps from `/gitcode-bot scan` above.

### Step 8: Create Issues for confirmed findings

For each confirmed/unverified finding:

1. Check for duplicate Issue:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js issue-check-dup --project owner/repo --finding '<JSON>'
```

2. If `duplicate: null`, create a new Issue:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js issue-create --project owner/repo --finding '<JSON>' --test null
```

3. Persist the Issue record:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-add-issue --project owner/repo --issue '{"issueNumber":N,"findingId":"f-auto-N","status":"open"}'
```

### Step 9: Wait stage (unless --immediate)

For each Issue:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js wait-check --project owner/repo --number N
```

If `shouldProceed: false`, report that this Issue is waiting and skip it. Only proceed with Issues where `shouldProceed: true`.

### Step 10: Fix each approved Issue

#### 10a: Clone repo and create fix branch

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js git-clone --project owner/repo
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js git-branch --repo-path <localPath> --name bot/fix-N
```

#### 10b: Read fix reference

Read `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/code-fixer.md` for guidance on how to approach fixes.

#### 10c: Read the buggy code

Use your Read tool to read the file(s) referenced in the finding. Understand the bug thoroughly.

#### 10d: Apply the fix

Use your Edit tool to make minimal code changes that fix the bug. Rules:
- Fix ONLY the reported bug — no refactoring, no style changes
- Make the smallest possible change
- Don't add new dependencies

#### 10e: Commit the fix

```bash
cd <localPath> && git add -A && git commit -m "fix #N: <description>"
```

#### 10f: Test the fix

1. Discover test command:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js test-discover --repo-path <localPath>
```

2. Run tests:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js test-run --command "<testCommand>" --repo-path <localPath>
```

3. If `passed: false`:
   - Read the `output` field to understand the failure
   - Re-read the code and understand why your fix didn't work
   - Try a different approach (retry up to 3 times)
   - If all retries fail, mark Issue as bot-unable-to-fix:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-update-issue --project owner/repo --number N --status bot-unable-to-fix
```

4. Persist the fix attempt:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-add-fix --project owner/repo --fix '{"issueNumber":N,"attempt":N,"patch":"applied","testResult":"PASSED"}'
```

### Step 11: Push and create PR

1. Push branch:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js git-push --repo-path <localPath> --name bot/fix-N
```

2. Read PR description reference:
Read `${CLAUDE_PLUGIN_ROOT}/skills/bot/agents/pr-description-writer.md` for guidance.

3. Generate a PR description, then create PR:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js pr-create --project owner/repo --number N --branch bot/fix-N --title "fix #N: <title>" --body '<PR_BODY>'
```

4. Persist PR record:
```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bot/scripts/cli.js state-add-pr --project owner/repo --pr '{"prNumber":N,"branch":"bot/fix-N","status":"created"}'
```

---

## Pipeline: /gitcode-bot fix --issue 42

Skip SCAN, VERIFY, and ISSUE stages. Start directly at Step 10 (Fix) for the specified Issue number.

1. Load config to get project details
2. Read the Issue content (from GitCode API or by calling `issue-list`)
3. Clone repo, create branch, read code, apply fix, test, push, create PR — same as Steps 10-11 above

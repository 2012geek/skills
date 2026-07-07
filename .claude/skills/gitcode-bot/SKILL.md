---
name: gitcode-bot
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
node gitcode-bot/scripts/cli.js <command> [--key value ...]
```

Every command returns `{ ok: true|false, ... }` JSON. If `ok: false`, read the `error` field.

| Command | Args | Returns |
|---------|------|---------|
| `init` | none | `{ ok, configPath }` |
| `config` | none | `{ ok, projects: [{owner, repo, ...}] }` |
| `state-get` | `--project owner/repo` | `{ ok, findings, issues, fixes, prs, lastScanAt }` |
| `state-add-finding` | `--project owner/repo --finding '<JSON>'` | `{ ok, id: "f-auto-N" }` |
| `state-update-finding` | `--project owner/repo --id f1 --status confirmed` | `{ ok }` |
| `state-add-issue` | `--project owner/repo --issue '<JSON>'` | `{ ok }` |
| `state-update-issue` | `--project owner/repo --number 42 --status open` | `{ ok }` |
| `state-set-scan-time` | `--project owner/repo --time 'ISO'` | `{ ok }` |
| `state-add-fix` | `--project owner/repo --fix '<JSON>'` | `{ ok }` |
| `state-add-pr` | `--project owner/repo --pr '<JSON>'` | `{ ok }` |
| `dedup` | `--findings '<JSON_ARRAY>'` | `{ ok, merged: [...] }` |
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

## Reference Agent Files

Read these when you need domain guidance for each scan/fix phase:

- `gitcode-bot/agents/code-analyzer.md` — what kinds of code problems to find
- `gitcode-bot/agents/issue-reader.md` — how to assess existing GitCode Issues
- `gitcode-bot/agents/commit-watcher.md` — what to look for in recent commits
- `gitcode-bot/agents/ci-failure-reader.md` — how to parse CI failures
- `gitcode-bot/agents/code-fixer.md` — how to approach code fixes
- `gitcode-bot/agents/test-reproducer.md` — how to write reproduction tests
- `gitcode-bot/agents/pr-description-writer.md` — how to write PR descriptions

---

## Pipeline: /gitcode-bot init

Run:
```bash
node gitcode-bot/scripts/cli.js init
```

Then tell the user to edit `~/.gitcode-bot/config.json` with their GitCode token and project details:
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

1. Load config:
```bash
node gitcode-bot/scripts/cli.js config
```

2. For each project, get state:
```bash
node gitcode-bot/scripts/cli.js state-get --project owner/repo
```

3. Print a summary table:
| Project | Findings | Issues | PRs | Last Scan |
|---------|----------|--------|-----|-----------|
| owner/repo | N | N | N | timestamp |

---

## Pipeline: /gitcode-bot scan

### Step 1: Load config

```bash
node gitcode-bot/scripts/cli.js config
```

Parse the JSON. Get the `projects` array. If the user specified `--project owner/repo`, select only that project.

### Step 2: Read scan reference agents

Read the following files to understand what kinds of problems to look for:
- `gitcode-bot/agents/code-analyzer.md`
- `gitcode-bot/agents/issue-reader.md`
- `gitcode-bot/agents/commit-watcher.md`
- `gitcode-bot/agents/ci-failure-reader.md`

### Step 3: Gather code context

For each project, gather information from multiple sources:

**a) List existing open Issues:**
```bash
node gitcode-bot/scripts/cli.js issue-list --project owner/repo
```

**b) Clone the repo (if needed for deeper analysis):**
```bash
node gitcode-bot/scripts/cli.js git-clone --project owner/repo
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

```bash
node gitcode-bot/scripts/cli.js dedup --findings '<JSON_ARRAY>'
```

Parse the `{ ok: true, merged: [...] }` output.

### Step 6: Verify findings

For each merged finding, verify it by reading the actual code at the specified file and line. Use your Read tool to confirm the problem exists.

Assign a status:
- `confirmed` — you read the code and confirmed the bug exists
- `unverified` — you think it's likely but couldn't fully confirm
- `discarded` — false positive or already fixed

For each finding, update its status:
```bash
node gitcode-bot/scripts/cli.js state-add-finding --project owner/repo --finding '<JSON>'
node gitcode-bot/scripts/cli.js state-update-finding --project owner/repo --id f-auto-N --status confirmed
```

### Step 7: Record scan completion

```bash
node gitcode-bot/scripts/cli.js state-set-scan-time --project owner/repo --time '<ISO_TIMESTAMP>'
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
node gitcode-bot/scripts/cli.js issue-check-dup --project owner/repo --finding '<JSON>'
```

2. If `duplicate: null`, create a new Issue:
```bash
node gitcode-bot/scripts/cli.js issue-create --project owner/repo --finding '<JSON>' --test null
```

3. Persist the Issue record:
```bash
node gitcode-bot/scripts/cli.js state-add-issue --project owner/repo --issue '{"issueNumber":N,"findingId":"f-auto-N","status":"open"}'
```

### Step 9: Wait stage (unless --immediate)

For each Issue:
```bash
node gitcode-bot/scripts/cli.js wait-check --project owner/repo --number N
```

If `shouldProceed: false`, report that this Issue is waiting and skip it. Only proceed with Issues where `shouldProceed: true`.

### Step 10: Fix each approved Issue

#### 10a: Clone repo and create fix branch

```bash
node gitcode-bot/scripts/cli.js git-clone --project owner/repo
node gitcode-bot/scripts/cli.js git-branch --repo-path <localPath> --name bot/fix-N
```

#### 10b: Read fix reference

Read `gitcode-bot/agents/code-fixer.md` for guidance on how to approach fixes.

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
node gitcode-bot/scripts/cli.js test-discover --repo-path <localPath>
```

2. Run tests:
```bash
node gitcode-bot/scripts/cli.js test-run --command "<testCommand>" --repo-path <localPath>
```

3. If `passed: false`:
   - Read the `output` field to understand the failure
   - Re-read the code and understand why your fix didn't work
   - Try a different approach (retry up to 3 times)
   - If all retries fail, mark Issue as bot-unable-to-fix:
```bash
node gitcode-bot/scripts/cli.js state-update-issue --project owner/repo --number N --status bot-unable-to-fix
```

4. Persist the fix attempt:
```bash
node gitcode-bot/scripts/cli.js state-add-fix --project owner/repo --fix '{"issueNumber":N,"attempt":N,"patch":"applied","testResult":"PASSED"}'
```

### Step 11: Push and create PR

1. Push branch:
```bash
node gitcode-bot/scripts/cli.js git-push --repo-path <localPath> --name bot/fix-N
```

2. Read PR description reference:
Read `gitcode-bot/agents/pr-description-writer.md` for guidance.

3. Generate a PR description, then create PR:
```bash
node gitcode-bot/scripts/cli.js pr-create --project owner/repo --number N --branch bot/fix-N --title "fix #N: <title>" --body '<PR_BODY>'
```

4. Persist PR record:
```bash
node gitcode-bot/scripts/cli.js state-add-pr --project owner/repo --pr '{"prNumber":N,"branch":"bot/fix-N","status":"created"}'
```

---

## Pipeline: /gitcode-bot fix --issue 42

Skip SCAN, VERIFY, and ISSUE stages. Start directly at Step 10 (Fix) for the specified Issue number.

1. Load config to get project details
2. Read the Issue content (from GitCode API or by calling `issue-list`)
3. Clone repo, create branch, read code, apply fix, test, push, create PR — same as Steps 10-11 above

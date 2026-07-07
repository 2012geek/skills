# [9]+[9a] FIX Stage & Agent

Component number: [9] FIX stage, [9a] Fix Agent
Files: `agents/code-fixer.md` (local), `@skills/gitcode-sdk/src/agent-runner.js` (from sdk), `@skills/gitcode-sdk/src/git-manager.js` (from sdk)

## Responsibility

[9] FIX stage: Per confirmed Issue, creates a fix branch, generates a patch via LLM, applies it, and handles retries.

[9a] Fix Agent: The `code-fixer` agent that generates a unified diff patch based on Issue + reproduction test.

## FIX Stage Interface

```javascript
class FixStage {
  constructor(agentRunner, gitManager, testRunner, stateStore)

  // Fix an Issue
  async fixIssue(issueRecord, projectConfig)

  // Run baseline tests before fix
  async runBaseline(projectConfig)

  // Create fix branch
  async createFixBranch(issueNumber, projectConfig)

  // Generate and apply patch (with retry logic)
  async generatePatch(issueRecord, projectConfig, attempt)
}
```

## Fix Flow

```
1. Clone repo (or reuse) → run baseline tests → record pass/fail counts
2. Create branch: bot/fix-{issueNumber} from main
3. Build prompt: Issue description + reproduction test + file context
4. LLM generates unified diff patch
5. Apply patch to branch
6. If patch invalid → retry with failure context (max 3 attempts)
7. If all retries fail → mark Issue "bot-unable-to-fix"
```

## Retry Logic

Each retry adds more context:
- Attempt 1: Issue + reproduction test + file content
- Attempt 2: + previous patch + error message (why it failed)
- Attempt 3: + full file content + more surrounding context

After 3 failures: comment on Issue "bot unable to fix after 3 attempts", mark `bot-unable-to-fix`.

## Dependencies

- `[9a]` code-fixer agent — LLM patch generation (local)
- `@skills/gitcode-sdk` → `[12]` Git Manager — clone, branch, patch, rebase
- `@skills/gitcode-sdk` → `[13]` Agent Runner — calls code-fixer agent
- `[10]` TestRunner — baseline test execution (local)
- StateStore — record fix attempts

## Test Strategy — Tier 2

**File:** `tests/fix.test.js`
**Why Tier 2:** Fix stage has retry logic worth testing, but the core LLM patch generation is non-deterministic.

| Test | Description |
|------|-------------|
| Branch creation | Creates `bot/fix-{issueNumber}` from latest main |
| Patch application | Applies patch to branch, verifies no syntax errors |
| Retry logic | 3 failures → mark Issue `bot-unable-to-fix` |

**Mocking:** agentRunner mocked. gitManager mocked. testRunner mocked.

### [9a] Fix Agent — Tier 3 (no separate tests)

LLM-generated patches are non-deterministic. Prompt construction is simple and tested through orchestrator integration.

# [3] State Store

Component number: [3]
File: `lib/state-store.js`

## Responsibility

Persists pipeline state per project. Tracks findings, issues, fixes, and PRs through their lifecycle. Enables incremental scans (only scan new activity since `lastScanAt`).

## Interface

```javascript
class StateStore {
  constructor(stateDir)  // defaults to ~/.gitcode-bot/state/

  // Load state for a project
  async load(owner, repo)  // returns ProjectState or empty if no file exists

  // Save state for a project
  async save(owner, repo, state)

  // Append a finding
  async addFinding(owner, repo, finding)

  // Update finding status (confirmed, unverified, discarded)
  async updateFinding(owner, repo, findingId, updates)

  // Append an issue record
  async addIssue(owner, repo, issueRecord)

  // Update issue status (open, closed, bot-unable-to-fix, bot-blocked)
  async updateIssue(owner, repo, issueNumber, updates)

  // Append a fix attempt
  async addFix(owner, repo, fixAttempt)

  // Append a PR record
  async addPR(owner, repo, prRecord)

  // Get all open issues ready for fixing
  async getApprovedIssues(owner, repo)

  // Get last scan timestamp
  async getLastScanAt(owner, repo)

  // Update last scan timestamp
  async setLastScanAt(owner, repo, timestamp)
}
```

## Data Schema

```javascript
// ProjectState
{
  findings: [
    {
      id: "string",
      source: "code-analyzer|issue-reader|commit-watcher|ci-failure-reader",
      severity: "security|critical|medium|low",
      title: "string",
      description: "string",
      file: "string",
      line: "number",
      verifyTest: {
        testCode: "string",
        testResult: "FAILED|PASSED|null",
        testOutput: "string"
      },
      status: "pending|confirmed|unverified|discarded"
    }
  ],
  issues: [
    {
      issueNumber: "number",
      findingId: "string",
      verifyTest: "object (copied from finding)",
      status: "open|closed|bot-unable-to-fix|bot-blocked",
      branch: "string|null"
    }
  ],
  fixes: [
    {
      issueNumber: "number",
      attempt: "number",
      patch: "string",
      testResult: "PASSED|FAILED|null",
      retries: "number"
    }
  ],
  prs: [
    {
      prNumber: "number",
      branch: "string",
      issueRef: "number",
      status: "created|merged|closed"
    }
  ],
  lastScanAt: "ISO8601 timestamp|null"
}
```

## State File Location

```
~/.gitcode-bot/state/
  ├── openeuler_lerobot_ros2.json
  ├── someorg_someproject.json
  └── ...
```

File name: `{owner}_{repo}.json` (no slashes or dots in name).

## Dependencies

None — standalone persistence module.

## Test Strategy — Tier 1

Note: StateStore tests are covered under `config-manager.test.js` and `orchestrator.test.js` integration tests. StateStore is simple enough (JSON read/write) that it doesn't need its own Tier 1 test file, but it's tested through the orchestrator's pipeline integration.

# [7]+[7a] ISSUE Stage & Manager

Component number: [7] ISSUE stage, [7a] Issue Manager
Files: `lib/issue-manager.js`, `templates/issue-template.md`

## Responsibility

[7] ISSUE stage: Creates GitCode Issues for confirmed findings. Only verified findings (reproduction test confirmed) become Issues.

[7a] Issue Manager: GitCode Issue CRUD operations + deduplication logic.

## ISSUE Stage Interface

```javascript
class IssueStage {
  constructor(issueManager, stateStore)

  // Create Issues for confirmed findings
  async run(confirmedFindings, projectConfig)
}
```

## Issue Manager Interface

```javascript
class IssueManager {
  constructor(gitcodeApi)

  // Create a GitCode Issue
  async createIssue(owner, repo, finding, verifyTest)  // returns issueNumber

  // List open Issues with bot-detected label
  async listOpenIssues(owner, repo)

  // Close an Issue (when fix PR is merged)
  async closeIssue(owner, repo, issueNumber)

  // Post comment on an Issue
  async commentOnIssue(owner, repo, issueNumber, comment)

  // Check for duplicate Issues (same file+line)
  async findDuplicate(owner, repo, finding)

  // Link related Issues
  async linkRelatedIssues(owner, repo, issueNumber, relatedIssueNumber)
}
```

## Issue Body Format

Each Issue includes:
- Title: `[severity] finding title`
- Description: finding details + file/line reference
- Evidence: reproduction test code + failing output
- Label: `bot-detected`

Uses `templates/issue-template.md` as the base template.

## Duplicate Detection

Before creating an Issue, checks if an existing Issue covers the same finding:
- Same file path + same line number → duplicate, skip creation
- Link the existing Issue to the finding in state store

## Dependencies

- `@skills/gitcode-sdk` → `[11]` GitCode API — all Issue CRUD operations

## Test Strategy

### [7a] Issue Manager — Tier 1

**File:** `tests/issue-manager.test.js`
**Why Tier 1:** Issue deduplication prevents wasting human attention on duplicates.

| Test | Description |
|------|-------------|
| `createIssue()` | POST to GitCode API, returns issue number |
| `listOpenIssues()` | GET open issues with `bot-detected` label |
| `closeIssue()` | POST close action (when fix is merged) |
| `commentOnIssue()` | POST comment (e.g. "bot-unable-to-fix", "fix PR created") |
| Deduplication logic | Two findings with same file+line → merged into one Issue |

**Mocking:** GitCodeAPI mocked with fixture responses.

### [7] ISSUE Stage — Tier 3 (no separate tests)

Stage logic is simple: iterate findings, call issueManager.createIssue for each. Tested through orchestrator integration.

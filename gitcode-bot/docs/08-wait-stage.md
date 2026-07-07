# [8] WAIT Stage

Component number: [8]
File: `lib/orchestrator.js` (wait logic within orchestrator)

## Responsibility

Configurable delay before auto-fixing, giving humans time to triage Issues. Just checks whether `waitHours` has elapsed since Issue creation.

## Behavior

- Default: 24h delay per project (configurable via `waitHours`)
- `--immediate` flag: skip entirely, proceed straight to FIX
- During wait: poll GitCode API to check if Issue is still open
- If Issue closed → abort fix pipeline for that Issue
- If Issue still open after wait → proceed to FIX

## Interface

```javascript
// Check if wait period has elapsed for an Issue
async shouldProceed(issueRecord, projectConfig)

// Poll GitCode API for Issue status during wait
async checkIssueStatus(issueNumber, projectConfig)
```

## Dependencies

- `@skills/gitcode-sdk` → `[11]` GitCode API — poll Issue status
- `[2]` ConfigManager — read `waitHours` setting

## Test Strategy — Tier 3 (no separate tests)

Trivial time comparison + API polling. Tested through orchestrator integration.

# [4] Orchestrator

Component number: [4]
File: `lib/orchestrator.js`

## Responsibility

Coordinates the 7-stage pipeline per project. Manages stage transitions, failure recovery, retry loops, and concurrent project execution.

## Interface

```javascript
class Orchestrator {
  constructor(configManager, stateStore, stageModules)

  // Run full pipeline for one or all projects
  async runPipeline(options)  // options: { mode: 'scan'|'fix', project: null|string, immediate: bool }

  // Run pipeline for a specific project
  async runProjectPipeline(projectConfig)

  // Run a single stage
  async runStage(stageName, input, projectConfig)
}
```

## Dependencies

- `[2]` ConfigManager — provides project configs
- StateStore — reads/writes pipeline state
- `[5]` SCAN stage module
- `[6]` VERIFY stage module
- `[7]` ISSUE stage module (uses `[7a]` IssueManager)
- `[8]` WAIT stage module
- `[9]` FIX stage module (uses `[9a]` FixAgent, `[12]` GitManager)
- `[6]` VERIFY+TEST stage module (uses `[6a]` TestDiscovery)
- `[10]` PRManager

All stage modules are injected — orchestrator doesn't import them directly. This enables testing with mocks.

## Stage Transition Logic

```
SCAN → findings[] → VERIFY
VERIFY → confirmedFindings[] → ISSUE (only if confirmed)
ISSUE → issueRecords[] → WAIT (or skip if --immediate)
WAIT → approvedIssues[] → FIX
FIX → fixAttempts[] → TEST
TEST → testResults[] → PR (if tests pass) or retry FIX (if tests fail)
PR → prRecords[] → done
```

## Failure Recovery

- Any stage failure: log warning, continue with remaining findings/projects
- FIX/TEST failure: retry up to `maxRetries` (default 3), then mark Issue `bot-unable-to-fix`
- SCAN failure: skip finding, don't block pipeline
- VERIFY can't confirm: mark `unverified`, proceed with lower priority

## Concurrency

- Multiple projects run independently (no state cross-contamination)
- Within a project, `concurrentFixes` (default 2) limits parallel fix pipelines
- SCAN agents run in parallel within the scan stage

## Test Strategy — Tier 1

**File:** `tests/orchestrator.test.js`
**Why Tier 1:** Pipeline coordination is the most complex component. Stage transitions, failure recovery, and retry loops are easy to get wrong.

| Test | Description |
|------|-------------|
| Full pipeline (mock) | Runs all 7 stages in order with mocked sub-components |
| Stage failure recovery | SCAN fails → logs warning, continues with empty findings |
| VERIFY filters false positives | Unconfirmed findings don't reach ISSUE stage |
| WAIT skip (--immediate) | Skips wait stage when flag is set |
| Fix retry loop | FIX fails twice → retries → succeeds on 3rd attempt |
| Max retry exhaustion | FIX fails 3 times → marks Issue `bot-unable-to-fix` |
| Concurrent project pipelines | Two projects run independently, state doesn't cross-contaminate |

**Mocking:** All stage modules injected as mocks. StateStore mocked.

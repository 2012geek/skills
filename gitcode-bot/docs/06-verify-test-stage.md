# [6] VERIFY + TEST Stage

Component number: [6] VERIFY+TEST stage, [6a] Test Discovery + Generation
Files: `agents/test-reproducer.md`, `agents/test-generator.md`, `lib/test-runner.js`, `lib/test-discovery.js`, `@skills/gitcode-sdk/src/agent-runner.js` (from sdk), `@skills/gitcode-sdk/src/git-manager.js` (from sdk)

## Responsibility

Unified test component that serves two roles in the pipeline:
- **VERIFY** (pre-fix): generates reproduction tests to confirm bugs exist, eliminating false positives before creating Issues
- **TEST** (post-fix): validates fixes by re-running reproduction tests (must now PASS), comparing baseline results, and optionally generating new tests

Both roles share the same `TestRunner` and `TestDiscovery` infrastructure — only the expectation differs (FAIL vs PASS).

## Interface

```javascript
class VerifyTestStage {
  constructor(agentRunner, testRunner, testDiscovery, gitManager, stateStore)

  // === VERIFY role (pre-fix) ===

  // Run verification for a list of findings
  async verifyFindings(findings, projectConfig)

  // Verify a single finding — expect test to FAIL
  async verifyFinding(finding, projectConfig)

  // === TEST role (post-fix) ===

  // Run all test validations for a fix — expect verify test to PASS
  async validateFix(fixAttempt, issueRecord, projectConfig, baselineResult)

  // Run reproduction test (must now PASS after fix)
  async runVerifyTest(verifyTest, projectConfig)

  // Run baseline comparison (compare pre/post fix results)
  async runBaselineComparison(baselineResult, projectConfig)

  // Generate new tests for changed code paths (optional)
  async generateTests(changedFiles, projectConfig)
}
```

## Test Runner Interface

```javascript
class TestRunner {
  // Run test command in sandbox, capture output
  async run(testCommand, repoPath)  // returns { passCount, failCount, output }
}
```

## Test Discovery Interface

```javascript
class TestDiscovery {
  // Auto-detect test command from project files
  async discover(repoPath)  // returns string|null

  // Override: use config.testCommand if set
  async getTestCommand(projectConfig, repoPath)
}
```

## VERIFY Flow (pre-fix)

```
Finding → test-reproducer agent generates test code
  → clone repo to sandbox
  → install dependencies (npm install / pip install)
  → write test file to sandbox
  → run test
  → parse result

  ├─ Test FAILS → bug confirmed → finding.status = "confirmed"
  │               finding.verifyTest = { testCode, testResult: "FAILED", testOutput }
  │
  ├─ Test PASSES → false positive → finding.status = "discarded"
  │                 no Issue will be created
  │
  ├─ Can't write test → finding.status = "unverified"
  │                    (performance/design issues)
  │                    creates Issue but with lower priority
  │
  └─ Environment setup fails → retry once with install
                              → if still fails, mark "unverified"
```

## TEST Flow (post-fix)

1. **Verify test** — reproduction test from VERIFY MUST now PASS (fix confirmed)
2. **Baseline comparison** — run existing test suite, compare against pre-fix baseline
   - Same failures as baseline → OK, proceed to PR
   - More failures than baseline → retry FIX
3. **Generated tests** (optional) — `test-generator` agent writes tests for changed code paths

## Reproduction Test Format

The `test-reproducer` agent generates a test file that:
- Is minimal — only exercises the buggy code path
- Can be run by the project's test command (pytest, npm test, etc.)
- Produces a clear FAIL output when the bug is present
- Produces a clear PASS output when the bug is fixed

The same test is reused in TEST flow to validate the fix — opposite expectation, shared code.

## Test Command Auto-Discovery Order

1. `package.json` → `scripts.test` → `npm test`
2. `Makefile` → `test:` target → `make test`
3. `pytest.ini` / `pyproject.toml` → `pytest`
4. `tox.ini` → `tox`
5. `Cargo.toml` → `cargo test`
6. `go.mod` → `go test ./...`
7. `null` → ask user to configure manually

User override: if `config.testCommand` is set, skip auto-discovery entirely.

## Dependencies

- `@skills/gitcode-sdk` → `[13]` Agent Runner — calls test-reproducer / test-generator agents
- `@skills/gitcode-sdk` → `[12]` Git Manager — clones repo for sandbox, repo path access
- `lib/test-runner.js` — runs tests in sandbox (local, shared between VERIFY and TEST)
- `lib/test-discovery.js` — auto-detects test command (local)
- `[9a]` test-generator agent — optional new test generation (local)

## Test Strategy

### [6a] Test Discovery — Tier 1

**File:** `tests/test-discovery.test.js`
**Why Tier 1:** 7 different project type detectors — each format has its own parsing logic, easy to miss edge cases.

| Test | Description |
|------|-------------|
| `package.json` detection | Finds `scripts.test` → returns `npm test` |
| `Makefile` detection | Finds `test:` target → returns `make test` |
| `pytest.ini` detection | Finds pytest config → returns `pytest` |
| `tox.ini` detection | Finds tox config → returns `tox` |
| `Cargo.toml` detection | Finds Rust project → returns `cargo test` |
| `go.mod` detection | Finds Go project → returns `go test ./...` |
| No test command found | Returns null, prompts user to configure |
| User override | Config `testCommand` set → skips auto-discovery |

### VERIFY (pre-fix) — Tier 1

**File:** `tests/verify.test.js`
**Why Tier 1:** The confirm/reject decision point. Wrong decisions mean false Issues (noise) or missed bugs.

| Test | Description |
|------|-------------|
| Test FAILS (bug confirmed) | Finding marked as confirmed, proceeds to ISSUE |
| Test PASSES (false positive) | Finding discarded, no Issue created |
| Environment setup failure | Install fails → mark `unverified`, proceed with lower priority |
| Can't write reproduction test | Performance/design issues → mark `unverified` |

**Mocking:** agentRunner mocked (returns fixture test code). testRunner mocked (returns fixture test results). gitManager mocked.

### TEST (post-fix) — Tier 2

**File:** `tests/test.test.js`
**Why Tier 2:** Baseline comparison logic is the key part, but the rest is straightforward.

| Test | Description |
|------|-------------|
| Verify test passes after fix | Reproduction test now passes → fix confirmed |
| Verify test still fails | Reproduction test still fails → retry FIX (max 3) |
| Baseline comparison | Same failures as before → OK, proceed to PR |
| New failures introduced | More failures than baseline → retry FIX |

### test-generator agent — Tier 3 (no separate tests)

LLM-generated test code is non-deterministic. Fixture testing gives false confidence.

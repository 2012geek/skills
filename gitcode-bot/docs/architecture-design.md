# gitcode-bot Architecture Design

**Date:** 2026-07-01
**Status:** Draft — pending user approval

## Overview

`gitcode-bot` is a Claude Code skill that autonomously monitors GitCode projects, detects problems, creates Issues, and fixes them with PRs. It operates as an **orchestrator** that composes existing GitCode skill patterns into an automated 7-stage pipeline.

**Trigger mode:** Hybrid — manual invocation via `/gitcode-bot` + scheduled recurring scans via `/loop` or cron.

**Scope:** Multi-project — monitors multiple GitCode repos from a single config.

**Relationship to existing skills:** Reuses patterns from `gitcode-code-review`, `gitcode-code-review-repair`, `gitcode-ci-repair`, and `gitcode-pr`, but does not invoke them directly. Shares common infrastructure through the `@skills/gitcode-sdk` workspace package.

**Component design principle:** Each component is **loosely coupled** — it has its own dedicated design document defining its interface, dependencies, and test strategy. Components communicate through well-defined interfaces, not shared state.

---

## 7-Stage Pipeline

```
1. SCAN    → Analyze project(s) for problems
2. VERIFY  → Write reproduction test to confirm each finding (expect FAIL)
3. ISSUE   → Create GitCode Issue (only if test confirms bug)
4. WAIT    → Pause for human triage (configurable hours)
5. FIX     → LLM generates code fix per issue
6. TEST    → Re-run reproduction test (must now PASS) + baseline + generate new tests
7. PR      → Create per-issue branch + PR
```

Note: VERIFY (step 2) and TEST (step 6) are both handled by component **[6]** — they share the same `TestRunner` and `TestDiscovery` code, but with opposite expectations (FAIL vs PASS).

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        gitcode-bot                                │
│                    (Claude Code Skill)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌───────────┐    ┌──────────────┐           │
│  │[0] CLI /    │    │[1]        │    │[2] Config    │           │
│  │  Skill Invoke│───▶│ Scheduler │───▶│  Manager     │           │
│  │  /gitcode-bot│    │(cron/loop)│    │  projects[]  │           │
│  └─────────────┘    └───────────┘    └──────────────┘           │
│       │                    │               │                     │
│       ▼                    ▼               ▼                     │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │[3] State     │  │[4]           │                              │
│  │  Store       │◀─│ Orchestrator │                              │
│  └──────────────┘  │(7-stage      │                              │
│                     │ pipeline)    │                              │
│                     └──────────────┘                              │
│                            │                                      │
│                            ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                 Pipeline Stages                           │   │
│  │                                                          │   │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │   │
│  │  │[5]   │─▶│[6]  │─▶│[7]  │─▶│[8]  │─▶│[9]  │─▶│[6]  │ │   │
│  │  │ SCAN │  │VERIFY│  │ISSUE│  │ WAIT │  │ FIX  │  │ TEST │ │   │
│  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │   │
│  │      │       │              │       │                 │ │   │
│  │      ▼       ▼              ▼       ▼                 │ │   │
│  │  ┌───────┐ ┌───────┐       ┌───────┐                │ │   │
│  │  │[5a]   │ │[7a]   │       │[9a]   │                │ │   │
│  │  │Scan   │ │Issue  │       │Fix    │                │ │   │
│  │  │Agents │ │Manager│       │Agent  │                │ │   │
│  │  │(4)    │ │       │       │+LLM   │                │ │   │
│  │  └───────┘ └───────┘       └───────┘                │ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                      │
│                            ▼                                      │
│                     ┌──────────────┐                              │
│                     │[10] PR       │                              │
│                     │  Manager     │                              │
│                     └──────────────┘                              │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  @skills/gitcode-sdk — Shared Workspace Package (packages/)     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  gitcode-sdk/src/                                          │ │
│  │                                                            │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐ │ │
│  │  │[11]      │ │[12]      │ │[13]        │ │http-client │ │ │
│  │  │gitcode   │ │git       │ │agent       │ │config-     │ │ │
│  │  │-api.js   │ │-manager  │ │-runner.js  │ │loader.js   │ │ │
│  │  │          │ │.js       │ │            │ │comment-    │ │ │
│  │  │          │ │          │ │            │ │formatter.js│ │ │
│  │  └──────────┘ └──────────┘ └────────────┘ └────────────┘ │ │
│  │                                                            │ │
│  │  Consumers (workspace:*):                                  │ │
│  │  gitcode-code-review │ gitcode-ci-repair │ gitcode-pr     │ │
│  │  gitcode-code-review-repair │ gitcode-bot                │ │
│  └────────────────────────────────────────────────────────────┘ │
│       │                │              │                          │
│       ▼                ▼              ▼                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              External Services (outside skills monorepo)  │   │
│  │                                                          │   │
│  │  ┌────────────────┐  ┌────────────────┐                  │   │
│  │  │ GitCode Server │  │ Claude Code    │                  │   │
│  │  │ (REST API)     │  │ Skill System   │                  │   │
│  │  │                │  │ (LLM calls)    │                  │   │
│  │  └────────────────┘  └────────────────┘                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘

Component Number Reference:
  [0]  CLI / Skill Invoke    — /gitcode-bot command entry point
  [1]  Scheduler             — cron/recurring scan scheduling
  [2]  Config Manager        — multi-project config loader & validator
  [3]  State Store           — finding/issue/fix/PR state persistence
  [4]  Orchestrator          — coordinates 7-stage pipeline per project
  [5]  SCAN stage            — 4 parallel scan agents
  [5a] Scan Agents           — code-analyzer, issue-reader, commit-watcher, ci-failure-reader
  [6]  VERIFY+TEST stage     — pipeline step 2 (VERIFY: expect FAIL) + step 6 (TEST: expect PASS), shared code
  [7]  ISSUE stage           — creates GitCode Issues for confirmed findings
  [7a] Issue Manager         — GitCode Issue CRUD + deduplication
  [8]  WAIT stage            — configurable delay for human triage
  [9]  FIX stage             — LLM generates code patch per issue
  [9a] Fix Agent             — code-fixer agent + git-manager
  [10] PR Manager            — create per-issue branch + PR with semantic description
  [11] GitCode API Wrapper   — @skills/gitcode-sdk: wraps GitCode REST API (Issues, PRs, CI)
  [12] Local Git Wrapper     — @skills/gitcode-sdk: wraps git CLI (clone, branch, patch, push)
  [13] Agent Runner          — @skills/gitcode-sdk: loads agent .md files, builds prompts, calls LLM

  Shared package: @skills/gitcode-sdk — npm workspace package, consumed by all GitCode skills.
  Docs: 00-14 — every component has its own doc (00-cli.md through 14-gitcode-sdk.md).
```

Each component has a **dedicated design document** — see [Component Documents](#component-documents) below.

---

## Data Flow & State Tracking

Each finding travels through the pipeline as a stateful object:

```
SCAN                     VERIFY                    ISSUE
┌──────────┐            ┌──────────────┐         ┌──────────────┐
│ Finding  │───────────▶│ Finding +    │────────▶│ IssueRecord  │
│ {        │            │ verifyTest   │         │ {            │
│  id,     │            │ {            │         │  issueNumber,│
│  source, │            │  testCode,   │         │  findingId,  │
│  severity│            │  testResult: │         │  verifyTest, │
│  title,  │            │  "FAILED",   │         │  status:     │
│  desc,   │            │  testOutput  │         │  "open",     │
│  file,   │            │ }            │         │  branch: null│
│  line    │            │ }            │         │ }            │
│ }        │            │              │         │              │
└──────────┘            └──────────────┘         └──────────────┘

     WAIT                      FIX                     PR
┌──────────────┐         ┌──────────────┐        ┌──────────────┐
│ IssueRecord  │────────▶│ FixAttempt   │───────▶│ PRRecord     │
│ {            │         │ {            │        │ {            │
│  status:     │         │  attempt: 1, │        │  prNumber,   │
│  "approved"  │         │  patch,      │        │  branch,     │
│ }            │         │  testResult: │        │  issueRef,   │
│              │         │  "PASSED",   │        │  status:     │
│              │         │  retries: 0  │        │  "created"   │
│              │         │ }            │        │ }            │
└──────────────┘         └──────────────┘        └──────────────┘
```

State persisted per project in `~/.gitcode-bot/state/` — see [03-state-store.md](03-state-store.md).

---

## Error Handling

| Stage | Failure | Recovery |
|-------|---------|----------|
| SCAN | LLM timeout/hallucination | Skip finding, log warning, continue |
| VERIFY | Can't write reproduction test | Mark `unverified`, create Issue with lower priority |
| VERIFY | Test environment setup fails | Attempt `npm install` / `pip install`, retry once |
| ISSUE | GitCode API rate limit | Exponential backoff, retry |
| ISSUE | Duplicate Issue exists | Skip, link existing Issue |
| WAIT | Human closes Issue | Abort fix pipeline for that Issue |
| FIX | LLM generates invalid code | Retry with more context (max 3), mark `bot-unable-to-fix` |
| FIX | Git merge conflict | Rebase from latest main, retry |
| TEST | Pre-existing test failures | Run baseline before fix, only block on NEW failures |
| TEST | Verify test still fails after fix | Retry fix (max 3), mark `bot-unable-to-fix` |
| PR | GitCode API rejects PR | Comment on Issue, mark `bot-blocked` |

**Baseline testing principle:** Before applying any fix, run the existing test suite to record pass/fail counts. After fix, compare — only NEW failures block the PR.

---

## Skill Invocation & CLI Interface

```
/gitcode-bot scan                    ← one-shot scan + verify only
/gitcode-bot fix                     ← scan + verify + issue + fix + test + PR
/gitcode-bot fix --issue 42          ← fix a specific existing Issue
/gitcode-bot fix --immediate         ← skip the wait stage
/gitcode-bot status                  ← show pipeline state for all projects
/gitcode-bot status --project repo-A ← show state for one project
/gitcode-bot init                    ← create ~/.gitcode-bot/config.json
```

Separate observe and act cycles:
- **Scheduled:** `scan` only (passive, safe to automate)
- **Manual/scheduled:** `fix` (active, needs human oversight or confidence)

---

## Priority Order for Fixes

1. **Security vulnerabilities** (severity: critical)
2. **CI failures** (blocking the project)
3. **Existing GitCode Issues** (already reported by humans)
4. **Code quality issues** (severity: medium → low)

`concurrentFixes` setting (default: 2) limits parallel fixes per project.

---

## File Structure

```
gitcode-bot/
├── SKILL.md                       # Skill definition for /gitcode-bot
├── README.md                      # User-facing documentation
├── package.json                   # Dependencies
│
├── docs/
│   ├── architecture-design.md       # This doc — overall architecture overview
│   ├── 00-cli.md                    # [0]  CLI / Skill Invoke
│   ├── 01-scheduler.md              # [1]  Scheduler (cron/recurring)
│   ├── 02-config-manager.md         # [2]  Multi-project config & validation
│   ├── 03-state-store.md            # [3]  Data flow & state persistence
│   ├── 04-orchestrator.md           # [4]  Orchestrator pipeline coordinator
│   ├── 05-scan-stage.md             # [5]  + [5a] Scan stage & agents
│   ├── 06-verify-test-stage.md       # [6]  Verify + Test stage & discovery
│   ├── 07-issue-stage.md            # [7]  + [7a] Issue stage & manager
│   ├── 08-wait-stage.md             # [8]  WAIT stage
│   ├── 09-fix-stage.md              # [9]  + [9a] Fix stage & agent
│   ├── 10-pr-manager.md             # [10] PR creation & management
│   ├── 11-gitcode-api.md            # [11] GitCode API (from gitcode-sdk)
│   ├── 12-git-manager.md            # [12] Git Manager (from gitcode-sdk)
│   ├── 13-agent-runner.md           # [13] Agent Runner (from gitcode-sdk)
│   └── 14-gitcode-sdk.md            # Shared workspace package design
│
├── lib/
│   ├── orchestrator.js
│   ├── project-manager.js
│   ├── state-store.js
│   ├── issue-manager.js
│   ├── test-discovery.js
│   ├── test-runner.js
│   └── deduplicator.js
│   # [11] gitcode-api.js, [12] git-manager.js, [13] agent-runner.js
│   # → imported from @skills/gitcode-sdk, NOT local files
│
├── agents/
│   ├── code-analyzer.md
│   ├── issue-reader.md
│   ├── commit-watcher.md
│   ├── ci-failure-reader.md
│   ├── test-reproducer.md
│   ├── code-fixer.md
│   ├── test-generator.md
│   ├── issue-prioritizer.md
│   └── pr-description-writer.md
│
├── scripts/
│   ├── bot.js
│   ├── scan.js
│   ├── fix.js
│   └── status.js
│
├── templates/
│   ├── issue-template.md
│   └── pr-template.md
│
└── tests/
    ├── orchestrator.test.js
    ├── deduplicator.test.js
    ├── verify.test.js
    ├── test-discovery.test.js
    ├── gitcode-api.test.js
    ├── git-manager.test.js
    ├── issue-manager.test.js
    ├── config-manager.test.js
    ├── test.test.js
    ├── pr-manager.test.js
    ├── fix.test.js
    └── fixtures/
        ├── mock-gitcode-issues-response.json
        ├── mock-gitcode-api-responses.json
        ├── sample-config-valid.json
        ├── sample-config-invalid.json
        ├── sample-package.json
        ├── sample-pyproject.toml
        ├── sample-Makefile
        ├── sample-unified-diff.patch
        └── sample-test-output.txt
```

**Dependencies:**

```
package.json:
  - @skills/gitcode-sdk: "workspace:*"  ← Shared package (GitCode API, Git, Agent Runner)
  - simple-git                          ← Git operations (used by gitcode-sdk, not here)
  - yaml                                ← Parse agent frontmatter (used by gitcode-sdk, not here)
```

Note: `gitcode-api.js`, `git-manager.js`, `agent-runner.js` are imported from `@skills/gitcode-sdk`, not stored locally. This eliminates code duplication across all GitCode skills.

No `@anthropic-ai/sdk` needed — as a Claude Code skill, LLM calls are handled by the skill system itself.

---

## Component Documents

Each component has a dedicated design document under `docs/`. These documents are **self-contained** — they define the component's interface, dependencies, behavior, and test strategy independently. Components are loosely coupled and communicate through well-defined interfaces.

| Component | Document | Description |
|-----------|----------|-------------|
| [0] CLI | [00-cli.md](00-cli.md) | /gitcode-bot command entry point, argument parsing |
| [1] Scheduler | [01-scheduler.md](01-scheduler.md) | cron/recurring scan scheduling via /loop |
| [2] Config Manager | [02-config-manager.md](02-config-manager.md) | Multi-project config loader, validation, defaults |
| [3] State Store | [03-state-store.md](03-state-store.md) | Finding/Issue/Fix/PR state persistence & data flow |
| [4] Orchestrator | [04-orchestrator.md](04-orchestrator.md) | Pipeline coordinator: stage transitions, retry logic, failure recovery |
| [5]+[5a] SCAN | [05-scan-stage.md](05-scan-stage.md) | 4 parallel scan agents + deduplication |
| [6] VERIFY+TEST | [06-verify-test-stage.md](06-verify-test-stage.md) | Reproduction test, fix validation, baseline comparison, test generation |
| [7]+[7a] ISSUE | [07-issue-stage.md](07-issue-stage.md) | GitCode Issue creation, deduplication, labeling |
| [8] WAIT | [08-wait-stage.md](08-wait-stage.md) | Configurable delay for human triage |
| [9]+[9a] FIX | [09-fix-stage.md](09-fix-stage.md) | LLM patch generation, branch creation, retry logic |
| [10] PR Manager | [10-pr-manager.md](10-pr-manager.md) | PR creation, Issue linking, semantic descriptions |
| [11] GitCode API | [11-gitcode-api.md](11-gitcode-api.md) | @skills/gitcode-sdk: wraps GitCode REST API |
| [12] Git Manager | [12-git-manager.md](12-git-manager.md) | @skills/gitcode-sdk: wraps git CLI |
| [13] Agent Runner | [13-agent-runner.md](13-agent-runner.md) | @skills/gitcode-sdk: loads agents, builds prompts, calls LLM |
| Shared Package | [14-gitcode-sdk.md](14-gitcode-sdk.md) | Workspace package design & monorepo strategy |

---

## Shared Package Strategy — `@skills/gitcode-sdk`

**Problem:** `gitcode-api.js` is duplicated across 4 existing skills (3 copies are nearly identical, 2 are byte-for-byte identical). `agent-runner.js`, `config-loader.js`, and `comment-formatter.js` also have duplication potential.

**Solution:** Extract shared code into `packages/gitcode-sdk/` — an npm workspace package (like `@nuxt/kit` or `@storybook/client-shared`), consumed by all GitCode skills via `workspace:*`.

```
skills/                              ← monorepo root
├── package.json                     ← workspaces: ["packages/*", "gitcode-*"]
├── packages/
│   └── gitcode-sdk/                 ← @skills/gitcode-sdk
│       ├── package.json             ← name: "@skills/gitcode-sdk", private: true
│       ├── src/
│       │   ├── gitcode-api.js       ← [11] Merged from 3+ duplicates
│       │   ├── http-client.js       ← Shared HTTP request wrapper
│       │   ├── config-loader.js     ← Shared config.json loading
│       │   ├── agent-runner.js      ← [13] Agent .md loading + LLM calls
│       │   └── comment-formatter.js ← Shared comment formatting + references
│       │   └── index.js             ← Barrel exports
│       └── tests/
│           ├── gitcode-api.test.js
│           └── agent-runner.test.js
│
├── gitcode-code-review/             ← depends on @skills/gitcode-sdk: "workspace:*"
├── gitcode-code-review-repair/      ← extends GitCodeAPI from sdk
├── gitcode-ci-repair/               ← depends on @skills/gitcode-sdk
├── gitcode-pr/                      ← depends on @skills/gitcode-sdk
└── gitcode-bot/                     ← depends on @skills/gitcode-sdk
```

**Principles (learned from Babel + Storybook + Nuxt):**
- `gitcode-sdk` only holds code used by **2+ skills** — not a dumping ground
- It's a **private package** (`private: true`), never published to npm
- `workspace:*` protocol creates symlinks at install time — no build step needed for local dev
- Each skill keeps its own skill-specific code locally (`lib/orchestrator.js`, `lib/deduplicator.js`, etc.)

See [14-gitcode-sdk.md](14-gitcode-sdk.md) for full design.

---

## Next Steps

After this design is approved:

1. Create `@skills/gitcode-sdk` workspace package (extract shared code from existing skills)
2. Write implementation plan via `superpowers:writing-plans` skill
3. Build incrementally: start with SCAN + VERIFY stages, then add ISSUE → FIX → TEST → PR

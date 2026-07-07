# [5]+[5a] SCAN Stage & Agents

Component number: [5] SCAN stage, [5a] Scan Agents
Files: `agents/code-analyzer.md`, `agents/issue-reader.md`, `agents/commit-watcher.md`, `agents/ci-failure-reader.md`, `lib/deduplicator.js` (local), `@skills/gitcode-sdk/src/agent-runner.js` (from sdk)

## Responsibility

SCAN stage runs 4 agents in parallel to detect problems from multiple sources. Deduplicator merges overlapping findings. AgentRunner loads agent `.md` files and builds prompts.

## SCAN Stage Interface

```javascript
class ScanStage {
  constructor(agentRunner, deduplicator)

  // Run all scan agents for a project, return deduplicated findings
  async run(projectConfig, context)
}
```

## Agent Runner Interface

```javascript
class AgentRunner {
  constructor(agentsDir)  // path to agents/*.md

  // Load agent definition, parse YAML frontmatter
  async loadAgent(agentName)

  // Build prompt with project context
  buildPrompt(agent, context)

  // Run agent via Claude Code skill system (LLM call)
  async runAgent(agentName, context)

  // Parse structured findings from LLM response
  parseFindings(response)
}
```

## Deduplicator Interface

```javascript
class Deduplicator {
  // Merge findings from multiple agents, remove duplicates
  deduplicate(findings[])
}
```

## 4 Scan Agents

| Agent | Purpose | Model | Source |
|-------|---------|-------|--------|
| `code-analyzer` | Proactive code quality/security/performance scan | Opus | Repo files |
| `issue-reader` | Read existing open GitCode Issues, assess fixability | Sonnet | GitCode Issues API |
| `commit-watcher` | Monitor recent commits for potential problems | Sonnet | Git log/diff |
| `ci-failure-reader` | Parse CI failure status/bot comments | Haiku | GitCode CI API |

## Deduplication Rules

- Same file + same line from different agents → merged into one finding
- Same root cause, different file locations → linked as related, kept separate
- Different symptoms, different files → kept as separate findings

## Dependencies

- `@skills/gitcode-sdk` → `[11]` GitCode API — for issue-reader and ci-failure-reader data
- `@skills/gitcode-sdk` → `[12]` Git Manager — for commit-watcher (git log/diff)
- `@skills/gitcode-sdk` → `[13]` Agent Runner — for loading and running agents
- Claude Code skill system — for LLM calls

## Test Strategy

### [5a] Deduplicator — Tier 1

**File:** `tests/deduplicator.test.js`
**Why Tier 1:** Pure algorithm with common edge cases.

| Test | Description |
|------|-------------|
| Same file+line from different agents | Merged into one finding |
| Same root cause, different file locations | Linked as related, not merged |
| Different symptoms, different files | Kept as separate findings |
| Empty findings list | Returns empty, no crash |

### AgentRunner & Agent Outputs — Tier 3 (no separate tests)

LLM output is non-deterministic. Fixture-based testing gives false confidence. AgentRunner prompt loading is simple enough that bugs are immediately visible.

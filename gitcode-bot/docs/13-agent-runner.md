# [13] Agent Runner

Component number: [13]
Package: `@skills/gitcode-sdk`
File: `packages/gitcode-sdk/src/agent-runner.js`

## Responsibility

Loads agent definition files (`agents/*.md`), parses YAML frontmatter, builds prompts with project context, and calls LLM via the Claude Code skill system. This is the shared infrastructure that all LLM-dependent pipeline stages use.

## Interface

```javascript
class AgentRunner {
  constructor(agentsDir)  // path to agents/*.md directory

  // Load agent definition, parse YAML frontmatter
  async loadAgent(agentName)
  // Returns: { name, model, description, promptTemplate }

  // Build prompt by injecting project context into agent template
  buildPrompt(agent, context)
  // context: { files, recentCommits, ciStatus, issueDescription, reproductionTest, ... }
  // Returns: string (full prompt ready for LLM)

  // Run agent via Claude Code skill system (LLM call)
  async runAgent(agentName, context)
  // Returns: string (raw LLM response)

  // Parse structured findings from LLM JSON response
  parseFindings(response)
  // Returns: Finding[] or throws if malformed

  // Parse unified diff patch from LLM response
  parsePatch(response)
  // Returns: string (patch content) or throws if malformed
}
```

## Agent Definition Format

Each agent is a `.md` file with YAML frontmatter:

```markdown
---
name: code-analyzer
model: opus
description: Proactive code quality/security/performance scan
---

## Context

You are analyzing a GitCode project for potential problems...

## Output Format

Return a JSON array of findings:
```json
[{
  "severity": "security|critical|medium|low",
  "title": "...",
  "description": "...",
  "file": "...",
  "line": 123,
  "suggestion": "..."
}]
```
```

## Prompt Building Logic

1. Load agent `.md` file
2. Parse YAML frontmatter → extract name, model, description
3. Inject context variables into the prompt body:
   - `{files}` — relevant source code content
   - `{recentCommits}` — git log/diff data (for commit-watcher)
   - `{ciStatus}` — CI pipeline results (for ci-failure-reader)
   - `{issueDescription}` — Issue body text (for code-fixer)
   - `{reproductionTest}` — reproduction test code (for code-fixer)
   - `{changedFiles}` — list of changed file paths (for test-generator)
4. Return assembled prompt string

## LLM Call Mechanism

As a Claude Code skill, LLM calls go through the skill system — no `@anthropic-ai/sdk` needed. The agent runner constructs the prompt and passes it to the skill invocation context, which handles model selection based on frontmatter `model` field (opus, sonnet, haiku).

## Output Parsing

Two parse methods handle different agent output types:

- `parseFindings()` — expects JSON array of findings. Malformed JSON → throw, skip in caller
- `parsePatch()` — extracts unified diff from response (between ````diff` markers). No diff found → throw

## Used By

| Component | Agent | What it gets |
|-----------|-------|-------------|
| [5a] Scan Agents | code-analyzer, issue-reader, commit-watcher, ci-failure-reader | Findings[] via parseFindings() |
| [6] VERIFY+TEST | test-reproducer, test-generator | Test code string via runAgent() |
| [9a] Fix Agent | code-fixer | Patch via parsePatch() |
| [10] PR Manager | pr-description-writer | Description string via runAgent() |

## Dependencies

- `yaml` library — parse agent frontmatter
- Claude Code skill system — LLM execution (no direct SDK dependency)
- Agent `.md` files — prompt templates

## Test Strategy — Tier 3 (no separate tests)

The agent runner's core logic (prompt construction) is simple string templating — bugs are immediately visible when an agent fails to produce output. LLM response parsing is tested through the calling components' integration tests (orchestrator, verify, fix).

No dedicated test file. Parsing edge cases (malformed JSON, missing diff markers) are handled in the calling components' tests where they arise.

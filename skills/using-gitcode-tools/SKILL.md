---
name: using-gitcode-tools
description: Use when starting a GitCode-related conversation — establishes how to find and use gitcode-tools skills, requiring Skill tool invocation before ANY response
---

## How to Access Skills

Use the `Skill` tool. When you invoke a skill, its content is loaded and presented to you — follow it directly.

## Available Skills in gitcode-tools

| Skill | Description | Invoke |
|-------|-------------|--------|
| code-review | Multi-agent PR code review | `/gitcode-tools:code-review 46` |
| code-review-repair | Auto-fix review comments | `/gitcode-tools:code-review-repair` |
| ci-repair | Auto-repair CI failures | `/gitcode-tools:ci-repair 123` |
| pr | Create PRs with semantic descriptions | `/gitcode-tools:pr` |
| bot | Autonomous project monitor | `/gitcode-tools:bot` |

## Rule

If a user mentions GitCode, PR review, CI failures, or PR creation, invoke the relevant skill BEFORE any other action.

# GitCode Code Review Skill — Design Document

**Date**: 2026-06-30
**Project**: vla-factory
**Author**: chenlening + Claude

## Summary

Adapt the existing gitcode-code-review multi-agent PR review tool into a project skill for vla-factory. The skill will be discoverable by multiple AI coding agents (Claude Code, OpenCode, etc.) and configurable via environment variables instead of config.json.

## 1. Approach: Minimal Adaptation + Skill Wrapper

- Copy the full gitcode-code-review directory into `skills/gitcode-code-review/`
- Replace config.json with environment variables (GITCODE_TOKEN, GITCODE_OWNER, etc.)
- Add a Claude Code slash command via `.claude/commands/gitcode-code-review.md`
- Add a CLAUDE.md section for cross-agent discovery
- Keep all 8 scripts intact (review, create-pr, update-pr, description generators, etc.)
- Defaults target the vla-factory repo (openeuler/vla-factory)

## 2. File Structure

```
vla-factory/
├── skills/gitcode-code-review/         # Copied from original skill
│   ├── agents/                         # 6 agent prompt .md files
│   ├── lib/                            # gitcode-api.js, comment-formatter.js, agent-runner.js, variable-tracker.js
│   ├── scripts/                        # All 8 scripts
│   ├── tests/                          # Jest tests
│   ├── package.json                    # Dependencies (jest only)
│   ├── README.md                       # Updated for vla-factory context
│   └── .env.example                    # Template for required env vars
│
├── .claude/commands/
│   └── gitcode-code-review.md          # Claude Code slash command (/gitcode-code-review)
│
├── .claude/settings.local.json         # (existing)
│
├── CLAUDE.md                           # Add GitCode Code Review section
├── .env                                # Actual env vars — NOT committed
└── .gitignore                          # Add .env entry
```

## 3. Multi-Agent Discovery Strategy

| Agent | Discovery Mechanism |
|-------|-------------------|
| Claude Code | `.claude/commands/gitcode-code-review.md` → `/gitcode-code-review` slash command |
| OpenCode / CLAUDE.md readers | `CLAUDE.md` section describing the skill |
| Any agent with Bash | Direct invocation: `node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr <number>` |

**Single source of truth**: CLAUDE.md + .claude/commands/. No duplicate copies in .cursor/rules/, .windsurfrules, etc.

## 4. Environment Variables (replaces config.json)

| Variable | Purpose | Default |
|----------|---------|---------|
| `GITCODE_TOKEN` | Personal access token | (required, no default) |
| `GITCODE_OWNER` | Repository owner | `openeuler` |
| `GITCODE_REPO` | Repository name | `vla-factory` |
| `GITCODE_BASE_URL` | GitCode API URL | `https://api.gitcode.com` |
| `GITCODE_CONFIDENCE_THRESHOLD` | Min confidence for issues | `80` |

## 5. Slash Command Definition

File: `.claude/commands/gitcode-code-review.md`

- Command: `/gitcode-code-review <PR-number>`
- Steps: verify env vars → run reviewer script → summarize results
- Flags: --dry-run for preview, --skip-validation for speed
- Other scripts accessible: create-pr, update-pr, generate-smart-pr-desc

## 6. Code Changes

### Changed files
| File | Change |
|------|--------|
| `lib/gitcode-api.js` | Replace config.json reading with `process.env` lookups. Add defaults for owner, repo, baseUrl. |
| `scripts/gitcode-reviewer.js` | Remove config.json loading. Use env vars. |
| `scripts/create-pr.js` | Same env var change. |
| `scripts/update-pr.js` | Same env var change. |
| `scripts/generate-smart-pr-desc.js` | Same env var change. |
| `scripts/generate-pr-description.js` | Same env var change. |
| `scripts/gitcode-pr-reviewer.js` | Same env var change. |
| `scripts/update-pr-from-commits.js` | Same env var change. |
| `README.md` | Rewrite for vla-factory context. |
| `.env.example` | New — list all env vars with defaults. |
| `.gitignore` | Add `.env` entry. |
| `.claude/commands/gitcode-code-review.md` | New — slash command definition. |
| `CLAUDE.md` | New/updated — add GitCode Code Review section. |

### Unchanged files
All agent .md files, lib/comment-formatter.js, lib/agent-runner.js, lib/variable-tracker.js, tests/, docs/ — work as-is.

## 7. Success Criteria

1. `/gitcode-code-review 42` works in Claude Code and runs the full review pipeline
2. `node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 42 --dry-run` works from any agent's Bash
3. Environment variables replace config.json completely
4. `.env` is gitignored, `.env.example` documents required vars
5. CLAUDE.md contains skill reference for non-Claude-Code agents

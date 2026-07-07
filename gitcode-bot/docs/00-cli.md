# [0] CLI / Skill Invoke

Component number: [0]
File: `scripts/bot.js`

## Responsibility

Entry point for `/gitcode-bot` command. Parses arguments and calls Orchestrator with the appropriate mode.

## Commands

| Command | Action |
|---------|--------|
| `/gitcode-bot scan` | One-shot scan + verify only |
| `/gitcode-bot fix` | Full pipeline (scan → verify → issue → fix → test → PR) |
| `/gitcode-bot fix --issue 42` | Fix a specific existing Issue |
| `/gitcode-bot fix --immediate` | Skip the wait stage |
| `/gitcode-bot status` | Show pipeline state for all projects |
| `/gitcode-bot status --project repo-A` | Show state for one project |
| `/gitcode-bot init` | Create ~/.gitcode-bot/config.json |

## Interface

```javascript
// Parses args, calls Orchestrator
async main(args)
```

## Dependencies

- `[2]` ConfigManager — loads project configs
- `[4]` Orchestrator — runs pipeline with parsed mode

## Test Strategy — Tier 3 (no separate tests)

Argument parsing — a few lines of code. Bugs are immediately visible when a command doesn't work.

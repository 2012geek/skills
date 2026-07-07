# [1] Scheduler

Component number: [1]
File: `scripts/bot.js` (scheduler logic within CLI)

## Responsibility

Registers recurring scan schedules via Claude Code `/loop` command or system cron. No real logic — just wraps the scheduling mechanism.

## Behavior

- For scheduled runs: registers `/loop gitcode-bot scan` for passive recurring scans
- For manual runs: user invokes `/gitcode-bot fix` directly
- Scan mode is safe to automate (passive, no code changes)
- Fix mode needs human oversight or confidence

## Interface

```javascript
// Register recurring schedule
async scheduleScan(cronExpression, projectConfig)
```

## Dependencies

- `[0]` CLI — scheduler logic lives within the CLI entry point

## Test Strategy — Tier 3 (no separate tests)

Delegates to `/loop` or cron — no real logic to test, just scheduling calls.

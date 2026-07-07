# gitcode-bot

Autonomous GitCode project monitor — scans for problems, creates Issues, and fixes them with PRs.

## Quick Start

```bash
/gitcode-bot init     # Create config at ~/.gitcode-bot/config.json
/gitcode-bot scan     # Scan + verify all configured projects
/gitcode-bot fix      # Full pipeline: scan → verify → issue → fix → test → PR
```

## Config Format

Edit `~/.gitcode-bot/config.json`:

```json
{
  "projects": [
    {
      "owner": "your-org",
      "repo": "your-repo",
      "gitcodeToken": "your-token"
    }
  ],
  "bot": {
    "gitcodeToken": "shared-fallback-token",
    "maxRetries": 3,
    "concurrentFixes": 2,
    "label": "bot-detected"
  }
}
```

Token fallback order: project token → bot.gitcodeToken → GITCODE_TOKEN env var.

## Pipeline Stages

1. **SCAN** — 4 parallel agents detect problems from code, existing Issues, commits, and CI
2. **VERIFY** — reproduction test confirms bug exists (test must FAIL)
3. **ISSUE** — create GitCode Issue for confirmed bugs
4. **WAIT** — configurable delay for human triage (default 24h)
5. **FIX** — LLM generates code patch with retry logic (max 3 attempts)
6. **TEST** — reproduction test must now PASS + baseline comparison
7. **PR** — create per-issue branch and PR

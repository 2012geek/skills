# [2] Config Manager

Component number: [2]
File: `lib/project-manager.js`

## Responsibility

Loads, validates, and provides multi-project configuration. Manages defaults and token fallback logic.

## Interface

```javascript
class ConfigManager {
  constructor(configPath)  // defaults to ~/.gitcode-bot/config.json

  // Load and validate config
  async load()

  // Get all project configs (with defaults applied)
  getProjects()

  // Get single project config by owner/repo
  getProject(owner, repo)

  // Create initial config file (for /gitcode-bot init)
  async init(answers)  // interactive or from flags

  // Validate config structure
  validate(config)
}
```

## Config Schema

```json
{
  "projects": [
    {
      "owner": "string (required)",
      "repo": "string (required)",
      "gitcodeToken": "string (optional, falls back to bot.gitcodeToken)",
      "cloneUrl": "string (optional, auto-constructed from owner+repo)",
      "testCommand": "string|null (optional, null = auto-discover)",
      "watchPaths": "string[]|null (optional, null = scan everything)",
      "severityThreshold": "string (optional, default: medium)",
      "waitHours": "number (optional, default: 24)"
    }
  ],
  "bot": {
    "maxRetries": 3,
    "concurrentFixes": 2,
    "dryRun": false,
    "label": "bot-detected"
  }
}
```

## Default Values

- `waitHours`: 24
- `maxRetries`: 3
- `concurrentFixes`: 2
- `severityThreshold`: "medium"
- `dryRun`: false
- `label`: "bot-detected"

## Token Fallback Order

1. Project-specific `gitcodeToken`
2. `bot.gitcodeToken` (shared)
3. `GITCODE_TOKEN` env var
4. Error: "No GitCode token configured"

## Dependencies

None — this is the entry point. Other components depend on it.

## Test Strategy — Tier 1

**File:** `tests/config-manager.test.js`
**Why Tier 1:** Config validation is the system entry point — bad config causes cascading failures everywhere.

| Test | Description |
|------|-------------|
| Load valid config | Parses multi-project config, returns project list |
| Missing config file | Returns error with `init` suggestion |
| Invalid JSON | Returns parse error with line number |
| Missing required fields | Validates each project has `owner`, `repo` |
| Default values | `waitHours=24`, `maxRetries=3`, `concurrentFixes=2` |
| Token fallback | Falls back to `bot.gitcodeToken` if project lacks its own |
| Token from env | Reads `GITCODE_TOKEN` env var as last fallback |

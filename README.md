# GitCode Automation Skills

A collection of [Claude Code](https://github.com/anthropics/claude-code) skills for automating GitCode workflows - code review, CI repair, and PR management.

## Available Skills

| Skill | Description | Status |
|-------|-------------|--------|
| [gitcode-code-review](./gitcode-code-review/) | Multi-agent PR code review with bug scanning, security detection, and semantic analysis | ✅ Stable |
| [gitcode-code-review-repair](./gitcode-code-review-repair/) | Automatically fix review comments using LLM-generated patches | ✅ Stable |
| [gitcode-ci-repair](./gitcode-ci-repair/) | Auto-repair failed CI checks with iterative fixing until pass | ✅ Stable |
| [gitcode-pr](./gitcode-pr/) | Create PRs with auto-generated descriptions from diffs | 🚧 Beta |

## Prerequisites

- [Claude Code](https://github.com/anthropics/claude-code) installed and configured
- Node.js >= 18
- GitCode Personal Access Token with `repo` and `pull_request` scopes
- (Optional) Anthropic API Key for LLM-powered features

## Quick Setup

1. Clone this repository to your local machine
2. Link skills to your Claude Code plugins directory (or configure in your project)
3. Create a `config.json` in your project root with your GitCode token

```json
{
  "gitcode": {
    "token": "your_personal_access_token",
    "baseUrl": "https://api.gitcode.com",
    "owner": "your_org",
    "repo": "your_repo"
  },
  "anthropic": {
    "apiKey": "sk-ant-your-key-here"
  }
}
```

## Common Workflows

### Workflow 1: Review and Fix Cycle

```
Create PR → Code Review → Review Comments → Auto-Fix → Commit Amend → Push
    ↓            ↓             ↓              ↓           ↓         ↓
 gitcode-pr    gitcode-   gitcode-code-    gitcode-    git      git
               code-       review-repair    ci-repair   amend     push
                          review
```

**Example:**
```bash
# 1. Create a PR with auto-generated description
/gitcode-pr

# 2. Run automated code review (posts comments to PR)
/node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 123

# 3. Auto-fix review comments and CI failures
/gitcode-repair-pr
```

### Workflow 2: CI-First Approach

Fix CI failures immediately after pushing, before code review:

```bash
# After CI fails, run:
node skills/gitcode-ci-repair/scripts/repair.js 123
```

The skill will:
- Detect CI status from PR labels
- Parse failure types from bot comments
- Apply fixes (ruff, mypy, prettier, commit signoff)
- Use `git commit --amend` to avoid extra commits
- Trigger `/retest` and loop until pass

### Workflow 3: Manual Review with Auto-Fix

Generate review prompts for manual analysis, then auto-apply fixes:

```bash
# Generate agent prompts for manual review
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 123 --dry-run

# After manual review, save issues to issues.json, then auto-fix
node skills/gitcode-code-review-repair/scripts/repair-pr.js
```

## Configuration

All GitCode-related skills use a shared `config.json` file in your project root.

### Full Configuration Schema

```json
{
  "gitcode": {
    "token": "your_gitcode_personal_access_token",
    "baseUrl": "https://api.gitcode.com",
    "owner": "openeuler",
    "repo": "lerobot_ros2"
  },
  "anthropic": {
    "apiKey": "sk-ant-your-key-here"
  },
  "codeReview": {
    "confidenceThreshold": 80,
    "skipValidation": false
  }
}
```

### Getting Your GitCode Token

1. Visit [GitCode](https://gitcode.com) and log in
2. Click your avatar → Settings
3. Navigate to "Access Tokens" (访问令牌)
4. Create new token with `repo` and `pull_request` scopes
5. **Copy immediately** - tokens are only shown once

### Getting Your Anthropic API Key

1. Visit [Anthropic Console](https://console.anthropic.com)
2. Navigate to API Keys
3. Create a new key
4. Required for `gitcode-code-review-repair` (LLM-powered fixes)

### Skill-Specific Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `codeReview.confidenceThreshold` | number | 80 | Only report issues with confidence >= this value |
| `codeReview.skipValidation` | boolean | false | Skip issue validation (faster, less accurate) |

## Troubleshooting

### "Missing gitcode.token in config.json"

**Solution:** Ensure `config.json` exists in your project root with a valid GitCode token. See [Configuration](#configuration) above.

### "Git amend failed"

**Cause:** `git commit --amend` requires an existing commit to modify.

**Solution:** Make sure you have uncommitted changes or an existing commit. The skills use amend to avoid cluttering commit history.

### "Could not find review status" (gitcode-code-review-repair)

**Cause:** PR page HTML structure changed or API is unavailable.

**Solution:** The skill will attempt fallback to API-only mode. If issues persist, check GitCode API status.

### "Anthropic API rate limit exceeded"

**Solution:** Wait a moment and retry. The LLM-powered repair skill makes API calls for each review comment.

## Contributing

Contributions are welcome! This is a personal collection of skills, but improvements are appreciated:

1. **Bug Reports:** Open an issue with details
2. **Feature Requests:** Describe the use case and proposed behavior
3. **Pull Requests:** Ensure existing functionality passes before adding features

## License

MIT License - See individual skill directories for specific license information.

---

**For detailed documentation on each skill, visit the respective skill directory.**

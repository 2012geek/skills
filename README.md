# GitCode Tools — Claude Code Plugin

A [Claude Code](https://github.com/anthropics/claude-code) plugin for automating GitCode workflows — code review, CI repair, PR management, and project monitoring.

## Install (One Command)

```bash
/plugin marketplace add 2012geek/skills
/plugin install gitcode-tools@gitcode
```

Then use from any project:

```
/gitcode-tools:code-review 46
/gitcode-tools:ci-repair 123
/gitcode-tools:pr
/gitcode-tools:bot
/gitcode-tools:code-review-repair
```

## Skills

| Skill | Description | Invoke |
|-------|-------------|--------|
| code-review | Multi-agent PR code review with bug scanning, security detection, semantic analysis | `/gitcode-tools:code-review 46` |
| code-review-repair | Auto-fix PR review comments using LLM-generated patches | `/gitcode-tools:code-review-repair` |
| ci-repair | Auto-repair CI failures with iterative fixing until pass | `/gitcode-tools:ci-repair 123` |
| pr | Create PRs with auto-generated descriptions from diffs | `/gitcode-tools:pr` |
| bot | Autonomous project monitor — scan, verify, create issues, fix with PRs | `/gitcode-tools:bot` |

## Prerequisites

- [Claude Code](https://github.com/anthropics/claude-code) installed and configured
- Node.js >= 18
- `GITCODE_TOKEN` environment variable (GitCode Personal Access Token with `repo` and `pull_request` scopes)

```bash
export GITCODE_TOKEN=your_personal_access_token
```

- (Optional) Anthropic API Key for LLM-powered features

## Common Workflows

### Review and Fix Cycle

```
Create PR → Code Review → Review Comments → Auto-Fix → Commit Amend → Push
/gitcode-tools:pr   /gitcode-tools:code-review   /gitcode-tools:code-review-repair
```

### CI-First Approach

Fix CI failures immediately after pushing:

```
/gitcode-tools:ci-repair 123
```

### Autonomous Monitoring

Set up the bot to continuously scan and fix issues:

```
/gitcode-tools:bot init    # configure projects
/gitcode-tools:bot scan    # one-shot scan
/gitcode-tools:bot fix     # full pipeline
```

## Configuration

Each skill can also use a `config.json` in your project root (alternative to env vars):

```json
{
  "gitcode": {
    "token": "your_gitcode_personal_access_token",
    "baseUrl": "https://api.gitcode.com",
    "owner": "your_org",
    "repo": "your_repo"
  },
  "anthropic": {
    "apiKey": "sk-ant-your-key-here"
  }
}
```

## Plugin Structure

```
.claude-plugin/
├── marketplace.json          # marketplace listing
├── plugin.json               # plugin manifest
skills/
├── using-gitcode-tools/      # entry guide
├── code-review/              # multi-agent code review
├── code-review-repair/       # review comment repair
├── ci-rerepair/              # CI auto-repair
├── pr/                       # PR creation & descriptions
├── bot/                      # autonomous project monitor
lib/
└── gitcode-sdk/              # shared GitCode API & utilities
hooks/
├── hooks.json                # session hooks
└── session-start.sh          # verify GITCODE_TOKEN
```

## Other Skills in This Repo

These skills are not part of the plugin (they stay as project-local skills):

| Skill | Description |
|-------|-------------|
| [arch-diagram](./arch-diagram/) | Generate architecture diagrams from codebase |
| [html-presentation](./html-presentation/) | Markdown to Slidev presentations |
| [contributor-statistic](./contributor-statistic/) | GitHub contributor activity reports |
| [desktop-automator](./desktop-automator/) | Record and replay desktop operations |
| [tencent-doc-sync](./tencent-doc-sync/) | Tencent Docs smart sync |
| [weekly-tracker](./weekly-tracker/) | Multi-project git timeline tracker |

## Troubleshooting

### "GITCODE_TOKEN not set"

Run: `export GITCODE_TOKEN=<your-token>`

### "Git amend failed"

Make sure you have uncommitted changes or an existing commit. Skills use `--amend` to avoid extra commits.

## License

MIT License

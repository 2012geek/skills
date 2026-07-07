# @skills/gitcode-sdk — Shared Workspace Package

Component number: [11], [12], [13] live here
File: `packages/gitcode-sdk/` (at monorepo root)

## Responsibility

Internal npm workspace package that holds shared code used by **2+ GitCode skills**. Eliminates ~800-1000 lines of duplicated code across `gitcode-code-review`, `gitcode-ci-repair`, `gitcode-pr`, `gitcode-code-review-repair`, and `gitcode-bot`.

Inspired by `@nuxt/kit` (Nuxt's module SDK) and `@storybook/client-shared` (Storybook's internal shared package).

## Package Structure

```
packages/gitcode-sdk/
├── package.json              ← { name: "@skills/gitcode-sdk", private: true }
├── src/
│   ├── gitcode-api.js        ← [11] GitCode REST API wrapper (merged from 3+ duplicates)
│   ├── http-client.js        ← Shared HTTPS request wrapper
│   ├── config-loader.js      ← Shared config.json loading + validation
│   ├── agent-runner.js       ← [13] Agent .md loading + prompt building + LLM calls
│   ├── comment-formatter.js  ← Shared comment formatting + reference categories
│   └── index.js              ← Barrel exports
└── tests/
    ├── gitcode-api.test.js   ← Tests for [11]
    └── agent-runner.test.js  ← Tests for [13] (minimal, Tier 3)
```

## package.json

```json
{
  "name": "@skills/gitcode-sdk",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.js",
  "dependencies": {
    "node-fetch": "^3.3.2",
    "simple-git": "^3.25.0",
    "yaml": "^2.6.0"
  }
}
```

Key: `private: true` — never published to npm. Only consumed via `workspace:*`.

## Monorepo Root Configuration

```json
// skills/package.json (root)
{
  "name": "skills",
  "workspaces": ["packages/*", "gitcode-*"]
}
```

Each skill references gitcode-sdk via workspace protocol:

```json
// gitcode-bot/package.json
{
  "dependencies": {
    "@skills/gitcode-sdk": "workspace:*"
  }
}
```

`workspace:*` creates a symlink at install time — no build step needed for local dev. No version pinning required.

## What Goes In gitcode-sdk

**Only code used by 2+ skills.** Not a dumping ground.

| Module | Origin | Used By |
|--------|--------|---------|
| `gitcode-api.js` | Merged from 3 identical copies in code-review, ci-repair, pr | All 5 skills |
| `http-client.js` | Extracted from gitcode-api.js request pattern | gitcode-api.js |
| `config-loader.js` | Extracted from 11+ duplicated config loading scripts | All 5 skills |
| `agent-runner.js` | From code-review's agent-runner.js, extended for bot | code-review, bot |
| `comment-formatter.js` | From code-review's comment-formatter.js | code-review, bot |

## What Stays In Each Skill

Skill-specific code that only one skill uses stays local:

| Skill | Local lib/ (not in sdk) |
|-------|------------------------|
| gitcode-bot | orchestrator.js, project-manager.js, state-store.js, issue-manager.js, test-discovery.js, test-runner.js, deduplicator.js |
| gitcode-code-review | variable-tracker.js |
| gitcode-code-review-repair | gitcode-api-repair.js (extends sdk's GitCodeAPI) |
| gitcode-ci-repair | repair-specific parsing logic |

## How Skills Use gitcode-sdk

```javascript
// gitcode-bot/lib/issue-manager.js
const { GitCodeAPI } = require('@skills/gitcode-sdk');

class IssueManager {
  constructor(config) {
    this.api = new GitCodeAPI(config);
  }
  // ... skill-specific methods
}
```

```javascript
// gitcode-code-review-repair/lib/gitcode-api-repair.js
const { GitCodeAPI } = require('@skills/gitcode-sdk');

class GitCodeAPIRepair extends GitCodeAPI {
  // Extends base class with repair-specific methods
  async getReviewStatus() { ... }
  async getUnresolvedComments() { ... }
}
```

## Migration Path

To extract shared code into gitcode-sdk without breaking existing skills:

1. Create `packages/gitcode-sdk/` with `package.json`
2. Copy `gitcode-api.js` from `gitcode-ci-repair/lib/` (most recent/cleanest version)
3. Copy `agent-runner.js` from `gitcode-code-review/lib/`
4. Copy `comment-formatter.js` from `gitcode-code-review/lib/`
5. Extract `http-client.js` and `config-loader.js` from duplicated patterns
6. Add root `package.json` with `workspaces` config
7. Add `@skills/gitcode-sdk: "workspace:*"` to each skill's `package.json`
8. Replace `require('./gitcode-api')` with `require('@skills/gitcode-sdk')` in each skill
9. Delete local duplicate files
10. Run `npm install` from root to create workspace symlinks
11. Run each skill's tests to verify no breakage

## Dependencies

- `node-fetch` — HTTP requests to GitCode API
- `simple-git` — Git operations wrapper
- `yaml` — Parse agent frontmatter

## Test Strategy

### [11] GitCode API — Tier 1

**File:** `packages/gitcode-sdk/tests/gitcode-api.test.js`

| Test | Description |
|------|-------------|
| `createIssue()` | POST `/api/v5/repos/{owner}/{repo}/issues` |
| `listIssues()` | GET with labels filter, pagination |
| `getPullRequest()` | GET PR details |
| `createPullRequest()` | POST new PR |
| Rate limit handling | 429 → parse `Retry-After`, wait, retry |
| Auth error | 401 → throw with clear message |

### [13] Agent Runner — Tier 3

**File:** `packages/gitcode-sdk/tests/agent-runner.test.js` (minimal)

| Test | Description |
|------|-------------|
| Load agent .md | Parses YAML frontmatter correctly |
| Malformed JSON | Throws, not crashes |

Only minimal tests — core logic tested through consuming components' integration tests.

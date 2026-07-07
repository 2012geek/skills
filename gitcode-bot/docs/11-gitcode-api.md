# [11] GitCode API

Component number: [11]
Package: `@skills/gitcode-sdk`
File: `packages/gitcode-sdk/src/gitcode-api.js`

## Responsibility

GitCode REST API wrapper. Handles Issues, PRs, CI status, and rate limiting. Extends the `GitCodeAPI` class pattern from existing skills.

## Interface

```javascript
class GitCodeAPI {
  constructor(config)  // { token, baseUrl, owner, repo }

  // Generic request with auth + rate limit handling
  async request(endpoint, options)

  // Issue operations
  async createIssue(data)                // POST /api/v5/repos/{owner}/{repo}/issues
  async listIssues(labels, page)         // GET with labels filter, pagination
  async closeIssue(issueNumber)          // POST close action
  async commentOnIssue(issueNumber, body) // POST comment

  // PR operations
  async createPullRequest(data)          // POST /api/v5/repos/{owner}/{repo}/pulls
  async getPullRequest(prNumber)         // GET PR details

  // CI operations
  async getCIStatus(prNumber)            // GET CI pipeline status
  async getCIBotComments(prNumber)       // GET bot comments on PR

  // Utility (reused from code-review skill)
  calculatePosition(patch, lineNumber, isNewFile)
}
```

## Rate Limit Handling

- 429 response → parse `Retry-After` header → wait → retry
- No `Retry-After` → default 60s wait → retry
- Max 5 retries for rate limit, then throw

## Auth Handling

- 401 response → throw "GitCode auth failed: check your gitcodeToken"
- All requests include `Authorization: Bearer {token}` header

## Dependencies

None — this is a standalone API wrapper. Other components depend on it.

## Test Strategy — Tier 1

**File:** `tests/gitcode-api.test.js`
**Why Tier 1:** External API interaction — wrong API calls break the entire pipeline.

| Test | Description |
|------|-------------|
| `createIssue()` | POST `/api/v5/repos/{owner}/{repo}/issues` with correct body |
| `listIssues()` | GET with labels filter, pagination params |
| `getPullRequest()` | GET PR details |
| `createPullRequest()` | POST new PR with title, body, head, base |
| Rate limit handling | 429 response → parse `Retry-After`, wait, retry |
| Auth error | 401 → throw with "check your gitcodeToken" message |

**Mocking:** Mock fetch/axios with fixture HTTP responses.

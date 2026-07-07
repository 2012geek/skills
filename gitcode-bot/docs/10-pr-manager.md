# [10] PR Manager

Component number: [10]
Files: `agents/pr-description-writer.md` (local), `templates/pr-template.md` (local), `@skills/gitcode-sdk/src/gitcode-api.js` (from sdk), `@skills/gitcode-sdk/src/git-manager.js` (from sdk), `@skills/gitcode-sdk/src/agent-runner.js` (from sdk)

## Responsibility

Creates per-issue branches and PRs. Generates semantic PR descriptions via LLM agent. Links PRs to Issues for auto-close on merge.

## Interface

```javascript
class PRManager {
  constructor(gitcodeApi, gitManager, agentRunner)

  // Create a PR for a fixed Issue
  async createPR(issueRecord, fixAttempt, projectConfig)
}
```

## PR Creation Flow

```
1. Push branch bot/fix-{issueNumber} to remote
2. LLM generates PR description via pr-description-writer agent
3. POST to GitCode API: createPullRequest()
4. PR title: fix #{issueNumber}: {semantic description}
5. PR body includes: Closes #{issueNumber} for auto-close
```

## PR Title Format

`fix #42: add null check in processUserInput`

## PR-Issue Linking

PR description includes `Closes #42` — GitCode auto-closes the Issue when the PR is merged.

## API Rejection Handling

If GitCode rejects the PR (branch policy, protected branch, etc.):
- Comment on Issue: "bot blocked: PR creation failed, reason: ..."
- Mark Issue as `bot-blocked`
- Don't retry — human intervention needed

## Dependencies

- `@skills/gitcode-sdk` → `[11]` GitCode API — createPullRequest()
- `@skills/gitcode-sdk` → `[12]` Git Manager — pushBranch()
- `@skills/gitcode-sdk` → `[13]` Agent Runner — calls pr-description-writer agent
- `pr-description-writer` agent — LLM description generation (local)

## Test Strategy — Tier 2

**File:** `tests/pr-manager.test.js`
**Why Tier 2:** PR creation is straightforward API interaction, but linking format matters.

| Test | Description |
|------|-------------|
| PR creation | POST to GitCode API with title, description, source/target branch |
| PR-Issue linking | Description includes `Closes #42` for auto-close |
| API rejection | GitCode rejects PR → comment on Issue, mark `bot-blocked` |

**Mocking:** GitCodeAPI mocked. GitManager mocked. agentRunner mocked (returns fixture description).

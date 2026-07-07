# [12] Git Manager

Component number: [12]
Package: `@skills/gitcode-sdk`
File: `packages/gitcode-sdk/src/git-manager.js`

## Responsibility

Local Git operations for the bot: clone repo, create branches, apply patches, commit, rebase, push, and cleanup.

## Interface

```javascript
class GitManager {
  constructor(simpleGit)  // simple-git library instance

  // Clone repo to temp directory
  async cloneRepo(cloneUrl, owner, repo)  // returns localPath

  // Create fix branch from HEAD
  async createBranch(localPath, branchName)  // e.g. "bot/fix-42"

  // Apply unified diff patch to working tree
  async applyPatch(localPath, patchContent)

  // Commit changes with Issue reference
  async commitChanges(localPath, message)

  // Push branch to remote
  async pushBranch(localPath, branchName, remote)

  // Rebase current branch from latest main
  async rebaseFromMain(localPath, branchName)

  // Cleanup: remove temp clone directory
  async cleanup(localPath)

  // Get recent commit diff (for commit-watcher agent)
  async getRecentDiff(localPath, sinceTimestamp)

  // Get file content at a specific path
  async getFileContent(localPath, filePath)
}
```

## Temp Directory Convention

Clones go to `~/.gitcode-bot/repos/{owner}_{repo}/`. Reused for subsequent operations on the same project (avoid re-cloning). Cleanup only removes the directory when explicitly called.

## Patch Format

Uses standard unified diff format. The `applyPatch` method:
1. Writes patch content to a `.patch` file in the repo
2. Runs `git apply` on the patch
3. Verifies no syntax errors (optional: run linter)
4. Removes the `.patch` file

## Rebase Strategy

When a merge conflict occurs during fix:
1. Fetch latest main from remote
2. Rebase `bot/fix-{n}` onto `origin/main`
3. If rebase conflicts → attempt auto-resolution, or mark `bot-unable-to-fix`

## Dependencies

- `simple-git` library — all git operations

## Test Strategy — Tier 1

**File:** `tests/git-manager.test.js`
**Why Tier 1:** Git operations are fragile — conflicts, wrong branches, failed pushes. These must be tested with mocked git.

| Test | Description |
|------|-------------|
| `cloneRepo()` | Clones repo to temp directory, returns path |
| `createBranch()` | Creates `bot/fix-{n}` from HEAD |
| `applyPatch()` | Applies unified diff patch to working tree |
| `commitChanges()` | Commits with message referencing Issue |
| `pushBranch()` | Force-pushes branch to remote |
| `rebaseFromMain()` | Fetches main, rebases current branch |
| `cleanup()` | Removes temp clone directory after PR creation |

**Mocking:** Mock `simple-git` library. Verify correct git commands are called.

# GitCode Code Review Skill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adapt the gitcode-code-review multi-agent PR review tool into a project skill for vla-factory, replacing config.json with env vars and adding Claude Code slash command support.

**Architecture:** Copy the full skill directory, modify config loading to use environment variables, add a `.claude/commands/` slash command wrapper and CLAUDE.md reference section. The Node.js scripts remain the execution engine; the skill wrapper provides agent-discoverable entry points.

**Tech Stack:** Node.js (built-in modules only), Claude Code slash commands (.md), env vars for config.

---

### Task 1: Copy gitcode-code-review skill into project

**Files:**
- Create: `skills/gitcode-code-review/` (full directory tree)

**Step 1: Copy the entire skill directory**

```bash
cp -r /home/nice/chenlening/workspace/skills/gitcode-code-review /home/nice/chenlening/workspace/vla-factory/skills/gitcode-code-review
```

**Step 2: Remove unwanted files**

```bash
rm -f skills/gitcode-code-review/.temp-review/agent-*.md
rm -f skills/gitcode-code-review/scripts/gitcode-reviewer.js.bak
rm -rf skills/gitcode-code-review/node_modules
```

**Step 3: Verify the copy**

```bash
find skills/gitcode-code-review -type f | sort
```

Expected: agents/*.md, lib/*.js, scripts/*.js, tests/*.test.js, package.json, README.md, CHANGELOG.md

**Step 4: Install dependencies**

```bash
cd skills/gitcode-code-review && npm install && cd ../..
```

Expected: jest installed, no errors.

**Step 5: Commit**

```bash
git add skills/gitcode-code-review/
git commit -m "feat: add gitcode-code-review skill (copied from original)"
```

---

### Task 2: Create shared config module using env vars

**Files:**
- Create: `skills/gitcode-code-review/lib/config.js`

**Step 1: Write the config module**

```javascript
/**
 * Configuration module - reads from environment variables
 * Replaces the original config.json approach
 */

const DEFAULTS = {
  GITCODE_OWNER: 'openeuler',
  GITCODE_REPO: 'vla-factory',
  GITCODE_BASE_URL: 'https://api.gitcode.com',
  GITCODE_CONFIDENCE_THRESHOLD: '80',
};

function loadConfig() {
  const token = process.env.GITCODE_TOKEN;
  if (!token) {
    throw new Error(
      'GITCODE_TOKEN environment variable is required.\n' +
      'Set it in .env file or export GITCODE_TOKEN=your_token'
    );
  }

  return {
    gitcode: {
      token,
      owner: process.env.GITCODE_OWNER || DEFAULTS.GITCODE_OWNER,
      repo: process.env.GITCODE_REPO || DEFAULTS.GITCODE_REPO,
      baseUrl: process.env.GITCODE_BASE_URL || DEFAULTS.GITCODE_BASE_URL,
    },
    codeReview: {
      confidenceThreshold: parseInt(
        process.env.GITCODE_CONFIDENCE_THRESHOLD || DEFAULTS.GITCODE_CONFIDENCE_THRESHOLD,
        10
      ),
      skipValidation: false,
    },
  };
}

module.exports = { loadConfig, DEFAULTS };
```

**Step 2: Verify module loads**

```bash
cd skills/gitcode-code-review && node -e "const {loadConfig} = require('./lib/config'); try { loadConfig(); } catch(e) { console.log('Expected error:', e.message.split('\\n')[0]); }" && cd ../..
```

Expected: "Expected error: GITCODE_TOKEN environment variable is required."

**Step 3: Verify module loads with env vars**

```bash
GITCODE_TOKEN=test_token node -e "const {loadConfig} = require('./lib/config'); const c = loadConfig(); console.log(JSON.stringify(c, null, 2));"
```

Expected: config object with owner=openeuler, repo=vla-factory, baseUrl=https://api.gitcode.com, confidenceThreshold=80

**Step 4: Commit**

```bash
git add skills/gitcode-code-review/lib/config.js
git commit -m "feat: add config module with env var support"
```

---

### Task 3: Refactor gitcode-reviewer.js to use env vars

**Files:**
- Modify: `skills/gitcode-code-review/scripts/gitcode-reviewer.js`

**Step 1: Replace config loading block (lines 27-39, 794-812, 826-828)**

Remove these sections:
- Lines 27-39: `CONFIG_PATH` and `DEFAULT_CONFIG` constant definitions
- Lines 794-812: The `fs.readFile(CONFIG_PATH)` config loading block
- Lines 826-828: The token validation error referencing "config.json"

Replace with:
```javascript
// At top (replace lines 27-39):
const { loadConfig } = require('../lib/config');

// In main() (replace lines 794-812):
const config = loadConfig();

// Token validation is now handled by loadConfig() itself
// Remove lines 826-828 entirely
```

**Step 2: Verify the script still parses CLI args correctly**

The CLI arg parsing section (args parsing with --pr, --dry-run, --skip-validation, --force, --auto-review, --issues-from-json, --threshold) should remain unchanged. The `skipValidation` and `dryRun` and `threshold` overrides at lines 815-823 should still work on the config object returned by `loadConfig()`.

**Step 3: Test with dry-run**

```bash
GITCODE_TOKEN=test node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 1 --dry-run
```

Expected: Script runs (may fail on API call since token is fake, but config loading succeeds).

**Step 4: Commit**

```bash
git add skills/gitcode-code-review/scripts/gitcode-reviewer.js
git commit -m "feat: refactor gitcode-reviewer.js to use env vars"
```

---

### Task 4: Refactor remaining scripts to use env vars

**Files:**
- Modify: `skills/gitcode-code-review/scripts/create-pr.js`
- Modify: `skills/gitcode-code-review/scripts/update-pr.js`
- Modify: `skills/gitcode-code-review/scripts/generate-smart-pr-desc.js`
- Modify: `skills/gitcode-code-review/scripts/generate-pr-description.js`
- Modify: `skills/gitcode-code-review/scripts/gitcode-pr-reviewer.js`
- Modify: `skills/gitcode-code-review/scripts/update-pr-from-commits.js`

**Step 1: Replace loadConfig() in each script**

Each script has a `loadConfig()` function that reads `config.json`. Replace each with:

```javascript
const { loadConfig } = require('../lib/config');
```

And delete the local `loadConfig` function. Specifically:

- **create-pr.js** (lines ~70-82): Replace `loadConfig` function with import from `../lib/config`
- **update-pr.js** (lines ~61-73): Same replacement
- **generate-smart-pr-desc.js** (lines ~18-26): Same replacement
- **generate-pr-description.js** (lines ~20-32): Same replacement
- **gitcode-pr-reviewer.js** (lines ~18-19, ~330-341): Replace `CONFIG_PATH`, `DEFAULT_CONFIG`, and config loading block with `const { loadConfig } = require('../lib/config'); const config = loadConfig();`
- **update-pr-from-commits.js** (lines ~18-30): Same replacement

**Step 2: Verify each script loads config correctly**

```bash
for script in create-pr update-pr generate-smart-pr-desc generate-pr-description gitcode-pr-reviewer update-pr-from-commits; do
  echo "Testing $script..."
  GITCODE_TOKEN=test node skills/gitcode-code-review/scripts/$script.js --help 2>&1 | head -3 || echo "No --help, but module loaded"
done
```

Expected: No "config.json not found" errors.

**Step 3: Commit**

```bash
git add skills/gitcode-code-review/scripts/
git commit -m "feat: refactor all scripts to use env var config"
```

---

### Task 5: Create .env.example and update .gitignore

**Files:**
- Create: `skills/gitcode-code-review/.env.example`
- Modify: `/home/nice/chenlening/workspace/vla-factory/.gitignore`

**Step 1: Write .env.example**

```bash
cat > skills/gitcode-code-review/.env.example << 'EOF'
# GitCode API Configuration
# Copy this file to .env and fill in your values

# Required: Your GitCode personal access token
GITCODE_TOKEN=

# Optional: Repository owner (default: openeuler)
GITCODE_OWNER=openeuler

# Optional: Repository name (default: vla-factory)
GITCODE_REPO=vla-factory

# Optional: GitCode API base URL (default: https://api.gitcode.com)
GITCODE_BASE_URL=https://api.gitcode.com

# Optional: Minimum confidence threshold for reported issues (default: 80)
GITCODE_CONFIDENCE_THRESHOLD=80
EOF
```

**Step 2: Verify .gitignore has .env entry**

Read existing `.gitignore` and confirm it has `.env`. The file was created in the brainstorming phase with `.env` already listed.

**Step 3: Commit**

```bash
git add skills/gitcode-code-review/.env.example
git commit -m "feat: add .env.example for gitcode-code-review config"
```

---

### Task 6: Create Claude Code slash command

**Files:**
- Create: `.claude/commands/gitcode-code-review.md`

**Step 1: Create .claude/commands directory**

```bash
mkdir -p .claude/commands
```

**Step 2: Write the slash command file**

```markdown
---
description: Review a GitCode Pull Request using multi-agent analysis
---

Review GitCode Pull Request #$ARGUMENTS using the multi-agent code review pipeline.

## Steps

1. Verify environment: Check that GITCODE_TOKEN is set. If not, tell the user to set it in .env or via `export GITCODE_TOKEN=<token>`.
2. Run the review:
   ```bash
   node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr $ARGUMENTS
   ```
3. If the user wants a preview without posting comments, add --dry-run:
   ```bash
   node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr $ARGUMENTS --dry-run
   ```
4. If the user wants faster review without validation, add --skip-validation.
5. Summarize the review results for the user — how many issues found, severity levels, key findings.

## Other available scripts

- Create PR: `node skills/gitcode-code-review/scripts/create-pr.js`
- Update PR: `node skills/gitcode-code-review/scripts/update-pr.js`
- Smart PR description: `node skills/gitcode-code-review/scripts/generate-smart-pr-desc.js`
```

**Step 3: Verify the command is discoverable**

The file should exist at `.claude/commands/gitcode-code-review.md`. In Claude Code, `/gitcode-code-review` will become available as a slash command.

**Step 4: Commit**

```bash
git add .claude/commands/gitcode-code-review.md
git commit -m "feat: add /gitcode-code-review slash command"
```

---

### Task 7: Add CLAUDE.md section for cross-agent discovery

**Files:**
- Create: `/home/nice/chenlening/workspace/vla-factory/CLAUDE.md`

**Step 1: Write CLAUDE.md**

```markdown
# CLAUDE.md — vla-factory project instructions

## Project Overview

vla-factory is a unified fine-tuning framework for Vision-Language-Action (VLA) models on openEuler. Supports PI0, OpenVLA, ACT and other VLA models with multiple data formats and fine-tuning strategies.

## GitCode Code Review Skill

This project includes a multi-agent code review skill for GitCode Pull Requests.

### Slash Command (Claude Code)
- `/gitcode-code-review <PR-number>` — runs the full review pipeline

### CLI (any agent with Bash)
- Review PR: `node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr <number>`
- Dry-run: add `--dry-run` flag to preview without posting
- Fast mode: add `--skip-validation` to skip issue validation
- Create PR: `node skills/gitcode-code-review/scripts/create-pr.js`
- Update PR: `node skills/gitcode-code-review/scripts/update-pr.js`
- Generate PR description: `node skills/gitcode-code-review/scripts/generate-smart-pr-desc.js`

### Configuration
Requires environment variables (set in .env or export):
- `GITCODE_TOKEN` — required, personal access token
- `GITCODE_OWNER` — default: openeuler
- `GITCODE_REPO` — default: vla-factory
- `GITCODE_BASE_URL` — default: https://api.gitcode.com
- `GITCODE_CONFIDENCE_THRESHOLD` — default: 80
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: add CLAUDE.md with gitcode-code-review skill reference"
```

---

### Task 8: Update README.md for vla-factory context

**Files:**
- Modify: `skills/gitcode-code-review/README.md`

**Step 1: Rewrite README.md**

Replace the original README with a version specific to vla-factory. Include:
- Purpose: "Multi-agent code review for vla-factory PRs on GitCode"
- Setup: env var configuration (not config.json)
- Usage examples with vla-factory repo
- Available scripts list
- Agent descriptions (keep from original)

**Step 2: Commit**

```bash
git add skills/gitcode-code-review/README.md
git commit -m "docs: update README for vla-factory context"
```

---

### Task 9: Run existing tests to verify no breakage

**Files:**
- Test: `skills/gitcode-code-review/tests/test-comment-formatter.test.js`

**Step 1: Run Jest tests**

```bash
cd skills/gitcode-code-review && npm test && cd ../..
```

Expected: All existing tests pass (comment-formatter tests don't depend on config).

**Step 2: Verify scripts load without config.json errors**

```bash
GITCODE_TOKEN=test node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 1 --dry-run 2>&1 | head -10
```

Expected: Script starts, no "config.json not found" or "config.json required" errors. May fail on API call (fake token), but config loading works.

**Step 3: Commit any remaining fixes**

If tests fail, fix and commit. If tests pass, no additional commit needed.

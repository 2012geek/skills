# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo containing [Claude Code](https://github.com/anthropics/claude-code) skills for automating GitCode workflows and developer productivity tasks. Each skill is a self-contained module that can be invoked independently.

**Core Skills:**
- `gitcode-code-review` - Multi-agent PR code review with bug scanning, security detection, and semantic analysis
- `gitcode-code-review-repair` - Automatically fix review comments using LLM-generated patches
- `gitcode-ci-repair` - Auto-repair failed CI checks with iterative fixing
- `gitcode-pr` - Create PRs with auto-generated descriptions from diffs
- `html-presentation` - Markdown to Slidev presentations with dev mode
- `arch-diagram` - Generate architecture diagrams from codebase analysis
- `tencent-doc-download` - Download Tencent Docs content
- `contributor-statistic` - Analyze GitHub repo contributor activity and generate Chinese-language report.md

## Common Development Commands

### Testing
```bash
# Run tests for gitcode-code-review skill
cd gitcode-code-review && npm test

# Run specific test file
cd gitcode-code-review && npx jest tests/test-comment-formatter.test.js

# Run tests for contributor-statistic skill
cd contributor-statistic && npm test
```

### Building
```bash
# Build HTML presentation (Slidev)
cd html-presentation && npm run build

# Build with optimization
cd html-presentation && npm run build:opt

# Build with full optimization
cd html-presentation && npm run build:opt:full
```

### Development Mode
```bash
# Start Slidev dev server
cd html-presentation && npm run dev

# Start with optimization
cd html-presentation && npm run dev:opt

# Login to Tencent Docs
cd tencent-doc-download && npm run login

# Download Tencent Docs
cd tencent-doc-download && npm run download
```

### Skill Scripts
```bash
# Run code review (generates prompts for manual review)
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr <PR_NUMBER>

# Submit review from JSON file
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr <PR_NUMBER> --issues-from-json issues.json

# Repair PR review comments
node skills/gitcode-code-review-repair/scripts/repair-pr.js

# Repair CI failures
node skills/gitcode-ci-repair/scripts/repair.js <MR_NUMBER>

# Generate PR description
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js <PR_NUMBER>

# Analyze contributor statistics (local repo, no LLM)
cd contributor-statistic && node scripts/analyze.js --repo-path /path/to/repo --no-llm

# Analyze contributor statistics (remote repo with LLM)
cd contributor-statistic && node scripts/analyze.js --repo https://github.com/org/repo
```

## Architecture

### Multi-Agent Code Review System

The `gitcode-code-review` skill uses a sophisticated multi-agent architecture:

1. **Agent System** (`gitcode-code-review/agents/`):
   - `pre-check.md` - Validates PR state before review
   - `bug-scanner-diff.md` - Scans for syntax errors, type errors, API misuse
   - `bug-scanner-diff-2.md` - Redundant scanner for improved accuracy
   - `code-analyzer.md` - Finds security issues, logic errors, performance problems
   - `semantic-analyzer.md` - Deep semantic analysis for subtle logic bugs
   - `python-classmethod-checker.md` - Python @classmethod specific issues
   - `issue-validator.md` - Validates issues to reduce false positives

2. **Core Libraries** (`gitcode-code-review/lib/`):
   - `gitcode-api.js` - GitCode API wrapper
   - `comment-formatter.js` - Formats review comments with references
   - `agent-runner.js` - Executes agents in parallel
   - `variable-tracker.js` - Tracks variables to prevent false positives

3. **9-Step Review Flow**:
   ```
   1. Pre-check → 2. Collect context → 3. Summarize PR → 4. Parallel review
   → 5. Validate → 6. Filter/deduplicate → 7. Decide → 8. Format → 9. Post
   ```

### HTML Presentation System

The `html-presentation` skill uses a Slidev-based architecture:

1. **Build Pipeline** (`html-presentation/scripts/`):
   - `build.js` - Main entry point, handles dev/production modes
   - `slidev-generator.js` - Converts Markdown to Slidev format with intelligent slide splitting
   - `optimizer.js` - LLM-powered content optimization

2. **Agent System** (`html-presentation/agents/`):
   - `content-analyzer.md` - Analyzes presentation content
   - `content-optimizer.md` - Optimizes for presentation format

3. **Key Features**:
   - Automatic slide splitting based on H1/H2 headers
   - Frontmatter injection with theme configuration
   - Dev server with hot reload at `localhost:3030`
   - LLM optimization with basic/full levels

### Contributor Statistic System

The `contributor-statistic` skill analyzes GitHub repo contributor activity and generates Chinese-language reports:

1. **Pipeline** (`contributor-statistic/scripts/`):
   - `analyze.js` - 6-step pipeline: clone → extract → filter → LLM importance → LLM narrative → generate report

2. **Core Libraries** (`contributor-statistic/lib/`):
   - `git-analyzer.js` - Parses git shortlog/log/numstat output into structured data
   - `commit-filter.js` - Filters commits by size threshold and groups by author
   - `llm-runner.js` - Executes LLM agents via Anthropic SDK
   - `report-generator.js` - Builds Chinese markdown report with summary table and profiles
   - `github-url.js` - Constructs commit URLs from SSH/HTTPS remote URLs

3. **Agent System** (`contributor-statistic/agents/`):
   - `commit-importance.md` - Judges which commits are important per contributor
   - `contributor-summary.md` - Writes Chinese narrative summary per contributor

## Configuration

All GitCode-related skills share a common `config.json` format in project roots:

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
  },
  "codeReview": {
    "confidenceThreshold": 80,
    "skipValidation": false
  }
}
```

**Key Configuration Points:**
- GitCode tokens require `repo` and `pull_request` scopes
- Anthropic API key is required for LLM-powered repair features
- Confidence threshold filters out low-confidence issues (default: 80)

## Skill Structure Convention

Each skill follows this structure:
```
skill-name/
├── SKILL.md              # Skill definition (Claude Code reads this)
├── README.md             # User-facing documentation
├── package.json          # Dependencies and scripts
├── agents/               # Agent definitions (if multi-agent)
├── lib/                  # Core libraries
└── scripts/              # Executable scripts
```

## Testing Strategy

- **gitcode-code-review**: Uses Jest for unit testing
  - Test file: `tests/test-comment-formatter.test.js`
  - Tests reference category mapping, comment formatting, deduplication
- Other skills: Manual testing or integration tests

## Important Implementation Notes

1. **Git Amend Pattern**: All repair skills use `git commit --amend` to avoid cluttering commit history
2. **Hybrid API/Web Scraping**: `gitcode-code-review-repair` falls back to Puppeteer when API fails
3. **Reference Categories**: Issues can specify `referenceCategories` (e.g., `python_dataclass`) for automatic official documentation links
4. **Multi-Language Support**: Code review supports Python, C++, JavaScript, Markdown, and XML
5. **Confidence Scoring**: Only issues with confidence >= 80 are reported to reduce false positives

## Dependencies

- **Node.js >= 18**: Required for all skills
- **Python >= 3.8**: Required for pre-commit hooks in CI repair
- **Git**: Latest version for commit/push operations
- **D2 CLI**: Required for architecture diagram rendering
- **Slidev**: Required for HTML presentation skill

## Workflow Integration

Skills are designed to work together in automated pipelines:

1. **Review and Fix Cycle**:
   ```
   Create PR → Code Review → Review Comments → Auto-Fix → Commit Amend → Push
   ```

2. **CI-First Approach**:
   ```
   Push → CI Fails → Auto-Repair → Retest → Loop until pass
   ```

3. **Manual Review with Auto-Fix**:
   ```
   Generate prompts → Manual review → Save issues.json → Auto-fix → Commit
   ```

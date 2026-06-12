# contributor-statistic Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a skill that clones a GitHub repo, analyzes contributor activity via git commands, uses LLM agents to judge commit importance and write narrative summaries, and generates a Chinese-language report.md.

**Architecture:** Node.js skill following existing monorepo conventions — `scripts/analyze.js` orchestrates a 6-step pipeline (clone → extract → filter → LLM importance → LLM narrative → generate report). Two LLM agents handle importance judgment and narrative writing. Uses `simple-git` for git operations and `@anthropic-ai/sdk` for LLM calls.

**Tech Stack:** Node.js, simple-git, @anthropic-ai/sdk, Jest for testing

---

### Task 1: Project Scaffold

**Files:**
- Create: `contributor-statistic/package.json`
- Create: `contributor-statistic/SKILL.md`
- Create: `contributor-statistic/README.md`
- Create: `contributor-statistic/config.json`

**Step 1: Create package.json**

```json
{
  "name": "contributor-statistic",
  "version": "1.0.0",
  "description": "分析 GitHub 仓库贡献者活动，生成中文贡献统计报告",
  "main": "scripts/analyze.js",
  "scripts": {
    "analyze": "node scripts/analyze.js",
    "test": "jest"
  },
  "keywords": ["contributor", "statistics", "git", "report"],
  "author": "Claude Code",
  "license": "MIT",
  "dependencies": {
    "simple-git": "^3.27.0",
    "@anthropic-ai/sdk": "^0.78.0"
  },
  "devDependencies": {
    "jest": "^30.2.0"
  }
}
```

**Step 2: Create SKILL.md**

```markdown
---
name: contributor-statistic
description: "分析 GitHub 仓库贡献者活动，使用 LLM 判断重要提交并生成中文贡献统计报告"
license: MIT
---

# contributor-statistic

分析 GitHub 仓库贡献者活动，生成中文贡献统计报告。

## Usage

分析远程仓库:
\`\`\`bash
node scripts/analyze.js --repo https://github.com/org/repo
\`\`\`

分析本地仓库:
\`\`\`bash
node scripts/analyze.js --repo-path /path/to/local/repo
\`\`\`

指定时间范围（如峰会期间）:
\`\`\`bash
node scripts/analyze.js --repo https://github.com/org/repo --since 2026-05-01 --until 2026-06-12
\`\`\`

## CLI Options

| Option | Description |
|--------|-------------|
| `--repo <url>` | GitHub 仓库 URL，自动 clone |
| `--repo-path <path>` | 本地仓库路径，跳过 clone |
| `--since <date>` | 起始日期 (YYYY-MM-DD) |
| `--until <date>` | 结束日期 (YYYY-MM-DD) |
| `--branch <name>` | 分析指定分支 |
| `--author <name>` | 仅分析指定作者 |
| `--output <path>` | 输出报告路径 (默认 report.md) |
| `--no-llm` | 跳过 LLM，仅输出统计数据 |
| `--keep-clone` | 分析后保留 clone 目录 |

## Workflow

1. Clone 仓库 → 临时目录
2. 提取数据 → git shortlog / git log
3. 过滤候选提交 → 行数变化 > 100
4. LLM 判断重要性 → commit-importance agent
5. LLM 撰写摘要 → contributor-summary agent
6. 生成报告 → report.md

## Directory Structure

\`\`\`
contributor-statistic/
├── SKILL.md
├── scripts/analyze.js
├── lib/
│   ├── git-analyzer.js
│   ├── commit-filter.js
│   ├── llm-runner.js
│   ├── report-generator.js
│   └── github-url.js
├── agents/
│   ├── commit-importance.md
│   └── contributor-summary.md
└── tests/
\`\`\`
```

**Step 3: Create config.json**

```json
{
  "anthropic": {
    "apiKey": ""
  },
  "contributorStatistic": {
    "maxImportantCommits": 5,
    "lineChangeThreshold": 100
  }
}
```

**Step 4: Create README.md**

```markdown
# contributor-statistic

分析 GitHub 仓库贡献者活动，生成中文贡献统计报告。

## 功能

- Clone 远程仓库或分析本地仓库
- 统计每位贡献者的提交数、行数变化、涉及文件数
- LLM 判断重要提交（不使用硬编码关键词）
- LLM 生成中文贡献摘要
- 输出 report.md 报告

## 安装

\`\`\`bash
cd contributor-statistic && npm install
\`\`\`

## 使用

\`\`\`bash
node scripts/analyze.js --repo https://github.com/org/repo
\`\`\`

## 配置

编辑 `config.json` 设置 Anthropic API Key 和过滤参数。
```

**Step 5: Install dependencies**

Run: `cd contributor-statistic && npm install`
Expected: Dependencies installed successfully

**Step 6: Commit**

```bash
git add contributor-statistic/package.json contributor-statistic/SKILL.md contributor-statistic/README.md contributor-statistic/config.json contributor-statistic/package-lock.json
git commit -m "feat(contributor-statistic): scaffold project structure and SKILL.md"
```

---

### Task 2: github-url.js — Commit URL Builder

**Files:**
- Create: `contributor-statistic/lib/github-url.js`
- Create: `contributor-statistic/tests/test-github-url.test.js`

**Step 1: Write the failing test**

```javascript
const { GitHubUrlBuilder } = require('../lib/github-url.js');

describe('GitHubUrlBuilder', () => {
  test('constructs commit URL from GitHub remote', () => {
    const builder = new GitHubUrlBuilder('https://github.com/org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://github.com/org/repo/commit/abc123');
  });

  test('constructs commit URL from SSH remote', () => {
    const builder = new GitHubUrlBuilder('git@github.com:org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://github.com/org/repo/commit/abc123');
  });

  test('constructs commit URL from GitCode remote', () => {
    const builder = new GitHubUrlBuilder('https://gitcode.com/org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://gitcode.com/org/repo/commit/abc123');
  });

  test('extracts repo name from URL', () => {
    const builder = new GitHubUrlBuilder('https://github.com/org/my-repo.git');
    expect(builder.repoName).toBe('my-repo');
  });

  test('extracts org from URL', () => {
    const builder = new GitHubUrlBuilder('https://github.com/my-org/repo.git');
    expect(builder.org).toBe('my-org');
  });

  test('throws on invalid remote URL', () => {
    expect(() => new GitHubUrlBuilder('not-a-url')).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd contributor-statistic && npx jest tests/test-github-url.test.js --verbose`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
'use strict';

const path = require('path');

// ============================================================================
// GITHUB URL BUILDER
// ============================================================================

class GitHubUrlBuilder {
  constructor(remoteUrl) {
    if (!remoteUrl) {
      throw new Error('remoteUrl is required');
    }

    let normalized = remoteUrl;

    // SSH format: git@github.com:org/repo.git
    const sshMatch = remoteUrl.match(/^git@([^:]+):([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (sshMatch) {
      normalized = `https://${sshMatch[1]}/${sshMatch[2]}/${sshMatch[3]}`;
    }

    // HTTPS format: https://github.com/org/repo.git
    const httpsMatch = normalized.match(/^https:\/\/([^/]+)\/([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!httpsMatch) {
      throw new Error(`Cannot parse remote URL: ${remoteUrl}`);
    }

    this.host = httpsMatch[1];
    this.org = httpsMatch[2];
    this.repoName = httpsMatch[3];
    this.baseUrl = `https://${this.host}/${this.org}/${this.repoName}`;
  }

  commitUrl(hash) {
    return `${this.baseUrl}/commit/${hash}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { GitHubUrlBuilder };
```

**Step 4: Run test to verify it passes**

Run: `cd contributor-statistic && npx jest tests/test-github-url.test.js --verbose`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add contributor-statistic/lib/github-url.js contributor-statistic/tests/test-github-url.test.js
git commit -m "feat(contributor-statistic): add GitHub URL builder with SSH/HTTPS support"
```

---

### Task 3: commit-filter.js — Size-Based Candidate Filter

**Files:**
- Create: `contributor-statistic/lib/commit-filter.js`
- Create: `contributor-statistic/tests/test-commit-filter.test.js`

**Step 1: Write the failing test**

```javascript
const { CommitFilter } = require('../lib/commit-filter.js');

describe('CommitFilter', () => {
  const defaultConfig = { lineChangeThreshold: 100, maxImportantCommits: 5 };

  test('filters commits above line change threshold', () => {
    const filter = new CommitFilter(defaultConfig);
    const commits = [
      { hash: 'a1', linesAdded: 200, linesRemoved: 50 },
      { hash: 'a2', linesAdded: 10, linesRemoved: 5 },
      { hash: 'a3', linesAdded: 80, linesRemoved: 30 },
    ];
    const candidates = filter.filterBySize(commits);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].hash).toBe('a1');
    expect(candidates[1].hash).toBe('a3');
  });

  test('returns all commits when threshold is 0', () => {
    const filter = new CommitFilter({ lineChangeThreshold: 0, maxImportantCommits: 5 });
    const commits = [
      { hash: 'a1', linesAdded: 1, linesRemoved: 0 },
      { hash: 'a2', linesAdded: 5, linesRemoved: 3 },
    ];
    const candidates = filter.filterBySize(commits);
    expect(candidates).toHaveLength(2);
  });

  test('groups commits by author', () => {
    const filter = new CommitFilter(defaultConfig);
    const commits = [
      { hash: 'a1', author: 'Alice', linesAdded: 200, linesRemoved: 50 },
      { hash: 'a2', author: 'Bob', linesAdded: 150, linesRemoved: 30 },
      { hash: 'a3', author: 'Alice', linesAdded: 5, linesRemoved: 2 },
    ];
    const grouped = filter.groupByAuthor(commits);
    expect(grouped['Alice']).toHaveLength(2);
    expect(grouped['Bob']).toHaveLength(1);
  });

  test('calculates total lines changed', () => {
    const filter = new CommitFilter(defaultConfig);
    const commit = { linesAdded: 120, linesRemoved: 80 };
    expect(filter.totalLinesChanged(commit)).toBe(200);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd contributor-statistic && npx jest tests/test-commit-filter.test.js --verbose`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
'use strict';

// ============================================================================
// COMMIT FILTER
// ============================================================================

class CommitFilter {
  constructor(config) {
    this.lineChangeThreshold = config?.lineChangeThreshold ?? 100;
    this.maxImportantCommits = config?.maxImportantCommits ?? 5;
  }

  totalLinesChanged(commit) {
    return (commit.linesAdded || 0) + (commit.linesRemoved || 0);
  }

  filterBySize(commits) {
    return commits.filter(c => this.totalLinesChanged(c) >= this.lineChangeThreshold);
  }

  groupByAuthor(commits) {
    const groups = {};
    for (const c of commits) {
      const author = c.author || 'unknown';
      if (!groups[author]) groups[author] = [];
      groups[author].push(c);
    }
    return groups;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { CommitFilter };
```

**Step 4: Run test to verify it passes**

Run: `cd contributor-statistic && npx jest tests/test-commit-filter.test.js --verbose`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add contributor-statistic/lib/commit-filter.js contributor-statistic/tests/test-commit-filter.test.js
git commit -m "feat(contributor-statistic): add commit size filter and author grouping"
```

---

### Task 4: git-analyzer.js — Git Data Extraction

**Files:**
- Create: `contributor-statistic/lib/git-analyzer.js`
- Create: `contributor-statistic/tests/test-git-analyzer.test.js`

**Step 1: Write the failing test**

```javascript
const { GitAnalyzer } = require('../lib/git-analyzer.js');

describe('GitAnalyzer', () => {
  describe('parseShortlog', () => {
    test('parses shortlog output into ranked contributor list', () => {
      const input = `
  142\tAlice <alice@example.com>
   87\tBob <bob@example.com>
    5\tCharlie <charlie@example.com>
`;
      const result = GitAnalyzer.parseShortlog(input);
      expect(result).toEqual([
        { name: 'Alice', email: 'alice@example.com', commits: 142 },
        { name: 'Bob', email: 'bob@example.com', commits: 87 },
        { name: 'Charlie', email: 'charlie@example.com', commits: 5 },
      ]);
    });

    test('handles empty input', () => {
      expect(GitAnalyzer.parseShortlog('')).toEqual([]);
    });
  });

  describe('parseLog', () => {
    test('parses commit log with pipe-delimited format', () => {
      const input = `abc123|Alice|alice@example.com|2026-05-01|feat: add auth\ndef456|Bob|bob@example.com|2026-05-02|fix: login bug`;
      const result = GitAnalyzer.parseLog(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        hash: 'abc123', author: 'Alice', email: 'alice@example.com',
        date: '2026-05-01', subject: 'feat: add auth'
      });
    });
  });

  describe('parseNumstat', () => {
    test('parses numstat output into per-commit line stats', () => {
      const input = `abc123|Alice\n10\t5\tsrc/auth.js\n3\t0\tsrc/util.js\ndef456|Bob\n20\t15\tsrc/ui.js`;
      const result = GitAnalyzer.parseNumstat(input);
      expect(result['abc123']).toEqual({
        author: 'Alice', linesAdded: 13, linesRemoved: 5, files: ['src/auth.js', 'src/util.js']
      });
      expect(result['def456']).toEqual({
        author: 'Bob', linesAdded: 20, linesRemoved: 15, files: ['src/ui.js']
      });
    });

    test('handles binary files (shown as -)', () => {
      const input = `abc123|Alice\n-\t-\timage.png\n5\t2\tsrc/app.js`;
      const result = GitAnalyzer.parseNumstat(input);
      expect(result['abc123'].linesAdded).toBe(5);
      expect(result['abc123'].linesRemoved).toBe(2);
      expect(result['abc123'].files).toEqual(['src/app.js']);
    });
  });

  describe('aggregateByContributor', () => {
    test('aggregates commit data per contributor', () => {
      const shortlog = [
        { name: 'Alice', email: 'alice@example.com', commits: 2 },
        { name: 'Bob', email: 'bob@example.com', commits: 1 },
      ];
      const commits = [
        { hash: 'a1', author: 'Alice', email: 'alice@example.com', date: '2026-05-01', subject: 'feat: add auth', linesAdded: 120, linesRemoved: 30, files: ['src/auth.js'] },
        { hash: 'a2', author: 'Alice', email: 'alice@example.com', date: '2026-05-02', subject: 'fix: bug', linesAdded: 10, linesRemoved: 5, files: ['src/util.js'] },
        { hash: 'b1', author: 'Bob', email: 'bob@example.com', date: '2026-05-03', subject: 'docs: readme', linesAdded: 50, linesRemoved: 20, files: ['README.md'] },
      ];

      const result = GitAnalyzer.aggregateByContributor(shortlog, commits);
      expect(result['Alice'].totalCommits).toBe(2);
      expect(result['Alice'].totalLinesAdded).toBe(130);
      expect(result['Alice'].totalLinesRemoved).toBe(35);
      expect(result['Alice'].files).toEqual(['src/auth.js', 'src/util.js']);
      expect(result['Alice'].commits).toHaveLength(2);
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd contributor-statistic && npx jest tests/test-git-analyzer.test.js --verbose`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
'use strict';

// ============================================================================
// GIT ANALYZER
// ============================================================================

class GitAnalyzer {
  static parseShortlog(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const match = line.trim().match(/^\s*(\d+)\t(.+?)\s*<(.+?)>/);
      if (!match) return null;
      return { name: match[2].trim(), email: match[3], commits: parseInt(match[1], 10) };
    }).filter(Boolean);
  }

  static parseLog(output) {
    if (!output || !output.trim()) return [];

    return output.trim().split('\n').map(line => {
      const parts = line.split('|');
      if (parts.length < 5) return null;
      return {
        hash: parts[0],
        author: parts[1],
        email: parts[2],
        date: parts[3],
        subject: parts.slice(4).join('|')
      };
    }).filter(Boolean);
  }

  static parseNumstat(output) {
    if (!output || !output.trim()) return {};

    const result = {};
    let currentHash = null;
    let currentAuthor = null;

    for (const line of output.trim().split('\n')) {
      const hashMatch = line.match(/^([a-f0-9]+)\|(.+)$/);
      if (hashMatch) {
        currentHash = hashMatch[1];
        currentAuthor = hashMatch[2];
        result[currentHash] = { author: currentAuthor, linesAdded: 0, linesRemoved: 0, files: [] };
        continue;
      }

      const statMatch = line.match(/^(-|\d+)\t(-|\d+)\t(.+)$/);
      if (statMatch && currentHash) {
        const added = statMatch[1] === '-' ? 0 : parseInt(statMatch[1], 10);
        const removed = statMatch[2] === '-' ? 0 : parseInt(statMatch[2], 10);
        const file = statMatch[3];

        if (added > 0 || removed > 0) {
          result[currentHash].linesAdded += added;
          result[currentHash].linesRemoved += removed;
          result[currentHash].files.push(file);
        }
      }
    }

    return result;
  }

  static aggregateByContributor(shortlog, commits) {
    const contributors = {};

    for (const entry of shortlog) {
      contributors[entry.name] = {
        name: entry.name,
        email: entry.email,
        totalCommits: entry.commits,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        files: [],
        commits: [],
      };
    }

    for (const c of commits) {
      const contrib = contributors[c.author];
      if (!contrib) continue;

      contrib.totalLinesAdded += c.linesAdded || 0;
      contrib.totalLinesRemoved += c.linesRemoved || 0;
      if (c.files) {
        for (const f of c.files) {
          if (!contrib.files.includes(f)) contrib.files.push(f);
        }
      }
      contrib.commits.push(c);
    }

    return contributors;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { GitAnalyzer };
```

**Step 4: Run test to verify it passes**

Run: `cd contributor-statistic && npx jest tests/test-git-analyzer.test.js --verbose`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add contributor-statistic/lib/git-analyzer.js contributor-statistic/tests/test-git-analyzer.test.js
git commit -m "feat(contributor-statistic): add git data parser for shortlog, log, numstat"
```

---

### Task 5: report-generator.js — Markdown Report Builder

**Files:**
- Create: `contributor-statistic/lib/report-generator.js`
- Create: `contributor-statistic/tests/test-report-generator.test.js`

**Step 1: Write the failing test**

```javascript
const { ReportGenerator } = require('../lib/report-generator.js');
const { GitHubUrlBuilder } = require('../lib/github-url.js');

describe('ReportGenerator', () => {
  const urlBuilder = new GitHubUrlBuilder('https://github.com/org/repo.git');

  test('generates header with repo info', () => {
    const gen = new ReportGenerator({ urlBuilder, analysisDate: '2026-06-12', timeRange: '全部历史' });
    const report = gen.generateHeader();
    expect(report).toContain('贡献者统计报告 — repo');
    expect(report).toContain('分析时间: 2026-06-12');
    expect(report).toContain('https://github.com/org/repo');
  });

  test('generates summary table', () => {
    const gen = new ReportGenerator({ urlBuilder });
    const contributors = [
      { name: 'Alice', email: 'alice@example.com', totalCommits: 142, totalLinesAdded: 8230, totalLinesRemoved: 2100, files: ['a.js', 'b.js'] },
      { name: 'Bob', email: 'bob@example.com', totalCommits: 87, totalLinesAdded: 3500, totalLinesRemoved: 1800, files: ['c.js'] },
    ];
    const table = gen.generateSummaryTable(contributors);
    expect(table).toContain('Alice');
    expect(table).toContain('142');
    expect(table).toContain('8,230');
    expect(table).toContain('Bob');
    expect(table).toContain('2');
  });

  test('generates contributor profile with narrative', () => {
    const gen = new ReportGenerator({ urlBuilder });
    const contrib = {
      name: 'Alice', email: 'alice@example.com',
      totalCommits: 10, totalLinesAdded: 500, totalLinesRemoved: 100,
      files: ['src/auth.js', 'src/util.js'],
      narrative: 'Alice 是该项目的核心开发者，主导了认证模块的架构设计。',
      importantCommits: [
        { hash: 'abc123', subject: 'feat: add auth', reason: '实现了核心认证功能' },
        { hash: 'def456', subject: 'fix: token refresh', reason: '修复了关键安全漏洞' },
      ],
    };
    const profile = gen.generateContributorProfile(contrib);
    expect(profile).toContain('Alice (alice@example.com)');
    expect(profile).toContain('Alice 是该项目的核心开发者');
    expect(profile).toContain('https://github.com/org/repo/commit/abc123');
    expect(profile).toContain('feat: add auth');
    expect(profile).toContain('实现了核心认证功能');
  });

  test('generates full report combining all sections', () => {
    const gen = new ReportGenerator({ urlBuilder, analysisDate: '2026-06-12', timeRange: '全部历史' });
    const contributors = [
      { name: 'Alice', email: 'alice@example.com', totalCommits: 10, totalLinesAdded: 500, totalLinesRemoved: 100, files: ['a.js'],
        narrative: 'Alice contributed to auth.', importantCommits: [{ hash: 'abc123', subject: 'feat: auth', reason: 'core feature' }] },
    ];
    const report = gen.generateFullReport(contributors);
    expect(report).toContain('贡献者统计报告 — repo');
    expect(report).toContain('总览');
    expect(report).toContain('Alice (alice@example.com)');
    expect(report).toContain('报告由 contributor-statistic skill 自动生成');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd contributor-statistic && npx jest tests/test-report-generator.test.js --verbose`
Expected: FAIL — module not found

**Step 3: Write implementation**

```javascript
'use strict';

// ============================================================================
// REPORT GENERATOR
// ============================================================================

class ReportGenerator {
  constructor(options) {
    this.urlBuilder = options.urlBuilder;
    this.analysisDate = options.analysisDate || new Date().toISOString().split('T')[0];
    this.timeRange = options.timeRange || '全部历史';
    this.repoUrl = options.repoUrl || this.urlBuilder?.baseUrl || '';
    this.repoName = options.repoName || this.urlBuilder?.repoName || 'unknown';
  }

  generateHeader() {
    return `# 贡献者统计报告 — ${this.repoName}\n\n> 分析时间: ${this.analysisDate} | 时间范围: ${this.timeRange} | 仓库: ${this.repoUrl}\n`;
  }

  generateSummaryTable(contributors) {
    const header = '| 贡献者 | 提交数 | 新增行数 | 删除行数 | 涉及文件数 |';
    const separator = '|--------|--------|----------|----------|------------|';
    const rows = contributors.map(c =>
      `| ${c.name} | ${c.totalCommits} | ${this.formatNumber(c.totalLinesAdded)} | ${this.formatNumber(c.totalLinesRemoved)} | ${c.files?.length || 0} |`
    );
    return `${header}\n${separator}\n${rows.join('\n')}\n`;
  }

  generateContributorProfile(contrib) {
    const lines = [];

    lines.push(`## ${contrib.name} (${contrib.email})\n`);
    lines.push(`**贡献概述**: ${contrib.narrative || '暂无摘要'}\n`);

    if (contrib.files?.length) {
      const categories = this.categorizeFiles(contrib.files);
      lines.push(`**主要贡献领域**: ${categories.join('、')}\n`);
    }

    if (contrib.importantCommits?.length) {
      lines.push('**关键提交**:');
      for (const ic of contrib.importantCommits) {
        const url = this.urlBuilder?.commitUrl(ic.hash) || ic.hash;
        lines.push(`- [${ic.subject}](${url}) — ${ic.reason}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  generateFullReport(contributors) {
    const parts = [];

    parts.push(this.generateHeader());
    parts.push('## 总览\n');
    parts.push(this.generateSummaryTable(contributors));
    parts.push('\n---\n');

    for (const c of contributors) {
      parts.push(this.generateContributorProfile(c));
      parts.push('\n---\n');
    }

    parts.push('\n*报告由 contributor-statistic skill 自动生成*\n');
    return parts.join('\n');
  }

  categorizeFiles(files) {
    const categories = new Set();
    for (const f of files) {
      const dir = f.split('/').find(d => d !== 'src' && d !== 'lib' && d !== 'tests') || f.split('/')[0];
      categories.add(dir);
    }
    return [...categories];
  }

  formatNumber(n) {
    return n.toLocaleString();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { ReportGenerator };
```

**Step 4: Run test to verify it passes**

Run: `cd contributor-statistic && npx jest tests/test-report-generator.test.js --verbose`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add contributor-statistic/lib/report-generator.js contributor-statistic/tests/test-report-generator.test.js
git commit -m "feat(contributor-statistic): add markdown report generator"
```

---

### Task 6: LLM Agent Definitions

**Files:**
- Create: `contributor-statistic/agents/commit-importance.md`
- Create: `contributor-statistic/agents/contributor-summary.md`

**Step 1: Create commit-importance.md agent**

```markdown
---
name: commit-importance
description: "判断贡献者的哪些提交是重要的，返回排名列表和原因"
model: sonnet
color: orange
---

你是一个提交重要性判断专家。给定一位贡献者的提交列表，你需要从中选出最重要的提交，并解释为什么它们重要。

## 输入

你将收到：
- 贡献者名称和邮箱
- 候选提交列表（行数变化 ≥ 阈值的大提交）
- 所有提交列表（作为上下文参考）

## 判断标准

判断提交重要性时，请考虑：
1. **架构影响** — 是否改变了项目结构或引入新模块
2. **功能重要性** — 是否实现了核心功能或关键特性
3. **修复关键问题** — 是否修复了安全漏洞、数据丢失、性能问题
4. **里程碑意义** — 是否代表项目的重大转折点
5. **影响范围** — 涉及的文件数和代码量

## 输出格式

返回 JSON 数组，最多 N 个重要提交：

\`\`\`json
[
  {
    "hash": "abc123",
    "subject": "feat: 实现 OAuth2 认证流程",
    "reason": "引入了项目的核心认证机制，影响了整体架构",
    "rank": 1
  }
]
\`\`\`

请严格按照 JSON 格式输出，不要包含其他文本。
```

**Step 2: Create contributor-summary.md agent**

```markdown
---
name: contributor-summary
description: "为每位贡献者撰写中文贡献摘要"
model: sonnet
color: green
---

你是一个贡献者摘要撰写专家。给定一位贡献者的详细数据，你需要用中文撰写一段自然语言的贡献摘要。

## 输入

你将收到：
- 贡献者名称和邮箱
- 总提交数、新增行数、删除行数、涉及文件数
- 主要贡献领域（目录分类）
- 重要提交列表（含重要性原因）

## 撰写要求

1. 用**中文**撰写
2. 描述该贡献者做了什么，而不是列举数据
3. 突出他们的核心贡献和影响
4. 语言简洁，100-200 字
5. 避免泛泛而谈，要有具体内容
6. 如有重要提交，在摘要中自然提及

## 输出格式

返回纯文本（非 JSON），直接是摘要内容。例如：

"Alice 是该项目的核心开发者，主导了认证模块的架构设计和实现。她引入了 OAuth2 认证流程，构建了项目的基础安全框架，并修复了令牌刷新的关键竞态条件问题。此外，她还推动了 CI 流水线的搭建，确保了代码质量自动化保障。"

请直接输出摘要文本，不要包含 JSON、markdown 或其他格式标记。
```

**Step 3: Commit**

```bash
git add contributor-statistic/agents/commit-importance.md contributor-statistic/agents/contributor-summary.md
git commit -m "feat(contributor-statistic): add LLM agent definitions for importance and summary"
```

---

### Task 7: llm-runner.js — LLM Agent Executor

**Files:**
- Create: `contributor-statistic/lib/llm-runner.js`

**Step 1: Write implementation**

This module follows the AgentRunner pattern from gitcode-code-review, but uses @anthropic-ai/sdk directly for LLM calls instead of Claude Code's agent system.

```javascript
'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================================================
// LLM RUNNER
// ============================================================================

class LLMRunner {
  constructor(config) {
    this.config = config;
    this.agentsDir = path.join(__dirname, '..', 'agents');
    this.client = null;

    if (config?.anthropic?.apiKey) {
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
  }

  loadAgent(agentName) {
    const filePath = path.join(this.agentsDir, `${agentName}.md`);
    const content = fs.readFileSync(filePath, 'utf-8');

    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      throw new Error(`Agent ${agentName} missing frontmatter`);
    }

    const frontmatter = frontmatterMatch[1];
    const definition = content.substring(frontmatterMatch[0].length).trim();

    const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
    const model = modelMatch ? modelMatch[1].trim() : 'inherit';

    return { definition, model };
  }

  async runAgent(agentName, context) {
    if (!this.client) {
      throw new Error('Anthropic API key not configured');
    }

    const agent = this.loadAgent(agentName);
    const prompt = this.buildPrompt(agent.definition, context);

    const response = await this.client.messages.create({
      model: this.resolveModel(agent.model),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text;
  }

  buildPrompt(definition, context) {
    let prompt = definition;
    for (const [key, value] of Object.entries(context)) {
      prompt += `\n\n## ${key}\n\n${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`;
    }
    return prompt;
  }

  resolveModel(model) {
    if (model === 'inherit' || model === 'sonnet') {
      return 'claude-sonnet-4-6';
    }
    return model;
  }

  async judgeCommitImportance(contributor, candidateCommits, allCommits) {
    const result = await this.runAgent('commit-importance', {
      '贡献者': `${contributor.name} (${contributor.email})`,
      '候选提交列表': candidateCommits,
      '所有提交列表': allCommits.map(c => ({ hash: c.hash, subject: c.subject })),
      '最大选择数量': this.config?.contributorStatistic?.maxImportantCommits || 5,
    });

    try {
      return JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error(`Failed to parse commit importance response: ${result}`);
    }
  }

  async writeContributorSummary(contributor) {
    const result = await this.runAgent('contributor-summary', {
      '贡献者': `${contributor.name} (${contributor.email})`,
      '总提交数': contributor.totalCommits,
      '新增行数': contributor.totalLinesAdded,
      '删除行数': contributor.totalLinesRemoved,
      '涉及文件数': contributor.files?.length || 0,
      '主要贡献领域': contributor.contributionAreas || [],
      '重要提交': contributor.importantCommits || [],
    });

    return result.trim();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { LLMRunner };
```

**Step 2: Commit**

```bash
git add contributor-statistic/lib/llm-runner.js
git commit -m "feat(contributor-statistic): add LLM runner for agent execution via Anthropic SDK"
```

---

### Task 8: analyze.js — Main Entry Point & Orchestrator

**Files:**
- Create: `contributor-statistic/scripts/analyze.js`

**Step 1: Write implementation**

This is the main entry point that orchestrates the 6-step pipeline. It follows the pattern from html-presentation's build.js — CLI entry with `if (require.main === module)`.

```javascript
#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { simpleGit } = require('simple-git');
const { GitAnalyzer } = require('../lib/git-analyzer.js');
const { CommitFilter } = require('../lib/commit-filter.js');
const { LLMRunner } = require('../lib/llm-runner.js');
const { ReportGenerator } = require('../lib/report-generator.js');
const { GitHubUrlBuilder } = require('../lib/github-url.js');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG = {
  lineChangeThreshold: 100,
  maxImportantCommits: 5,
};

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function analyze(options) {
  const config = loadConfig();
  const skillConfig = { ...DEFAULT_CONFIG, ...config.contributorStatistic, ...options };

  // Step 1: Get repo path (clone or use local)
  const repoPath = await getRepoPath(options);

  // Step 2: Extract git data
  console.log('📊 提取贡献者数据...');
  const git = simpleGit(repoPath);
  const remoteUrl = await getRemoteUrl(git);
  const urlBuilder = new GitHubUrlBuilder(remoteUrl);

  const logArgs = buildLogArgs(options);
  const shortlog = await git.raw(['shortlog', '-sn', ...logArgs]);
  const logOutput = await git.raw(['log', '--format=%H|%an|%ae|%ai|%s', ...logArgs]);
  const numstatOutput = await git.raw(['log', '--numstat', '--format=%H|%an', ...logArgs]);

  // Parse data
  const contributors = GitAnalyzer.parseShortlog(shortlog);
  const commits = GitAnalyzer.parseLog(logOutput);
  const numstats = GitAnalyzer.parseNumstat(numstatOutput);

  // Merge numstat into commits
  for (const c of commits) {
    const stats = numstats[c.hash];
    if (stats) {
      c.linesAdded = stats.linesAdded;
      c.linesRemoved = stats.linesRemoved;
      c.files = stats.files;
    } else {
      c.linesAdded = 0;
      c.linesRemoved = 0;
      c.files = [];
    }
  }

  // Aggregate by contributor
  const aggregated = GitAnalyzer.aggregateByContributor(contributors, commits);

  // Step 3: Filter candidate commits
  console.log('🔍 过滤候选提交...');
  const filter = new CommitFilter(skillConfig);
  const filteredCommits = filter.filterBySize(commits);
  const byAuthor = filter.groupByAuthor(filteredCommits);

  // Step 4 & 5: LLM agents (if enabled)
  let noLLM = options.noLLM || false;
  const contributorList = [];

  for (const [name, data] of Object.entries(aggregated)) {
    // Filter by author if specified
    if (options.author && name !== options.author) continue;

    const entry = { ...data, importantCommits: [], narrative: '' };

    if (!noLLM && config.anthropic?.apiKey) {
      console.log(`🤖 分析贡献者: ${name}...`);
      const llm = new LLMRunner(config);

      // Step 4: Judge importance
      const authorCandidates = byAuthor[name] || data.commits;
      const importanceResult = await llm.judgeCommitImportance(data, authorCandidates, commits);
      entry.importantCommits = importanceResult.map(ic => ({
        ...ic,
        hash: ic.hash,
        subject: commits.find(c => c.hash === ic.hash)?.subject || ic.subject,
      }));

      // Step 5: Write narrative
      entry.contributionAreas = filter.categorizeFiles ? [] : data.files;
      entry.narrative = await llm.writeContributorSummary(entry);
    } else {
      // No LLM: use size-filtered commits as important
      const authorCandidates = byAuthor[name] || [];
      entry.importantCommits = authorCandidates.slice(0, skillConfig.maxImportantCommits).map(c => ({
        hash: c.hash, subject: c.subject, reason: `${c.linesAdded + c.linesRemoved} 行变化`,
      }));
    }

    contributorList.push(entry);
  }

  // Sort by commit count descending
  contributorList.sort((a, b) => b.totalCommits - a.totalCommits);

  // Step 6: Generate report
  console.log('📝 生成报告...');
  const timeRange = options.since && options.until
    ? `${options.since} ~ ${options.until}`
    : '全部历史';

  const gen = new ReportGenerator({
    urlBuilder,
    analysisDate: new Date().toISOString().split('T')[0],
    timeRange,
  });

  const report = gen.generateFullReport(contributorList);

  const outputPath = options.output || 'report.md';
  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`✅ 报告已生成: ${outputPath}`);

  // Cleanup temp clone
  if (options._tempClonePath && !options.keepClone) {
    console.log('🧹 清理临时 clone...');
    fs.rmSync(options._tempClonePath, { recursive: true, force: true });
  }

  return { reportPath: outputPath, contributors: contributorList };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getRepoPath(options) {
  if (options.repoPath) {
    console.log(`📂 使用本地仓库: ${options.repoPath}`);
    return options.repoPath;
  }

  if (!options.repo) {
    throw new Error('请指定 --repo <url> 或 --repo-path <path>');
  }

  const tempDir = path.join(os.tmpdir(), `contributor-statistic-${Date.now()}`);
  console.log(`⬇️  Clone 仓库到: ${tempDir}`);
  await simpleGit().clone(options.repo, tempDir);
  options._tempClonePath = tempDir;
  return tempDir;
}

async function getRemoteUrl(git) {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    return origin?.refs?.push || origin?.refs?.fetch || '';
  } catch {
    return '';
  }
}

function buildLogArgs(options) {
  const args = ['--all'];
  if (options.branch) args.push(options.branch);
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  if (options.author) args.push(`--author=${options.author}`);
  return args;
}

function loadConfig() {
  const configPaths = [
    path.join(__dirname, '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ];

  for (const cp of configPaths) {
    if (fs.existsSync(cp)) {
      return JSON.parse(fs.readFileSync(cp, 'utf-8'));
    }
  }

  return {};
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
  contributor-statistic — GitHub 仓库贡献者统计分析

  Usage:
    node scripts/analyze.js --repo <url>
    node scripts/analyze.js --repo-path <path>

  Options:
    --repo <url>          GitHub 仓库 URL (自动 clone)
    --repo-path <path>    本地仓库路径
    --since <date>        起始日期 (YYYY-MM-DD)
    --until <date>        结束日期 (YYYY-MM-DD)
    --branch <name>       分析指定分支
    --author <name>       仅分析指定作者
    --output <path>       输出路径 (默认 report.md)
    --no-llm              跳过 LLM，仅输出统计数据
    --keep-clone          保留 clone 目录
    -h, --help            显示帮助
    `);
    process.exit(0);
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo': options.repo = args[++i]; break;
      case '--repo-path': options.repoPath = args[++i]; break;
      case '--since': options.since = args[++i]; break;
      case '--until': options.until = args[++i]; break;
      case '--branch': options.branch = args[++i]; break;
      case '--author': options.author = args[++i]; break;
      case '--output': options.output = args[++i]; break;
      case '--no-llm': options.noLLM = true; break;
      case '--keep-clone': options.keepClone = true; break;
    }
  }

  analyze(options).catch(err => {
    console.error(`❌ 分析失败: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { analyze };
```

**Step 2: Commit**

```bash
git add contributor-statistic/scripts/analyze.js
git commit -m "feat(contributor-statistic): add main entry point with 6-step pipeline"
```

---

### Task 9: Integration Test — End-to-end with Local Repo

**Files:**
- Create: `contributor-statistic/tests/test-integration.test.js`

**Step 1: Write integration test**

This test uses the current skills repo itself as a local repo to test the full pipeline without LLM (using --no-llm).

```javascript
const { analyze } = require('../scripts/analyze.js');
const fs = require('fs');
const path = require('path');

describe('Integration: analyze with local repo (--no-llm)', () => {
  const outputPath = path.join(__dirname, '..', 'test-report.md');

  afterAll(() => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  test('analyzes local repo and generates report', async () => {
    const localRepoPath = path.join(__dirname, '..', '..', '..');

    const result = await analyze({
      repoPath: localRepoPath,
      noLLM: true,
      output: outputPath,
    });

    expect(result.reportPath).toBe(outputPath);
    expect(result.contributors.length).toBeGreaterThan(0);

    const report = fs.readFileSync(outputPath, 'utf-8');
    expect(report).toContain('贡献者统计报告');
    expect(report).toContain('总览');
  }, 30000);
});
```

**Step 2: Run test to verify it passes**

Run: `cd contributor-statistic && npx jest tests/test-integration.test.js --verbose`
Expected: PASS — generates a real report from the skills repo

**Step 3: Commit**

```bash
git add contributor-statistic/tests/test-integration.test.js
git commit -m "test(contributor-statistic): add integration test with local repo (--no-llm)"
```

---

### Task 10: Final Testing & Cleanup

**Step 1: Run all tests**

Run: `cd contributor-statistic && npx jest --verbose`
Expected: All tests pass

**Step 2: Update CLAUDE.md to document the new skill**

Modify `CLAUDE.md` to add contributor-statistic to the skill list and add relevant development commands.

**Step 3: Manual smoke test**

Run: `cd contributor-statistic && node scripts/analyze.js --repo-path /home/nice/chenlening/workspace/skills --no-llm --output ./smoke-test-report.md`
Expected: Generates a report.md with contributor stats from the current repo

Inspect the generated report to verify format is correct, then clean up:
`rm contributor-statistic/smoke-test-report.md`

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add contributor-statistic to CLAUDE.md skill list"
```
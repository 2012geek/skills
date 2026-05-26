# Weekly Tracker — New Project Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** On first run for a new project, backfill all past weeks (commit metadata) and generate a baseline `overall_progress` from current codebase state. Subsequent runs only collect new commits via `last_analyzed_sha` checkpoint.

**Architecture:** Add `last_analyzed_sha` to the projects table as a checkpoint. Modify `git-collector.js` to support sha-based incremental collection. Add `generateBaselineProgress` to `llm.js` for one-shot codebase analysis. Rewrite `collect.js` main loop with new-project detection and backfill/incremental branches.

**Tech Stack:** Node.js, better-sqlite3, simple-git, @anthropic-ai/sdk

---

### Task 1: Update DB schema with `last_analyzed_sha`

**Files:**
- Modify: `weekly-tracker/lib/db.js`

**Step 1: Add column to initSchema**

In `initSchema()`, add `ALTER TABLE` to add the column if it doesn't exist, and update the `CREATE TABLE` for fresh databases:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  clone_url TEXT,
  default_branch TEXT DEFAULT 'main',
  last_analyzed_sha TEXT,
  active INTEGER DEFAULT 1
);
```

Also add an idempotent `ALTER TABLE` so existing DBs get the column:

```sql
ALTER TABLE projects ADD COLUMN last_analyzed_sha TEXT;
```

(Use try/catch since ALTER TABLE errors if column exists in SQLite)

**Step 2: Add helper functions for last_analyzed_sha**

```js
function getLastAnalyzedSha(projectId) {
  return db.prepare('SELECT last_analyzed_sha FROM projects WHERE id = ?').get(projectId)?.last_analyzed_sha || null;
}

function setLastAnalyzedSha(projectId, sha) {
  db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(sha, projectId);
}
```

Export both in `module.exports`.

**Step 3: Update tests**

In `weekly-tracker/test/integration.test.js`, update the DB test section to verify the new column and functions exist.

**Step 4: Run test to verify**

Run: `cd weekly-tracker && node test/integration.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add weekly-tracker/lib/db.js weekly-tracker/test/integration.test.js
git commit -m "feat(weekly-tracker): add last_analyzed_sha column and helpers"
```

---

### Task 2: Add sha-based incremental collection to git-collector

**Files:**
- Modify: `weekly-tracker/lib/git-collector.js`

**Step 1: Add `getHeadSha` function**

```js
async function getHeadSha(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  const log = await localGit.log(['-1', '--format=%H']);
  return log.latest?.hash || null;
}
```

**Step 2: Add `getFirstCommitDate` function**

```js
async function getFirstCommitDate(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  const log = await localGit.log(['--reverse', '--format=%ai', '-1']);
  return log.latest?.date || null;
}
```

**Step 3: Modify `collectProjectCommits` to accept optional `shaAfter`**

Change signature to `collectProjectCommits(project, weekStart, weekEnd, options = {})`.

In the `git log` section, use `options.shaAfter` if provided:

```js
const logArgs = ['--no-merges'];
if (options.shaAfter) {
  logArgs.push(`${options.shaAfter}..HEAD`);
} else {
  logArgs.push('--after', weekStart);
  logArgs.push('--before', weekEnd);
}
logArgs.push('--', '.');  // only the working tree
const logResult = await localGit.log(logArgs);
```

Also add `pathExists` check for existing repos — when shaAfter mode is used with no commits in range, `git log <sha>..HEAD` may return empty. Handle this correctly by checking `commits.length === 0`.

**Step 4: Update `module.exports`**

```js
module.exports = { collectProjectCommits, readKeyFiles, getHeadSha, getFirstCommitDate };
```

**Step 5: Update tests**

Add test assertions for `getHeadSha` and `getFirstCommitDate` being functions.

**Step 6: Run tests**

Run: `cd weekly-tracker && node test/integration.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add weekly-tracker/lib/git-collector.js weekly-tracker/test/integration.test.js
git commit -m "feat(weekly-tracker): add sha-based incremental collection"
```

---

### Task 3: Add baseline progress generation to llm.js

**Files:**
- Modify: `weekly-tracker/lib/llm.js`

**Step 1: Add `generateBaselineProgress` function**

This reads key files from the repo and generates an initial `overall_progress`:

```js
async function generateBaselineProgress(projectName, target, fileContents) {
  const claude = getClient();
  if (!claude) return '';

  const filesText = Object.entries(fileContents)
    .map(([fp, content]) => `=== ${fp} ===\n${content.substring(0, 4000)}${content.length > 4000 ? '\n... [truncated]' : ''}`)
    .join('\n\n');

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: `你是一个项目评估师。根据项目目标和当前关键文件的完整内容，生成项目的初始整体进展描述。这是对一个已有代码库的首次分析。

输出严格按以下格式（不要输出其他 markdown 标题）：

### 已完成
- **模块/功能名** — 基于代码证据描述已实现的功能，引用 \`path/to/file\` 路径
- ...

### 进行中
- **模块/功能名** — 基于代码证据发现未完成或进行中的功能，引用路径
- ...

### 下一步
- 基于项目目标和当前代码状态推断的下一步行动
- ...

规则：
1. 只基于提供的文件内容得出结论，不要猜测
2. "已完成"中的每一项必须有代码证据（已实现的功能、完整的模块等）
3. "进行中"是文件内容中能看到动工但明显不完整的功能
4. 引用具体文件路径
5. 用中文回答`,
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n\n关键文件内容：\n\n${filesText}\n\n请生成初始整体进展描述。`,
    }],
  });

  return getTextContent(msg.content);
}
```

**Step 2: Add `readKeyFiles` import note**

`readKeyFiles` is in git-collector.js, not llm.js. The `generateBaselineProgress` in llm.js receives already-read file contents. No duplication needed.

**Step 3: Update `module.exports`**

```js
module.exports = { generateWeeklySummary, askQuestion, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress };
```

**Step 4: Update tests**

Add test assertion for `generateBaselineProgress` being a function.

**Step 5: Run tests**

Run: `cd weekly-tracker && node test/integration.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add weekly-tracker/lib/llm.js weekly-tracker/test/integration.test.js
git commit -m "feat(weekly-tracker): add baseline progress generation for new projects"
```

---

### Task 4: Rewrite collect.js main loop

**Files:**
- Modify: `weekly-tracker/scripts/collect.js`

**Step 1: Update imports**

```js
const { collectProjectCommits, readKeyFiles, getHeadSha, getFirstCommitDate } = require(path.join(libDir, 'git-collector'));
const { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress } = require(path.join(libDir, 'llm'));
const { getLastAnalyzedSha, setLastAnalyzedSha } = require(path.join(libDir, 'db'));
```

**Step 2: Add `generateWeekRanges` helper**

```js
function generateWeekRanges(startDate, endDate) {
  const ranges = [];
  const d = new Date(startDate);
  d.setHours(0, 0, 0, 0);
  // Align to Monday
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);

  const end = new Date(endDate);

  while (d < end) {
    const weekStart = fmt(d);
    const weekEnd = new Date(d);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    if (weekEnd > end) weekEnd.setTime(end.getTime());
    ranges.push({ weekStart: fmt(d), weekEnd: fmt(weekEnd) });
    d.setDate(d.getDate() + 7);
  }
  return ranges;
}

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

**Step 3: Rewrite project processing logic**

After `upsertProject(project)`, add detection logic:

```js
// Check if this is a new project
const lastWeek = db.prepare('SELECT MAX(week_start) as ws FROM weekly_reports WHERE project_id = ?').get(project.id);
const lastSha = db.prepare('SELECT last_analyzed_sha FROM projects WHERE id = ?').get(project.id)?.last_analyzed_sha || null;

if (!lastWeek || !lastWeek.ws) {
  // === NEW PROJECT ===
  console.log(`    [NEW] Backfilling history...`);

  // Get first commit date
  const firstCommitDate = await getFirstCommitDate(project);
  const lastWeekEnd = new Date(weekEnd); // current week end
  // month - 2 days buffer to ensure we capture all
  let firstDate = firstCommitDate ? new Date(firstCommitDate) : new Date(lastWeekEnd.getTime() - 30 * 24 * 60 * 60 * 1000);
  // Ensure firstDate is at least 6 months back or the actual first commit, whichever is earlier
  const sixMonthsAgo = new Date(lastWeekEnd.getTime() - 180 * 24 * 60 * 60 * 1000);
  if (firstDate > sixMonthsAgo) firstDate = sixMonthsAgo;

  const ranges = generateWeekRanges(firstDate, lastWeekEnd);

  // Backfill past weeks (commit metadata only, no LLM)
  for (const range of ranges) {
    // Skip current week (handled later)
    if (range.weekStart === weekStart) continue;
    const data = await collectProjectCommits(project, range.weekStart, range.weekEnd);
    if (!data) continue;
    data.projectId = project.id;
    upsertWeeklyReport(data);
  }

  console.log(`    Backfilled ${ranges.length - 1} historical weeks`);

  // Generate baseline overall_progress from current codebase
  const headSha = await getHeadSha(project);
  if (target) {
    // Read key files from the repo
    const repoDir = path.join(require('os').tmpdir(), 'weekly-tracker-cache', project.name);
    const keyPatterns = ['package.json', 'tsconfig.json', '*.config.*', 'src/**/*.ts', 'src/**/*.js', 'lib/**/*.js'];
    // Read a sampling of key files
    const keyFiles = scanKeyFiles(repoDir, 15);
    const fileContents = await readKeyFiles(project, keyFiles);
    const baseline = await generateBaselineProgress(project.name, target, fileContents);
    if (baseline) {
      db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(baseline, target.id);
    }
  }

  // Process current week with full LLM pipeline
  const data = await collectProjectCommits(project, weekStart, weekEnd);
  if (data) {
    data.projectId = project.id;
    let fileContents = {};
    if (data.commitMessages.length > 0) {
      const stage1Result = await generateWeeklyProgressDescription(project.name, target, data.commitMessages);
      if (typeof stage1Result === 'string') {
        data.thisWeekDescription = stage1Result;
      } else if (stage1Result && stage1Result.filesToRead) {
        fileContents = await readKeyFiles(project, stage1Result.filesToRead);
        data.thisWeekDescription = await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
      }
    }
    upsertWeeklyReport(data);
    reports.push({ ...data, project_name: project.name, platform: project.platform });

    // Update overall progress
    if (target) {
      const overall = await generateOverallProgress(project.name, target, data.thisWeekDescription || '', data.commitMessages, fileContents);
      if (overall) {
        db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
      }
    }
  }

  // Save checkpoint
  const newHeadSha = await getHeadSha(project);
  if (newHeadSha) {
    db.prepare('UPDATE projects SET last_analyzed_sha = ? WHERE id = ?').run(newHeadSha, project.id);
  }

} else if (lastSha) {
  // === EXISTING PROJECT — incremental ===
  const data = await collectProjectCommits(project, weekStart, weekEnd, { shaAfter: lastSha });
  // ... process normally, then save new HEAD sha
} else {
  // === EXISTING PROJECT but no sha checkpoint (legacy) ===
  // Fall back to week-based collection
  // ... existing logic
}
```

**Step 4: Add `scanKeyFiles` helper**

```js
function scanKeyFiles(repoDir, maxFiles) {
  const files = [];
  const priority = ['package.json', 'tsconfig.json', 'README.md', '.gitignore'];
  // Add existing priority files
  for (const p of priority) {
    if (fs.existsSync(path.join(repoDir, p))) files.push(p);
  }
  // Walk src/ or lib/ for source files
  for (const dir of ['src', 'lib']) {
    const dirPath = path.join(repoDir, dir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, dir, files, maxFiles);
    }
  }
  return files.slice(0, maxFiles);
}

function walkDir(dir, prefix, files, max) {
  if (files.length >= max) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (files.length >= max) return;
    if (e.isFile() && /\.(js|ts|json|jsx|tsx|py|go|rs)$/.test(e.name)) {
      files.push(path.join(prefix, e.name));
    } else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
      walkDir(path.join(dir, e.name), path.join(prefix, e.name), files, max);
    }
  }
}
```

**Step 5: Update tests**

Add integration test for `generateWeekRanges` and `scanKeyFiles`.

**Step 6: Run tests**

Run: `cd weekly-tracker && node test/integration.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add weekly-tracker/scripts/collect.js weekly-tracker/test/integration.test.js
git commit -m "feat(weekly-tracker): add new project backfill and incremental collection"
```

---

### Task 5: Final verification and integration test

**Files:**
- Modify: `weekly-tracker/test/integration.test.js`

**Step 1: Verify all new DB functions exist**

Add assertions for `getLastAnalyzedSha` and `setLastAnalyzedSha` in the DB test section.

**Step 2: Verify all new collector functions exist**

Add assertions for `getHeadSha` and `getFirstCommitDate`.

**Step 3: Verify all new LLM functions exist**

Add assertion for `generateBaselineProgress`.

**Step 4: Run full test suite**

Run: `cd weekly-tracker && node test/integration.test.js`
Expected: All tests PASS

**Step 5: Manual verification checklist**

- [ ] Add a fresh project to config.json, run `npm run collect`, verify:
  - Historical weeks are backfilled with commit data
  - `last_analyzed_sha` is set in the projects table
  - `overall_progress` in project_targets has baseline content
  - Current week has full progress description
- [ ] Run `npm run collect` again — should be no-op (no new commits)
- [ ] Make a new commit in the project, run collect again — should only analyze new commits

**Step 6: Commit any final test changes**

```bash
git add weekly-tracker/test/integration.test.js
git commit -m "test(weekly-tracker): verify new project backfill functions exist"
```

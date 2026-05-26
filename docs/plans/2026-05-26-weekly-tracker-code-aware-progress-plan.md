# Weekly-Tracker: Code-Aware Progress Descriptions — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace commit-message-based progress descriptions with a two-stage LLM pipeline that analyzes actual git diffs and project file contents.

**Architecture:** `git-collector.js` captures full diffs and reads key files on demand. `llm.js` runs a two-stage pipeline: Stage 1 analyzes diffs to identify completed/in-progress work and requests key files. Stage 2 synthesizes diffs + file contents into structured weekly descriptions and synthesized overall progress. Frontend renders structured Markdown with fixed table column widths.

**Tech Stack:** Node.js, simple-git, Anthropic SDK (Claude Sonnet 4.6), better-sqlite3, Express, marked.js

---

### Task 1: Add diff collection and key file reading to git-collector

**Files:**
- Modify: `lib/git-collector.js`

**Step 1: Add diff collection per commit**

In the commit loop (line 62-88), after the existing `diffSummary` call, add a `git show` call to capture the full diff for each commit.

After line 75 (`changedFiles.push(...)`), add:

```js
let diff = '';
try {
  diff = await localGit.show([commit.hash, '--format=']);
} catch {
  diff = '';
}
```

Then include `diff` in the `commitMessages.push(...)` object (line 81-87):

```js
commitMessages.push({
  hash: commit.hash.substring(0, 7),
  message: commit.message,
  author,
  date: commit.date,
  files: changedFiles,
  diff,
});
```

**Step 2: Add readKeyFiles helper function**

Add a new exported function after `collectProjectCommits`:

```js
async function readKeyFiles(project, filePaths) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const files = {};
  for (const fp of filePaths) {
    const fullPath = path.join(repoDir, fp);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Limit individual file size to ~8000 chars to stay within token budget
        files[fp] = content.length > 8000
          ? content.substring(0, 8000) + '\n... [truncated]'
          : content;
      }
    } catch {
      files[fp] = '[unreadable]';
    }
  }
  return files;
}
```

**Step 3: Update module.exports**

Change line 111 from:
```js
module.exports = { collectProjectCommits };
```
To:
```js
module.exports = { collectProjectCommits, readKeyFiles };
```

---

### Task 2: Rewrite LLM module with two-stage pipeline

**Files:**
- Modify: `lib/llm.js`

**Step 1: Replace `generateProgressDescription` with the two-stage pipeline**

Delete the existing `generateProgressDescription` function (lines 79-98) and replace with:

```js
async function generateWeeklyProgressDescription(projectName, target, commitMessages) {
  const claude = getClient();
  if (!claude) return '';

  const diffsText = commitMessages.map((c) => {
    const header = `[${c.hash}] ${c.author}: ${c.message}`;
    const files = (c.files || []).map((f) => `  ${f.file} (+${f.plus} -${f.minus})`).join('\n');
    const diffContent = c.diff && c.diff.length > 3000
      ? c.diff.substring(0, 3000) + '\n... [diff truncated]'
      : (c.diff || '');
    return `${header}\nFiles:\n${files}\nDiff:\n${diffContent}`;
  }).join('\n\n---\n\n');

  // Stage 1: Analyze diffs
  const stage1 = await claude.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: `你是一个项目进度分析师。根据实际的 git diff 内容（不只是 commit message）分析本周项目进展。

必须区分：
- "已完成"：diff 中可以看到完整实现的功能、修复、重构
- "进行中"：diff 显示已经开始但明显未完成的功能（如只有函数签名没实现、只有路由没 controller 等）
- 不要猜测，只能基于 diff 中的代码证据得出结论

同时列出一份"需要阅读完整内容的文件"清单——那些 diff 中频繁出现、但光看 diff 无法判断整体完成度的关键文件（如主入口文件、配置文件、核心模块等）。

输出 JSON 格式（不要 markdown 包裹）：
{
  "completed": ["已完成项1 引用文件路径", "已完成项2 ..."],
  "in_progress": ["进行中项1 引用文件路径 大致完成度%", "进行中项2 ..."],
  "files_to_read": ["path/to/file1.ts", "path/to/file2.ts"]
}`,
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n\n本周 commit diff：\n\n${diffsText}`,
    }],
  });

  const stage1Text = getTextContent(stage1.content);
  let analysis;
  try {
    const jsonMatch = stage1Text.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return `### 已完成\n- 本周有 ${commitMessages.length} 次提交\n\n### 进行中\n- 无法解析分析结果\n\n### 下一步\n- 请运行 collect 重新采集`;
  }

  if (!analysis || !analysis.files_to_read || analysis.files_to_read.length === 0) {
    return formatWeeklyDescription(analysis);
  }

  // Return analysis + files_to_read for stage 2 (collect.js handles file reading)
  return { stage1: analysis, filesToRead: analysis.files_to_read };
}
```

**Step 2: Add stage 2 synthesis function**

```js
async function synthesizeWithFiles(projectName, target, stage1Analysis, fileContents) {
  const claude = getClient();
  if (!claude) return formatWeeklyDescription(stage1Analysis);

  const filesText = Object.entries(fileContents)
    .map(([fp, content]) => `=== ${fp} ===\n${content}`)
    .join('\n\n');

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: `你是一个项目进度分析师。根据 diff 分析结果和关键文件的完整内容，生成结构化的本周进展描述。

输出严格按以下格式（不要输出其他 markdown 标题）：

### 已完成
- **功能名** — 具体完成了什么，引用 `path/to/file` 路径
- ...

### 进行中
- **功能名** — 当前状态，引用路径，估算完成度百分比
- ...

### 下一步
- 下一步合理行动
- ...

规则：
1. "已完成"中的每一项必须有代码证据（diff 或文件内容中可见）
2. "进行中"是已动工但明显不完整的功能
3. "下一步"基于当前代码状态推断
4. 每个条目引用具体文件路径
5. 每项一行，不要过度展开`,
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n\nDiff 分析结果：\n${JSON.stringify(stage1Analysis, null, 2)}\n\n关键文件完整内容：\n\n${filesText}\n\n请生成本周进展描述。`,
    }],
  });

  return getTextContent(msg.content);
}
```

**Step 3: Add formatWeeklyDescription fallback**

```js
function formatWeeklyDescription(analysis) {
  if (!analysis) return '';
  const parts = [];
  if (analysis.completed && analysis.completed.length > 0) {
    parts.push('### 已完成\n' + analysis.completed.map((c) => `- ${c}`).join('\n'));
  }
  if (analysis.in_progress && analysis.in_progress.length > 0) {
    parts.push('### 进行中\n' + analysis.in_progress.map((i) => `- ${i}`).join('\n'));
  }
  return parts.join('\n\n') || '本周无实质性进展';
}
```

**Step 4: Rewrite `generateOverallProgress`**

Replace lines 100-117 with:

```js
async function generateOverallProgress(projectName, target, weeklyDescription, commitMessages, fileContents) {
  const claude = getClient();
  if (!claude) return '';

  if (!weeklyDescription) return '';

  // Build a compact summary of current project state from key files
  const fileSummary = Object.entries(fileContents || {})
    .map(([fp, content]) => `File ${fp}: ${content.length} chars`)
    .join('\n');

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: `你是一个项目进度分析师。根据项目的目标、本周进展和当前关键文件状态，生成项目的整体进度描述。

规则：
- 每次重新综合评估（不要简单追加）
- 明确列出已完成的主要模块和剩余工作
- 如果代码证据充分，可以给出大致进度百分比
- 2-4句话，简洁精炼
- 用中文回答，用 Markdown 格式`,
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n\n本周进展：\n${weeklyDescription}\n\n关键文件概况：\n${fileSummary}\n\n请输出整体进展描述。`,
    }],
  });

  return getTextContent(msg.content);
}
```

**Step 5: Update module.exports**

Change line 127 from:
```js
module.exports = { generateWeeklySummary, askQuestion, generateProgressDescription, generateOverallProgress };
```
To:
```js
module.exports = { generateWeeklySummary, askQuestion, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress };
```

---

### Task 3: Wire new pipeline in collect.js

**Files:**
- Modify: `scripts/collect.js`

**Step 1: Update imports**

Line 10, change from:
```js
const { generateWeeklySummary, generateProgressDescription, generateOverallProgress } = require(path.join(libDir, 'llm'));
```
To:
```js
const { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress } = require(path.join(libDir, 'llm'));
```

Also add `readKeyFiles` to the git-collector import on line 9:
```js
const { collectProjectCommits, readKeyFiles } = require(path.join(libDir, 'git-collector'));
```

**Step 2: Replace the progress generation block (lines 52-67)**

Replace:
```js
if (data.commitMessages.length > 0) {
  data.thisWeekDescription = await generateProgressDescription(data.commitMessages, project.name, target);
  console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
} else {
  console.log(`    - No commits this week`);
}

upsertWeeklyReport(data);
reports.push({ ...data, project_name: project.name, platform: project.platform });

// Update overall progress
if (target) {
  const overall = await generateOverallProgress(
    target.overall_progress || null,
    data.thisWeekDescription || '',
    data.commitCount,
    project.name,
    target
  );
  if (overall) {
    db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
  }
}
```

With:
```js
let fileContents = {};

if (data.commitMessages.length > 0) {
  // Stage 1: Analyze diffs
  const stage1Result = await generateWeeklyProgressDescription(project.name, target, data.commitMessages);

  if (typeof stage1Result === 'string') {
    // Fallback: stage 1 returned formatted text directly (no files to read)
    data.thisWeekDescription = stage1Result;
  } else if (stage1Result && stage1Result.filesToRead) {
    // Stage 2: Read key files and synthesize
    fileContents = await readKeyFiles(project, stage1Result.filesToRead);
    data.thisWeekDescription = await synthesizeWithFiles(project.name, target, stage1Result.stage1, fileContents);
  }

  console.log(`    ✓ ${data.commitCount} commits, ${data.filesChanged} files changed`);
} else {
  console.log(`    - No commits this week`);
}

upsertWeeklyReport(data);
reports.push({ ...data, project_name: project.name, platform: project.platform });

// Update overall progress (now re-synthesized, not appended)
if (target) {
  const overall = await generateOverallProgress(
    project.name,
    target,
    data.thisWeekDescription || '',
    data.commitMessages,
    fileContents
  );
  if (overall) {
    db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(overall, target.id);
  }
}
```

---

### Task 4: Add marked.js and render Markdown in frontend

**Files:**
- Modify: `public/index.html`
- Modify: `public/chat.js`
- Modify: `public/style.css`
- Modify: `package.json`

**Step 1: Add marked dependency**

Run:
```bash
cd weekly-tracker && npm install marked
```

**Step 2: Update index.html to load marked.js**

After `<script src="/chat.js"></script>` (line 60), add:
```html
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

Configure marked in chat.js instead.

**Step 3: Update chat.js to render markdown**

Replace the table cell rendering for progress columns. In `chat.js`, lines 38-40, change:

```js
`<td>${p.target ? esc(p.target.goal) : '<span style="color:#999">&mdash;</span>'}</td>` +
`<td style="font-size:13px">${p.target?.overallProgress || '<span style="color:#999">&mdash;</span>'}</td>` +
`<td style="font-size:13px">${p.thisWeekDescription || (p.commitCount === 0 ? '<span style="color:#999">暂无活动</span>' : '<span style="color:#999">&mdash;</span>')}</td>`;
```

To:
```js
`<td class="target-cell">${p.target ? esc(p.target.goal) : '<span style="color:#999">&mdash;</span>'}</td>` +
`<td class="progress-cell">${p.target?.overallProgress ? renderMd(p.target.overallProgress) : '<span style="color:#999">&mdash;</span>'}</td>` +
`<td class="progress-cell">${p.thisWeekDescription ? renderMd(p.thisWeekDescription) : (p.commitCount === 0 ? '<span style="color:#999">暂无活动</span>' : '<span style="color:#999">&mdash;</span>')}</td>`;
```

And add a `renderMd` function near the `esc` function:

```js
function renderMd(text) {
  if (!text) return '';
  try {
    return marked.parse(text);
  } catch {
    return esc(text);
  }
}
```

**Step 4: Update style.css with fixed column widths and markdown styling**

Replace the `.project-table` section (lines 15-25) with:

```css
.project-table { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; overflow-x: auto; }
.project-table table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.project-table th { background: #f8fafc; padding: 10px 8px; text-align: left; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.project-table th:nth-child(1) { width: 130px; }
.project-table th:nth-child(2) { width: 60px; }
.project-table th:nth-child(3) { width: 60px; }
.project-table th:nth-child(4) { width: 170px; }
.project-table th:nth-child(5) { width: 250px; }
.project-table th:nth-child(6) { width: 250px; }
.project-table td { padding: 8px 8px; font-size: 13px; border-bottom: 1px solid #f1f5f9; vertical-align: top; overflow-wrap: break-word; word-wrap: break-word; }
.project-table tr:hover td { background: #f8fafc; }
```

Add markdown content styling at the end of the file:

```css
.progress-cell h3 { font-size: 13px; margin: 6px 0 2px; color: #333; }
.progress-cell h3:first-child { margin-top: 0; }
.progress-cell ul { margin: 0; padding-left: 16px; list-style: disc; }
.progress-cell li { font-size: 12px; margin-bottom: 2px; line-height: 1.4; }
.progress-cell strong { font-size: 13px; }
.progress-cell p { margin: 2px 0; font-size: 12px; line-height: 1.4; }
.progress-cell code { font-size: 11px; background: #f1f5f9; padding: 1px 4px; border-radius: 2px; }
.target-cell { font-size: 12px; line-height: 1.4; }
```

---

### Task 5: Update integration tests

**Files:**
- Modify: `test/integration.test.js`

**Step 1: Update Git Collector test (line 118-122)**

Change from checking `collectProjectCommits` only to also checking `readKeyFiles`:

```js
describe('Git Collector', () => {
  test('exports expected functions', () => {
    const collector = require(path.join(libDir, 'git-collector'));
    expect(typeof collector.collectProjectCommits).toBe('function');
    expect(typeof collector.readKeyFiles).toBe('function');
  });
});
```

**Step 2: Update LLM Module test (lines 124-132)**

Replace the old function name checks:

```js
describe('LLM Module', () => {
  test('exports expected functions', () => {
    const llm = require(path.join(libDir, 'llm'));
    expect(typeof llm.generateWeeklySummary).toBe('function');
    expect(typeof llm.askQuestion).toBe('function');
    expect(typeof llm.generateWeeklyProgressDescription).toBe('function');
    expect(typeof llm.synthesizeWithFiles).toBe('function');
    expect(typeof llm.generateOverallProgress).toBe('function');
  });
});
```

**Step 3: Run tests to verify**

```bash
cd weekly-tracker && npm test
```

Expected: All 8 tests pass with updated function names.

---

### Task 6: End-to-end manual test

**Step 1: Run collect**

```bash
cd weekly-tracker && npm run collect
```

Expected: Collection completes, structured progress descriptions stored in DB.

**Step 2: Start server and check frontend**

```bash
npm run serve
```

Open `http://localhost:3456` and verify:
- Table columns have fixed widths
- Weekly progress renders as structured markdown (已完成/进行中/下一步)
- Overall progress shows synthesized summary
- No layout breakage with varying content lengths

---

### Rollback Plan

If the two-stage pipeline has issues, the original `generateProgressDescription` can be restored from git:
```bash
git diff dfd788f3..HEAD -- lib/llm.js  # original single-stage version
```

The database schema is unchanged, so no migration rollback is needed.

const Anthropic = require('@anthropic-ai/sdk');

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
      || process.env.ANTHROPIC_AUTH_TOKEN;
    const baseURL = process.env.ANTHROPIC_BASE_URL;
    if (!apiKey) {
      console.warn('No Anthropic credentials found. Set ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.');
      return null;
    }
    client = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  return client;
}

function getModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

function getTextContent(content) {
  const textBlock = content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function generateWeeklySummary(reports, projectTargets) {
  const claude = getClient();
  if (!claude) return 'LLM 摘要不可用（未配置凭证）。';

  const context = reports.map((r) => ({
    project: r.project_name || r.projectName,
    commits: r.commit_count || r.commitCount,
    authors: parseJsonField(r.top_authors || r.topAuthors),
    target: projectTargets[r.project_name || r.projectName] || null,
    commits_detail: parseJsonField(r.commit_messages || r.commitMessages).slice(0, 30),
  }));

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: '你是一个项目分析师。根据提供的 git commit 数据和变更文件列表，用中文撰写一份简洁的周报摘要（2-3段）。根据每个 commit 的变更文件路径和改动量，突出关键主题、重要变更以及项目目标的进展情况。引用具体的 commit 和作者。不要编造数据中不存在的信息。',
    messages: [{
      role: 'user',
      content: `本周项目数据：\n${JSON.stringify(context, null, 2)}\n\n请撰写周报摘要。`,
    }],
  });

  return getTextContent(msg.content);
}

async function askQuestion(question, weekData) {
  const claude = getClient();
  if (!claude) return '问答功能不可用（未配置凭证）。';

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system: '你是一个项目分析师。仅使用提供的 git commit 数据和变更文件信息回答问题。根据每个 commit 的变更文件路径和改动量推断实际修改内容。如果数据中不包含答案，请说明。引用具体的 commit（hash 和作者）来支撑回答。保持简洁。请用中文回答。',
    messages: [{
      role: 'user',
      content: `本周 git commit 数据（含变更文件）：\n${JSON.stringify(weekData, null, 2)}\n\n问题：${question}`,
    }],
  });

  return getTextContent(msg.content);
}


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
- **功能名** — 具体完成了什么，引用 \`path/to/file\` 路径
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

async function generateOverallProgress(projectName, target, weeklyDescription, commitMessages, fileContents) {
  const claude = getClient();
  if (!claude) return '';

  const previousProgress = target?.overall_progress || '';
  if (!weeklyDescription) return previousProgress;

  // Build file content summary with actual content (truncated)
  const fileSummary = Object.entries(fileContents || {})
    .map(([fp, content]) => `=== ${fp} ===\n${content.substring(0, 2000)}${content.length > 2000 ? '\n... [truncated]' : ''}`)
    .join('\n\n');

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: `你是一个项目进度分析师。根据之前的整体进展、本周新进展和当前关键文件内容，更新项目的整体进度描述。

输出严格按以下格式（不要输出其他 markdown 标题）：

### 已完成
- **模块/功能名** — 具体完成了什么，引用 \`path/to/file\` 路径
- ...

### 进行中
- **模块/功能名** — 当前状态，引用路径，估算完成度百分比
- ...

### 下一步
- 下一步合理行动
- ...

规则：
- 基于之前的整体进展与本周新进展进行综合，保留之前已完成的内容，融入本周新完成项
- "已完成"中的每一项必须在文件内容或本周 diff 中有代码证据
- 本周无新进展时，保持之前的整体描述不变
- "进行中"是已动工但明显不完整的功能
- "下一步"基于当前代码状态和项目目标推断
- 每项一行，引用具体文件路径
- 用中文回答`,
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n\n之前的整体进展：\n${previousProgress || '（新目标，无之前进展）'}\n\n本周新进展：\n${weeklyDescription || '本周无活动'}\n\n关键文件内容：\n${fileSummary || '无'}\n\n请输出更新后的整体进展描述。`,
    }],
  });

  return getTextContent(msg.content);
}

function parseJsonField(field) {
  if (!field) return [];
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return []; }
  }
  return Array.isArray(field) ? field : [];
}

module.exports = { generateWeeklySummary, askQuestion, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress };

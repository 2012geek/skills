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

function formatCommitDetail(c) {
  let text = `${c.hash} ${c.author}: ${c.message}`;
  if (c.files && c.files.length > 0) {
    const fileList = c.files.map((f) => `  ${f.file} (+${f.plus} -${f.minus})`).join('\n');
    text += `\n  变更文件:\n${fileList}`;
  }
  return text;
}

async function generateProgressDescription(commits, projectName, target) {
  const claude = getClient();
  if (!claude) return '';

  const top = commits.slice(0, 5);
  const details = top.map(formatCommitDetail).join('\n\n');
  const more = commits.length > 5 ? `\n... and ${commits.length - 5} more commits` : '';

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 512,
    system: '你是一个项目进度分析师。根据 git commit 记录和变更文件列表，用1-3句话描述某个项目本周完成了什么。根据变更的文件路径和改动量推断具体完成了什么工作。不要仅根据 commit message 猜测。用中文回答。',
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n本周 commit 及变更文件：\n\n${details}${more}\n\n请用1-3句话描述本周进展。`,
    }],
  });

  return getTextContent(msg.content);
}

async function generateOverallProgress(previousProgress, thisWeekDesc, commitCount, projectName, target) {
  const claude = getClient();
  if (!claude) return previousProgress || '';

  if (commitCount === 0 && previousProgress) return previousProgress;

  const msg = await claude.messages.create({
    model: getModel(),
    max_tokens: 512,
    system: '你是一个项目进度分析师。根据本周的新进展，更新项目的整体进度描述。在之前进度描述的基础上融入本周新内容。保留已完成的内容，只追加或微调。如果本周无实质进展，返回之前的描述不变。用1-3句话。用中文回答。',
    messages: [{
      role: 'user',
      content: `项目：${projectName}\n目标：${target?.goal || '无'}\n之前的整体进展：${previousProgress || '（新目标，无之前进展）'}\n本周新进展：${thisWeekDesc || '本周无活动'}\n\n请输出更新后的整体进展描述。`,
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

module.exports = { generateWeeklySummary, askQuestion, generateProgressDescription, generateOverallProgress };

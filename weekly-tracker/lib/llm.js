const Anthropic = require('@anthropic-ai/sdk');

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.warn('ANTHROPIC_API_KEY not set. LLM features will be disabled.');
      return null;
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

async function generateWeeklySummary(reports, projectTargets) {
  const claude = getClient();
  if (!claude) return 'LLM summary unavailable (ANTHROPIC_API_KEY not set).';

  const context = reports.map((r) => ({
    project: r.project_name || r.projectName,
    commits: r.commit_count || r.commitCount,
    authors: parseJsonField(r.top_authors || r.topAuthors),
    target: projectTargets[r.project_name || r.projectName] || null,
    commits_detail: parseJsonField(r.commit_messages || r.commitMessages).slice(0, 30),
  }));

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a project analyst. Write a concise weekly summary (2-3 paragraphs) based on the provided git commit data. Highlight key themes, notable changes, and progress toward project targets. Be specific and reference actual commits and authors. Do not fabricate information not present in the data.',
    messages: [{
      role: 'user',
      content: `Weekly project data:\n${JSON.stringify(context, null, 2)}\n\nWrite the weekly summary.`,
    }],
  });

  return msg.content[0].text;
}

async function askQuestion(question, weekData) {
  const claude = getClient();
  if (!claude) return 'Q&A unavailable (ANTHROPIC_API_KEY not set).';

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a project analyst. Answer questions about the projects using ONLY the provided git commit data. If the data does not contain the answer, say so. Cite specific commits (hash and author) when relevant. Be concise.',
    messages: [{
      role: 'user',
      content: `Git commit data for the week:\n${JSON.stringify(weekData, null, 2)}\n\nQuestion: ${question}`,
    }],
  });

  return msg.content[0].text;
}

async function generateProgressDescription(commits, projectName, target) {
  const claude = getClient();
  if (!claude) return '';

  const commitLines = commits.map((c) => `${c.hash} ${c.author}: ${c.message}`).join('\n');

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'You describe project progress concisely based on git commits. Write 1-3 sentences describing what was accomplished this week for a specific project. Be specific about what changed.',
    messages: [{
      role: 'user',
      content: `Project: ${projectName}\nTarget: ${target?.goal || 'none'}\nThis week's commits:\n${commitLines}\n\nDescribe this week's progress in 1-3 sentences.`,
    }],
  });

  return msg.content[0].text;
}

async function generateOverallProgress(allCommitMessages, projectName, target) {
  const claude = getClient();
  if (!claude) return '';

  const msg = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    system: 'You describe overall project progress concisely based on all git commits since the target was set. Describe what has been completed, what is in progress, and what remains.',
    messages: [{
      role: 'user',
      content: `Project: ${projectName}\nTarget: ${target?.goal || 'none'}\nAll commits since target was set:\n${allCommitMessages.join('\n')}\n\nDescribe the overall progress in 1-3 sentences.`,
    }],
  });

  return msg.content[0].text;
}

function parseJsonField(field) {
  if (!field) return [];
  if (typeof field === 'string') {
    try { return JSON.parse(field); } catch { return []; }
  }
  return Array.isArray(field) ? field : [];
}

module.exports = { generateWeeklySummary, askQuestion, generateProgressDescription, generateOverallProgress };

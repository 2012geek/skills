const path = require('path');
const fs = require('fs').promises;
const { loadKnownBugsIndex } = require('./known-bugs-loader');

/**
 * Build the planner agent prompt by combining:
 *   - the planner agent template (agents/planner.md)
 *   - PR metadata, commit messages, diff, file manifest
 *   - known-bugs/INDEX.md
 *   - review guide (optional)
 *   - agent template index (one-line descriptions)
 *
 * The planner writes its output to .tmp/gitcode-review/pr-<N>/review-plan.json.
 *
 * @param {object} ctx - context object with keys:
 *   - pr: { number, title, url, author, isDraft, description }
 *   - commitMessages: string[]
 *   - files: [{ path, additions, deletions, status }]
 *   - diff: string
 *   - reviewGuide: string | undefined
 *   - agentTemplateIndex: [{ name, model, description }]
 * @param {string} kbDir - absolute path to known-bugs/ directory
 * @returns {Promise<string>} the assembled prompt
 */
async function buildPlannerPrompt(ctx, kbDir) {
  const agentTemplatePath = path.join(__dirname, '..', 'agents', 'planner.md');
  const templateContent = await fs.readFile(agentTemplatePath, 'utf-8');
  const definition = stripFrontmatter(templateContent);

  const kbIndex = loadKnownBugsIndex(kbDir);

  const sections = [
    definition,
    '',
    '---',
    '',
    '## 本次 PR 上下文',
    '',
    `PR #${ctx.pr.number}: ${ctx.pr.title}`,
    `URL: ${ctx.pr.url}`,
    `作者: ${ctx.pr.author}`,
    `草稿: ${ctx.pr.isDraft ? 'yes' : 'no'}`,
    '',
    '### PR 描述',
    '',
    ctx.pr.description || '(无描述)',
    '',
    '### 提交信息',
    '',
    ...(ctx.commitMessages || []).map(m => `- ${m}`),
    '',
    '### 文件清单',
    '',
    ...(ctx.files || []).map(f => `- ${f.path} (+${f.additions}/-${f.deletions}) [${f.status}]`),
    '',
    '### Diff',
    '',
    '```diff',
    ctx.diff || '(no diff)',
    '```',
    '',
    '## known-bugs INDEX',
    '',
    '每条已知 bug 的描述如下。判断每条是否与本次 PR 语义相关，给一句理由。',
    '',
    ...(kbIndex.length === 0
      ? ['(知识库为空)']
      : kbIndex.map(e => `- [${e.file}](${e.link}) — ${e.description}`)),
    '',
  ];

  if (ctx.reviewGuide) {
    sections.push(
      '## 项目审查指南',
      '',
      ctx.reviewGuide,
      '',
    );
  }

  sections.push(
    '## 可用 agent 模板',
    '',
    '下面是本 skill 提供的 agent 模板索引。你可以在 `riskCoverage[].agent` 中填其中之一，'
      + '也可以填一个不在列表里的名字（脚本会用通用模板生成 prompt，你必须在 `focus` 里写明通过/失败标准）。',
    '',
    ...(ctx.agentTemplateIndex || []).map(t => `## ${t.name} (${t.model})\n${t.description}\n`),
    '',
    '## 输出',
    '',
    `用 \`Write\` 工具把 JSON 写到 \`.tmp/gitcode-review/pr-${ctx.pr.number}/review-plan.json\`。`,
    '',
    '不要创建 Git worktree、不要 fetch 或 clone、不要访问网络、不要写到该路径之外。',
  );

  return sections.join('\n');
}

function stripFrontmatter(content) {
  const match = content.match(/^---\n[\s\S]+?\n---\n(.+)$/);
  return match ? match[1].trim() : content.trim();
}

module.exports = { buildPlannerPrompt };

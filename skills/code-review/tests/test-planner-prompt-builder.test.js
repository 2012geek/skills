const path = require('path');
const { buildPlannerPrompt } = require('../lib/planner-prompt-builder');

const KB_DIR = path.join(__dirname, '..', 'known-bugs');

const sampleContext = {
  pr: {
    number: 7,
    title: 'refactor: restructure deploy module',
    url: 'https://gitcode.com/openeuler/vla-factory/pull/7',
    author: 'chenlening',
    isDraft: false,
    description: 'Refactors deploy/ into layered structure.',
  },
  commitMessages: ['refactor: restructure deploy module into transports, platforms, orchestration'],
  files: [
    { path: 'vla_factory/deploy/infer.py', additions: 183, deletions: 101, status: 'modified' },
    { path: 'docs/modules/deploy-module.md', additions: 755, deletions: 0, status: 'added' },
  ],
  diff: 'diff --git a/vla_factory/deploy/infer.py b/vla_factory/deploy/infer.py\n@@ -1,10 +1,20 @@\n+class ActionChunk:...',
  reviewGuide: 'Focus: training pipeline, data integrity, model registry.',
  agentTemplateIndex: [
    { name: 'bug-scanner-diff', model: 'sonnet', description: 'Diff-level syntax/logic/API misuse. Use: any PR with code changes.' },
    { name: 'code-analyzer', model: 'opus', description: 'Security/logic/performance. Use: PRs with new logic.' },
  ],
};

describe('planner prompt builder', () => {
  test('prompt includes planner agent definition from template', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/# 审查计划代理 \(Planner\)/);
    expect(prompt).toMatch(/## 你的输入/);
  });

  test('prompt includes PR metadata', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/PR #7: refactor: restructure deploy module/);
    expect(prompt).toMatch(/https:\/\/gitcode.com\/openeuler\/vla-factory\/pull\/7/);
  });

  test('prompt includes commit messages', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/refactor: restructure deploy module into transports/);
  });

  test('prompt includes file manifest', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/vla_factory\/deploy\/infer\.py.*\+183\/-101/);
    expect(prompt).toMatch(/docs\/modules\/deploy-module\.md.*\+755\/-0.*added/);
  });

  test('prompt includes diff content', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/class ActionChunk/);
  });

  test('prompt includes known-bugs INDEX', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/## known-bugs INDEX/);
    expect(prompt).toMatch(/assert-vs-raise\.md.*assert.*ValueError/);
  });

  test('prompt includes review guide when provided', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/## 项目审查指南/);
    expect(prompt).toMatch(/training pipeline/);
  });

  test('prompt omits review guide section when not provided', async () => {
    const ctx = { ...sampleContext, reviewGuide: undefined };
    const prompt = await buildPlannerPrompt(ctx, KB_DIR);
    expect(prompt).not.toMatch(/## 项目审查指南/);
  });

  test('prompt includes agent template index', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/## 可用 agent 模板/);
    expect(prompt).toMatch(/bug-scanner-diff \(sonnet\)/);
  });

  test('prompt writes to .tmp/gitcode-review/pr-<N>/review-plan.json instruction', async () => {
    const prompt = await buildPlannerPrompt(sampleContext, KB_DIR);
    expect(prompt).toMatch(/\.tmp\/gitcode-review\/pr-7\/review-plan\.json/);
  });
});

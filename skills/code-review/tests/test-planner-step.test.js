const path = require('path');
const { GitCodeReviewer } = require('../scripts/gitcode-reviewer');

const samplePrContext = {
  pr: { number: 7, title: 'refactor deploy', url: 'https://gitcode.com/x/y/pull/7', author: 'a', isDraft: false, description: 'refactor' },
  commitMessages: ['refactor: deploy'],
  files: [{ path: 'a.py', additions: 10, deletions: 5, status: 'modified' }],
  diff: '+def f(): pass',
};

describe('planner step (step1_Plan)', () => {
  test('buildPlannerPrompt produces a planner prompt string', async () => {
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'en' });
    const prompt = await reviewer.buildPlannerPrompt(samplePrContext);
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toMatch(/# 审查计划代理/);
  });

  test('writeReviewPlan writes review-plan.json after validation', async () => {
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'en' });
    const fakePlan = {
      proceed: true,
      summary: 'PR adds a function f to module a.py with simple pass body',
      changeType: 'code',
      risks: ['function f has no return statement — callers may get None unexpectedly'],
      riskCoverage: [
        {
          risk: 'function f has no return statement — callers may get None unexpectedly',
          agent: 'bug-scanner-diff',
          focus: 'Pass: function f has explicit return. Fail: any path through f returns None implicitly. Report the missing return at file:line.',
        },
      ],
      nonAgentTasks: [],
      skippedAgents: [],
      knownBugRelevance: [],
      openQuestions: [],
    };
    const tmpDir = path.join(__dirname, 'fixtures', 'tmp-plan-test');
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
    const outPath = await reviewer.writeReviewPlan(fakePlan, tmpDir);
    const written = require('fs').readFileSync(outPath, 'utf-8');
    expect(JSON.parse(written)).toEqual(fakePlan);
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  });

  test('writeReviewPlan rejects malformed plan', async () => {
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'en' });
    const badPlan = { proceed: 'not-bool' };
    const tmpDir = path.join(__dirname, 'fixtures', 'tmp-plan-bad');
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
    await expect(reviewer.writeReviewPlan(badPlan, tmpDir)).rejects.toThrow(/invalid review-plan/);
    require('fs').rmSync(tmpDir, { recursive: true, force: true });
  });
});

const path = require('path');
const fs = require('fs');
const { GitCodeReviewer } = require('../scripts/gitcode-reviewer');

const samplePlan = {
  proceed: true,
  summary: 'refactor',
  changeType: 'mixed',
  riskAreas: ['stale refs'],
  reviewPlan: {
    agents: [
      { name: 'stale-reference-sweep', model: 'sonnet', focusAreas: ['Transport class'], injectKnownBugs: [], rationale: 'PR deleted Transport' },
      { name: 'behavior-preservation-diff', model: 'opus', focusAreas: ['harmonic weights'], injectKnownBugs: [], rationale: 'refactor risk' },
    ],
    nonAgentTasks: [
      { type: 'run-tests', command: 'pytest test/test_x.py', rationale: 'verify tests pass' },
    ],
    skippedAgents: [{ name: 'security-scanner', reason: 'no new attack surface' }],
  },
  knownBugRelevance: [
    { file: 'assert-vs-raise.md', relevant: false, reason: 'no assert in this PR' },
  ],
  confidence: 85,
  openQuestions: [],
};

describe('generateAgentPromptsFromPlan', () => {
  test('generates one prompt file per agent, using template or generic fallback', async () => {
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'zh' });
    const tmpDir = path.join(__dirname, 'fixtures', 'tmp-execute-plan');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(tmpDir), { recursive: true });

    const { promptFiles } = await reviewer.generateAgentPromptsFromPlan(samplePlan, tmpDir, { prNumber: 7 });
    expect(promptFiles).toHaveLength(2);
    expect(promptFiles[0].agentName).toBe('stale-reference-sweep');
    expect(promptFiles[1].agentName).toBe('behavior-preservation-diff');

    const prompt0 = fs.readFileSync(promptFiles[0].path, 'utf-8');
    expect(prompt0).toMatch(/# 陈旧引用扫描代理/);  // from the template
    expect(prompt0).toMatch(/Transport class/);  // focusArea injected

    const prompt1 = fs.readFileSync(promptFiles[1].path, 'utf-8');
    expect(prompt1).toMatch(/# 通用审查 agent/);  // generic fallback (behavior-preservation-diff is not a template)
    expect(prompt1).toMatch(/harmonic weights/);  // focusArea injected
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('injects known-bugs entries marked relevant into prompts', async () => {
    const planWithRelevantKb = {
      ...samplePlan,
      reviewPlan: {
        ...samplePlan.reviewPlan,
        agents: [
          { name: 'bug-scanner-diff', model: 'sonnet', focusAreas: [], injectKnownBugs: ['assert-vs-raise.md'], rationale: 'r' },
        ],
      },
      knownBugRelevance: [
        { file: 'assert-vs-raise.md', relevant: true, reason: 'PR has assert' },
      ],
    };
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'zh' });
    const tmpDir = path.join(__dirname, 'fixtures', 'tmp-kb-inject');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const { promptFiles } = await reviewer.generateAgentPromptsFromPlan(planWithRelevantKb, tmpDir, { prNumber: 7 });
    const promptContent = fs.readFileSync(promptFiles[0].path, 'utf-8');
    expect(promptContent).toMatch(/## 已知 bug 参考/);
    expect(promptContent).toMatch(/# assert → ValueError migration/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

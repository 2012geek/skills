const path = require('path');
const fs = require('fs');
const { GitCodeReviewer } = require('../scripts/gitcode-reviewer');

const samplePlan = {
  proceed: true,
  summary: 'PR refactors deploy module — moves Transport into transports/ subpackage and renames robotwin adapter',
  changeType: 'mixed',
  risks: [
    'PR deleted the Transport class — residual references in docs or code may break',
    'Behavior-preservation: new ExecutionPolicy.consume harmonic weights differ from old _predict_with_ensembling',
  ],
  riskCoverage: [
    {
      risk: 'PR deleted the Transport class — residual references in docs or code may break',
      agent: 'stale-reference-sweep',
      focus: 'Pass: zero matches for "Transport" outside transports/ subpackage. Fail: any import or doc reference. Report each match with file:line.',
    },
    {
      risk: 'Behavior-preservation: new ExecutionPolicy.consume harmonic weights differ from old _predict_with_ensembling',
      agent: 'behavior-preservation-diff',
      focus: 'For buffer sizes 1/2/3, compare new _chunks[i][count-1-i] indexing with old predictions[i][step_idx-i]. Pass: identical action vectors. Fail: divergence — report buffer size and divergence value.',
    },
  ],
  nonAgentTasks: [
    { type: 'run-tests', command: 'pytest test/test_x.py', rationale: 'verify tests pass after refactor' },
  ],
  skippedAgents: [
    { name: 'python-classmethod-checker', reason: 'PR has no @classmethod decorators in the new code (transports/, platforms/, connectors/ all use __init__ and instance methods). No classmethod-related bug surface.' },
  ],
  knownBugRelevance: [
    { file: 'assert-vs-raise.md', relevant: false, reason: 'no assert in this PR' },
  ],
  openQuestions: [],
};

describe('generateAgentPromptsFromPlan (3-phase RBT schema)', () => {
  test('derives one prompt per unique agent from riskCoverage[]', async () => {
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
    expect(prompt0).toMatch(/Pass: zero matches/);  // focus injected

    const prompt1 = fs.readFileSync(promptFiles[1].path, 'utf-8');
    expect(prompt1).toMatch(/# 通用审查 agent/);  // generic fallback (behavior-preservation-diff is not a template)
    expect(prompt1).toMatch(/For buffer sizes 1\/2\/3/);  // focus injected
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('aggregates multiple risks for the same agent into one prompt', async () => {
    const planWithMultiRisk = {
      ...samplePlan,
      risks: [
        'risk A about X',
        'risk B about Y',
        'risk C about Z',
      ],
      riskCoverage: [
        { risk: 'risk A about X', agent: 'bug-scanner-diff', focus: 'pass: no bug found. fail: report X issue with concrete file:line.' },
        { risk: 'risk B about Y', agent: 'bug-scanner-diff', focus: 'pass: no bug found. fail: report Y issue with concrete file:line.' },
        { risk: 'risk C about Z', agent: 'code-analyzer', focus: 'pass: no bug found. fail: report Z issue with concrete file:line.' },
      ],
    };
    const reviewer = new GitCodeReviewer({ pr: 7, commentLanguage: 'zh' });
    const tmpDir = path.join(__dirname, 'fixtures', 'tmp-multi-risk');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });

    const { promptFiles } = await reviewer.generateAgentPromptsFromPlan(planWithMultiRisk, tmpDir, { prNumber: 7 });
    expect(promptFiles).toHaveLength(2);  // bug-scanner-diff + code-analyzer, not 3

    const bugScannerPrompt = fs.readFileSync(promptFiles[0].path, 'utf-8');
    expect(bugScannerPrompt).toMatch(/risk A about X/);
    expect(bugScannerPrompt).toMatch(/risk B about Y/);  // both risks on same agent
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('injects known-bugs entries marked relevant into prompts', async () => {
    const planWithRelevantKb = {
      ...samplePlan,
      risks: ['assert-based validation in new code'],
      riskCoverage: [
        { risk: 'assert-based validation in new code', agent: 'bug-scanner-diff', focus: 'pass: no assert on validation path. fail: report assert used for param check with file:line.' },
      ],
      knownBugRelevance: [
        { file: 'assert-vs-raise.md', relevant: true, reason: 'PR has assert in validation path' },
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

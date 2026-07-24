const { validateReviewPlan } = require('../lib/review-plan-schema');

const validPlan = {
  proceed: true,
  summary: 'PR adds a new login flow',
  changeType: 'code',
  riskAreas: ['OAuth redirect handling', 'token storage'],
  reviewPlan: {
    agents: [
      {
        name: 'auth-flow-security',
        model: 'opus',
        focusAreas: ['redirect URI validation', 'state param CSRF'],
        injectKnownBugs: [],
        rationale: 'New auth code, security-sensitive',
      },
    ],
    nonAgentTasks: [
      { type: 'run-tests', command: 'pytest test/test_auth.py', rationale: 'Verify auth tests pass' },
    ],
    skippedAgents: [
      { name: 'performance-analyzer', reason: 'No hot path added' },
    ],
  },
  knownBugRelevance: [],
  confidence: 85,
  openQuestions: [],
};

describe('review-plan schema validator', () => {
  test('accepts a well-formed plan', () => {
    const result = validateReviewPlan(validPlan);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('rejects plan missing proceed field', () => {
    const bad = { ...validPlan };
    delete bad.proceed;
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/proceed/);
  });

  test('rejects plan with no reviewPlan.agents and no nonAgentTasks', () => {
    const bad = {
      ...validPlan,
      reviewPlan: { agents: [], nonAgentTasks: [], skippedAgents: [] },
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/at least one agent or nonAgentTask/);
  });

  test('rejects agent entry missing rationale', () => {
    const bad = {
      ...validPlan,
      reviewPlan: {
        ...validPlan.reviewPlan,
        agents: [{ name: 'x', model: 'sonnet', focusAreas: [], injectKnownBugs: [] }],
      },
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/rationale/);
  });

  test('rejects knownBugRelevance entry missing reason', () => {
    const bad = {
      ...validPlan,
      knownBugRelevance: [{ file: 'assert-vs-raise.md', relevant: true }],
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/reason/);
  });

  test('rejects out-of-range confidence', () => {
    const bad = { ...validPlan, confidence: 150 };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/confidence/);
  });
});

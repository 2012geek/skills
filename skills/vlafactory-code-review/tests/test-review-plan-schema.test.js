const { validateReviewPlan } = require('../lib/review-plan-schema');

const validPlan = {
  proceed: true,
  summary: 'PR adds OAuth login flow with redirect URI validation and token storage',
  changeType: 'code',
  risks: [
    'OAuth redirect URI validation bypass via open-redirect payload',
    'Token storage in localStorage vulnerable to XSS exfiltration',
  ],
  riskCoverage: [
    {
      risk: 'OAuth redirect URI validation bypass via open-redirect payload',
      agent: 'auth-flow-security',
      focus: 'Pass: redirect URI strictly matches whitelist. Fail: any payload like "//evil.com" or "//trusted.com@evil.com" reaches the OAuth provider. Report the bypass payload.',
    },
    {
      risk: 'Token storage in localStorage vulnerable to XSS exfiltration',
      agent: 'auth-flow-security',
      focus: 'Pass: tokens stored in httpOnly cookie or sessionStorage. Fail: any code path writes access_token to localStorage. Report the write site.',
    },
  ],
  nonAgentTasks: [
    { type: 'run-tests', command: 'pytest test/test_auth.py', rationale: 'Verify auth tests pass' },
  ],
  skippedAgents: [
    { name: 'python-classmethod-checker', reason: 'PR has no @classmethod decorators — auth flow uses instance methods and module-level functions only (file: src/auth/oauth.py, src/auth/tokens.py)' },
  ],
  knownBugRelevance: [],
  openQuestions: [],
};

describe('review-plan schema validator (3-phase RBT structure)', () => {
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

  test('rejects short summary (must include intent)', () => {
    const bad = { ...validPlan, summary: 'adds login' };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/summary/);
  });

  test('rejects orphan risk (in risks[] but not in riskCoverage[])', () => {
    const bad = {
      ...validPlan,
      risks: [...validPlan.risks, 'this risk has no coverage'],
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/no coverage in riskCoverage/);
  });

  test('rejects risk covered twice in riskCoverage[]', () => {
    const bad = {
      ...validPlan,
      riskCoverage: [...validPlan.riskCoverage, { ...validPlan.riskCoverage[0] }],
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/covered 2 times/);
  });

  test('rejects focus that is too short (hand-wavy verify X)', () => {
    const bad = {
      ...validPlan,
      riskCoverage: [
        { ...validPlan.riskCoverage[0], focus: 'verify redirect validation' },
      ],
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/focus/);
  });

  test('rejects skippedAgents reason that is too short (redundant with X)', () => {
    const bad = {
      ...validPlan,
      skippedAgents: [{ name: 'python-classmethod-checker', reason: 'redundant with code-analyzer' }],
    };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/reason/);
  });

  test('rejects proceed=true with empty risks[]', () => {
    const bad = { ...validPlan, risks: [], riskCoverage: [] };
    const result = validateReviewPlan(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toMatch(/proceed=true but risks/);
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

  test('accepts proceed=false with empty risks (skip review)', () => {
    const skip = {
      proceed: false,
      summary: 'PR is a typo fix in README — no review needed',
      changeType: 'trivial',
      risks: [],
      riskCoverage: [],
      nonAgentTasks: [],
      skippedAgents: [],
      knownBugRelevance: [],
      openQuestions: [],
    };
    const result = validateReviewPlan(skip);
    expect(result.valid).toBe(true);
  });
});

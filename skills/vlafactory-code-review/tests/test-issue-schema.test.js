const { validateIssue, validateIssues } = require('../lib/issue-schema');

const validIssue = {
  file: 'src/app.py',
  line: 42,
  type: 'bug',
  severity: 'error',
  confidence: 90,
  title: 'Off-by-one in loop bound',
  description: 'Loop uses < instead of <=, missing last element',
  contextCode: 'for i in range(n-1):',
  fix: { code: 'for i in range(n):', explanation: 'Use n to include last index' },
};

describe('validateIssue', () => {
  test('accepts a well-formed issue', () => {
    const r = validateIssue(validIssue);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('rejects missing confidence — P0 bug case', () => {
    const bad = { ...validIssue };
    delete bad.confidence;
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('missing: confidence'))).toBe(true);
  });

  test('rejects missing line — P0 bug case', () => {
    const bad = { ...validIssue };
    delete bad.line;
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('missing: line'))).toBe(true);
  });

  test('accepts missing optional contextCode', () => {
    const issue = { ...validIssue };
    delete issue.contextCode;
    expect(validateIssue(issue).valid).toBe(true);
  });

  test('accepts missing optional fix', () => {
    const issue = { ...validIssue };
    delete issue.fix;
    expect(validateIssue(issue).valid).toBe(true);
  });

  test('rejects fix missing explanation subfield', () => {
    const bad = { ...validIssue, fix: { code: 'x' } };
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('fix missing or non-string: explanation'))).toBe(true);
  });

  test('rejects non-integer line', () => {
    const bad = { ...validIssue, line: '42' };
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('non-integer line'))).toBe(true);
  });

  test('rejects line < 1', () => {
    const bad = { ...validIssue, line: 0 };
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('line must be >= 1'))).toBe(true);
  });

  test('accepts line = 1 for whole-file findings (doc drift fallback)', () => {
    const ok = { ...validIssue, line: 1 };
    const r = validateIssue(ok);
    expect(r.valid).toBe(true);
  });

  test('rejects confidence out of [0,100]', () => {
    const tooHigh = { ...validIssue, confidence: 150 };
    expect(validateIssue(tooHigh).valid).toBe(false);
    const tooLow = { ...validIssue, confidence: -5 };
    expect(validateIssue(tooLow).valid).toBe(false);
  });

  test('rejects unknown severity', () => {
    const bad = { ...validIssue, severity: 'catastrophe' };
    const r = validateIssue(bad);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('unknown severity'))).toBe(true);
  });

  test('rejects non-object issue', () => {
    const r = validateIssue(null);
    expect(r.valid).toBe(false);
  });
});

describe('validateIssues (batch + bucket)', () => {
  test('splits accepted vs rejectedInvalid, preserving rejection reasons', () => {
    const noConfidence = { ...validIssue };
    delete noConfidence.confidence;
    const noLine = { ...validIssue };
    delete noLine.line;
    const issues = [validIssue, noConfidence, noLine, validIssue];

    const result = validateIssues(issues);

    expect(result.accepted).toHaveLength(2);
    expect(result.rejectedInvalid).toHaveLength(2);
    expect(result.rejectedInvalid[0].errors).toBeDefined();
    expect(result.rejectedInvalid[0].issue).toBe(noConfidence);
    expect(result.rejectedInvalid[1].issue).toBe(noLine);
  });

  test('returns empty buckets for empty input', () => {
    const result = validateIssues([]);
    expect(result.accepted).toEqual([]);
    expect(result.rejectedInvalid).toEqual([]);
  });

  test('handles non-array input', () => {
    const result = validateIssues('not an array');
    expect(result.accepted).toEqual([]);
    expect(result.rejectedInvalid).toHaveLength(1);
    expect(result.rejectedInvalid[0].errors[0]).toContain('not an array');
  });

  test('en-cn-parity PR #7 regression: 5 findings all missing confidence+line → all rejected, none silently dropped', () => {
    // Reproduces the PR #7 smoke-test failure: en-cn-parity-checker agent
    // omitted confidence and line from 5 valid findings; step6_FilterIssues
    // silently dropped them via `undefined >= 80 === false`.
    const buggyAgentOutput = [1, 2, 3, 4, 5].map(i => ({
      file: `docs/file${i}.md`,
      type: 'documentation',
      severity: 'warning',
      title: `Drift ${i}`,
      description: 'EN/CN drift',
      contextCode: 'some line',
      fix: { code: 'fix', explanation: 'why' },
      // confidence and line deliberately omitted
    }));

    const result = validateIssues(buggyAgentOutput);

    expect(result.accepted).toHaveLength(0);
    expect(result.rejectedInvalid).toHaveLength(5);
    // Every rejection must name both missing fields
    for (const r of result.rejectedInvalid) {
      expect(r.errors.some(e => e.includes('missing: confidence'))).toBe(true);
      expect(r.errors.some(e => e.includes('missing: line'))).toBe(true);
    }
  });
});

const fs = require('fs');
const path = require('path');
const { resolveReviewGuidePath } = require('../scripts/gitcode-reviewer');

describe('vlafactory-code-review identity and defaults', () => {
  test('uses the bundled VLA Factory review policy by default', () => {
    const guide = resolveReviewGuidePath(null, null);

    expect(path.basename(guide)).toBe('vla-factory-review-guide.md');
    expect(fs.existsSync(guide)).toBe(true);
    expect(fs.readFileSync(guide, 'utf8')).toContain('Tensor and trajectory semantics');
  });

  test('explicit CLI policy takes precedence over project config', () => {
    expect(resolveReviewGuidePath('/cli/policy.md', '/config/policy.md'))
      .toBe('/cli/policy.md');
    expect(resolveReviewGuidePath(null, '/config/policy.md'))
      .toBe('/config/policy.md');
  });
});

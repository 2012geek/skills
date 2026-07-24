const { selectReviewAgentNames } = require('../scripts/gitcode-reviewer');

describe('review agent selection (legacy --no-planner path)', () => {
  // These tests cover the old rigid-pipeline path, used when
  // codeReview.plannerEnabled === false or --no-planner is passed.
  // The planner-first path (default) does not use selectReviewAgentNames;
  // it dispatches agents per review-plan.json (see test-execute-review-plan.test.js).

  test('omits the Python class checker for non-Python changes', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'README.md', patch: '+documentation' }] });
    expect(names).toHaveLength(4);
    expect(names).not.toContain('python-classmethod-checker');
  });

  test('omits the Python class checker for procedural Python changes', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'script.py', patch: '+print("hello")', fullContent: 'print("hello")\n' }] });
    expect(names).not.toContain('python-classmethod-checker');
  });

  test('includes the Python class checker for class-related Python changes', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'model.py', patch: '+    def build(cls):\n+        pass', fullContent: 'class Model:\n    @classmethod\n    def build(cls):\n        pass\n' }] });
    expect(names).toHaveLength(5);
    expect(names).toContain('python-classmethod-checker');
  });
});

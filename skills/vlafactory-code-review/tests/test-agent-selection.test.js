const { selectReviewAgentNames } = require('../scripts/gitcode-reviewer');

describe('review agent selection (normal automated path)', () => {
  // Planner-assisted review dispatches agents from review-plan.json; routine
  // automated review uses this small orthogonal default set.

  test('omits the Python class checker for non-Python changes', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'README.md', patch: '+documentation' }] });
    expect(names).toHaveLength(3);
    expect(names).not.toContain('bug-scanner-diff-2');
    expect(names).not.toContain('python-classmethod-checker');
  });

  test('omits the Python class checker for procedural Python changes', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'script.py', patch: '+print("hello")', fullContent: 'print("hello")\n' }] });
    expect(names).not.toContain('python-classmethod-checker');
  });

  test('includes the Python class checker only for changed classmethod semantics', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'model.py', patch: '+    def build(cls):\n+        pass', fullContent: 'class Model:\n    @classmethod\n    def build(cls):\n        pass\n' }] });
    expect(names).toHaveLength(4);
    expect(names).toContain('python-classmethod-checker');
  });

  test('does not include the Python class checker merely because the file contains a class', () => {
    const names = selectReviewAgentNames({ files: [{ filename: 'model.py', patch: '@@ -2,1 +2,1 @@\n-    return 1\n+    return 2', fullContent: 'class Model:\n    def value(self):\n        return 2\n' }] });
    expect(names).toHaveLength(3);
    expect(names).not.toContain('python-classmethod-checker');
  });
});

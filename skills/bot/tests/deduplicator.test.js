const { Deduplicator } = require('../lib/deduplicator');

describe('Deduplicator', () => {
  test('same file+line from different agents — merged into one', () => {
    const dedup = new Deduplicator();
    const findings = [
      { file: 'a.js', line: 10, source: 'code-analyzer', severity: 'medium', title: 'bug' },
      { file: 'a.js', line: 10, source: 'commit-watcher', severity: 'low', title: 'same bug' }
    ];
    const result = dedup.deduplicate(findings);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual(['code-analyzer', 'commit-watcher']);
    expect(result[0].severity).toBe('medium'); // keeps higher severity
  });

  test('different file locations — kept separate', () => {
    const dedup = new Deduplicator();
    const findings = [
      { file: 'a.js', line: 10, source: 'code-analyzer', severity: 'medium', title: 'bug A' },
      { file: 'b.js', line: 20, source: 'code-analyzer', severity: 'low', title: 'bug B' }
    ];
    const result = dedup.deduplicate(findings);
    expect(result).toHaveLength(2);
  });

  test('same file but different line — kept separate', () => {
    const dedup = new Deduplicator();
    const findings = [
      { file: 'a.js', line: 10, source: 'code-analyzer', severity: 'medium', title: 'bug 1' },
      { file: 'a.js', line: 20, source: 'code-analyzer', severity: 'low', title: 'bug 2' }
    ];
    const result = dedup.deduplicate(findings);
    expect(result).toHaveLength(2);
  });

  test('empty findings list — returns empty', () => {
    const dedup = new Deduplicator();
    expect(dedup.deduplicate([])).toEqual([]);
    expect(dedup.deduplicate(null)).toEqual([]);
  });

  test('security severity takes priority over others', () => {
    const dedup = new Deduplicator();
    const findings = [
      { file: 'a.js', line: 10, source: 'code-analyzer', severity: 'low', title: 'minor' },
      { file: 'a.js', line: 10, source: 'commit-watcher', severity: 'security', title: 'vuln' }
    ];
    const result = dedup.deduplicate(findings);
    expect(result[0].severity).toBe('security');
  });
});

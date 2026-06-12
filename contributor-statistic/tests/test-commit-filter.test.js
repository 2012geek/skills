const { CommitFilter } = require('../lib/commit-filter.js');

describe('CommitFilter', () => {
  const defaultConfig = { lineChangeThreshold: 100, maxImportantCommits: 5 };

  test('filters commits above line change threshold', () => {
    const filter = new CommitFilter(defaultConfig);
    const commits = [
      { hash: 'a1', linesAdded: 200, linesRemoved: 50 },
      { hash: 'a2', linesAdded: 10, linesRemoved: 5 },
      { hash: 'a3', linesAdded: 80, linesRemoved: 30 },
    ];
    const candidates = filter.filterBySize(commits);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].hash).toBe('a1');
    expect(candidates[1].hash).toBe('a3');
  });

  test('returns all commits when threshold is 0', () => {
    const filter = new CommitFilter({ lineChangeThreshold: 0, maxImportantCommits: 5 });
    const commits = [
      { hash: 'a1', linesAdded: 1, linesRemoved: 0 },
      { hash: 'a2', linesAdded: 5, linesRemoved: 3 },
    ];
    const candidates = filter.filterBySize(commits);
    expect(candidates).toHaveLength(2);
  });

  test('groups commits by author', () => {
    const filter = new CommitFilter(defaultConfig);
    const commits = [
      { hash: 'a1', author: 'Alice', linesAdded: 200, linesRemoved: 50 },
      { hash: 'a2', author: 'Bob', linesAdded: 150, linesRemoved: 30 },
      { hash: 'a3', author: 'Alice', linesAdded: 5, linesRemoved: 2 },
    ];
    const grouped = filter.groupByAuthor(commits);
    expect(grouped['Alice']).toHaveLength(2);
    expect(grouped['Bob']).toHaveLength(1);
  });

  test('calculates total lines changed', () => {
    const filter = new CommitFilter(defaultConfig);
    const commit = { linesAdded: 120, linesRemoved: 80 };
    expect(filter.totalLinesChanged(commit)).toBe(200);
  });
});
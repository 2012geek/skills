const { GitAnalyzer } = require('../lib/git-analyzer.js');

describe('GitAnalyzer', () => {
  describe('parseShortlog', () => {
    test('parses shortlog output into ranked contributor list', () => {
      const input = `
  142\tAlice <alice@example.com>
   87\tBob <bob@example.com>
    5\tCharlie <charlie@example.com>
`;
      const result = GitAnalyzer.parseShortlog(input);
      expect(result).toEqual([
        { name: 'Alice', email: 'alice@example.com', commits: 142 },
        { name: 'Bob', email: 'bob@example.com', commits: 87 },
        { name: 'Charlie', email: 'charlie@example.com', commits: 5 },
      ]);
    });

    test('handles empty input', () => {
      expect(GitAnalyzer.parseShortlog('')).toEqual([]);
    });
  });

  describe('parseLog', () => {
    test('parses commit log with pipe-delimited format', () => {
      const input = `abc123|Alice|alice@example.com|2026-05-01|feat: add auth\ndef456|Bob|bob@example.com|2026-05-02|fix: login bug`;
      const result = GitAnalyzer.parseLog(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        hash: 'abc123', author: 'Alice', email: 'alice@example.com',
        date: '2026-05-01', subject: 'feat: add auth'
      });
    });
  });

  describe('parseNumstat', () => {
    test('parses numstat output into per-commit line stats', () => {
      const input = `abc123|Alice\n10\t5\tsrc/auth.js\n3\t0\tsrc/util.js\ndef456|Bob\n20\t15\tsrc/ui.js`;
      const result = GitAnalyzer.parseNumstat(input);
      expect(result['abc123']).toEqual({
        author: 'Alice', linesAdded: 13, linesRemoved: 5, files: ['src/auth.js', 'src/util.js']
      });
      expect(result['def456']).toEqual({
        author: 'Bob', linesAdded: 20, linesRemoved: 15, files: ['src/ui.js']
      });
    });

    test('handles binary files (shown as -)', () => {
      const input = `abc123|Alice\n-\t-\timage.png\n5\t2\tsrc/app.js`;
      const result = GitAnalyzer.parseNumstat(input);
      expect(result['abc123'].linesAdded).toBe(5);
      expect(result['abc123'].linesRemoved).toBe(2);
      expect(result['abc123'].files).toEqual(['src/app.js']);
    });
  });

  describe('aggregateByContributor', () => {
    test('aggregates commit data per contributor', () => {
      const shortlog = [
        { name: 'Alice', email: 'alice@example.com', commits: 2 },
        { name: 'Bob', email: 'bob@example.com', commits: 1 },
      ];
      const commits = [
        { hash: 'a1', author: 'Alice', email: 'alice@example.com', date: '2026-05-01', subject: 'feat: add auth', linesAdded: 120, linesRemoved: 30, files: ['src/auth.js'] },
        { hash: 'a2', author: 'Alice', email: 'alice@example.com', date: '2026-05-02', subject: 'fix: bug', linesAdded: 10, linesRemoved: 5, files: ['src/util.js'] },
        { hash: 'b1', author: 'Bob', email: 'bob@example.com', date: '2026-05-03', subject: 'docs: readme', linesAdded: 50, linesRemoved: 20, files: ['README.md'] },
      ];

      const result = GitAnalyzer.aggregateByContributor(shortlog, commits);
      expect(result['Alice'].totalCommits).toBe(2);
      expect(result['Alice'].totalLinesAdded).toBe(130);
      expect(result['Alice'].totalLinesRemoved).toBe(35);
      expect(result['Alice'].files).toEqual(['src/auth.js', 'src/util.js']);
      expect(result['Alice'].commits).toHaveLength(2);
    });
  });
});
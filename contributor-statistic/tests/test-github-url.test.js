const { GitHubUrlBuilder } = require('../lib/github-url.js');

describe('GitHubUrlBuilder', () => {
  test('constructs commit URL from GitHub remote', () => {
    const builder = new GitHubUrlBuilder('https://github.com/org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://github.com/org/repo/commit/abc123');
  });

  test('constructs commit URL from SSH remote', () => {
    const builder = new GitHubUrlBuilder('git@github.com:org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://github.com/org/repo/commit/abc123');
  });

  test('constructs commit URL from GitCode remote', () => {
    const builder = new GitHubUrlBuilder('https://gitcode.com/org/repo.git');
    expect(builder.commitUrl('abc123')).toBe('https://gitcode.com/org/repo/commit/abc123');
  });

  test('extracts repo name from URL', () => {
    const builder = new GitHubUrlBuilder('https://github.com/org/my-repo.git');
    expect(builder.repoName).toBe('my-repo');
  });

  test('extracts org from URL', () => {
    const builder = new GitHubUrlBuilder('https://github.com/my-org/repo.git');
    expect(builder.org).toBe('my-org');
  });

  test('throws on invalid remote URL', () => {
    expect(() => new GitHubUrlBuilder('not-a-url')).toThrow();
  });
});
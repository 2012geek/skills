const { GitCodeAPI } = require('../lib');

function createApi() {
  return new GitCodeAPI({
    gitcode: {
      token: 'test-token',
      owner: 'owner',
      repo: 'repo',
      baseUrl: 'https://api.gitcode.com'
    }
  });
}

describe('GitCodeAPI.calculatePosition', () => {
  test('uses the new-file start line from hunk headers', () => {
    const api = createApi();
    const patch = [
      '@@ -10,2 +20,3 @@',
      ' existing line',
      '+inserted line',
      ' trailing context'
    ].join('\n');

    expect(api.calculatePosition(patch, 21, false)).toBe(2);
  });
});

describe('GitCodeAPI.deletePRComment', () => {
  test('uses the GitCode PR comments DELETE endpoint', async () => {
    const api = createApi();
    const calls = [];
    api.request = async (endpoint, options) => {
      calls.push({ endpoint, options });
      return null;
    };

    await api.deletePRComment(12, 34);

    expect(calls).toEqual([
      {
        endpoint: '/api/v5/repos/owner/repo/pulls/12/comments/34',
        options: { method: 'DELETE' }
      }
    ]);
  });

  test('deleteComment aliases deletePRComment', async () => {
    const api = createApi();
    const calls = [];
    api.request = async (endpoint, options) => {
      calls.push({ endpoint, options });
      return null;
    };

    await api.deleteComment(12, 34);

    expect(calls[0].options.method).toBe('DELETE');
  });
});

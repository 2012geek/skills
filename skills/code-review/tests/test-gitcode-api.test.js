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

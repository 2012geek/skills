const { GitCodeAPI } = require('../src/gitcode-api');
const https = require('https');

function mockHttpsRequest(responses) {
  const callIndex = { value: 0 };
  const originalRequest = https.request;

  https.request = function (options, callback) {
    const response = responses[callIndex.value] || responses[0];
    callIndex.value++;

    const res = {
      statusCode: response.statusCode || 200,
      headers: response.headers || {},
      on: function (event, handler) {
        if (event === 'data') {
          handler(response.body || '');
        } else if (event === 'end') {
          handler();
        }
      }
    };

    const req = {
      on: function (event, handler) {
        if (event === 'error' && response.error) handler(response.error);
      },
      write: function () {},
      end: function () {
        callback(res);
      }
    };

    return req;
  };

  return {
    restore: () => { https.request = originalRequest; },
    callCount: () => callIndex.value
  };
}

describe('GitCodeAPI', () => {
  let api;

  beforeEach(() => {
    api = new GitCodeAPI({
      gitcode: {
        token: 'test-token',
        baseUrl: 'https://api.gitcode.com',
        owner: 'test-org',
        repo: 'test-repo'
      }
    });
  });

  test('constructor sets config without Authorization header', () => {
    expect(api.config.token).toBe('test-token');
    expect(api.headers['Authorization']).toBeUndefined();
  });

  test('request() includes access_token as query parameter', async () => {
    const captured = { path: null };
    const mock = mockHttpsRequest([
      { statusCode: 200, body: JSON.stringify([{ number: 1 }]) }
    ]);
    // Patch https.request to capture the path
    const origRequest = https.request;
    https.request = function (options, callback) {
      captured.path = options.path;
      return origRequest(options, callback);
    };

    await api.listIssues(null, 1);
    expect(captured.path).toContain('access_token=test-token');
    https.request = origRequest;
    mock.restore();
  });

  test('createIssue() sends POST to correct endpoint', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 201, body: JSON.stringify({ number: 42, title: 'test issue' }) }
    ]);

    const result = await api.createIssue({ title: 'bug', body: 'desc' });
    expect(result.number).toBe(42);
    mock.restore();
  });

  test('listIssues() sends GET with labels filter', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 200, body: JSON.stringify([{ number: 1 }, { number: 2 }]) }
    ]);

    const result = await api.listIssues('bot-detected', 1);
    expect(result).toHaveLength(2);
    mock.restore();
  });

  test('closeIssue() sends PATCH with form-encoded body', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 200, body: JSON.stringify({ number: 42, state: 'closed' }) }
    ]);

    const result = await api.closeIssue(42);
    expect(result.number).toBe(42);
    mock.restore();
  });

  test('request() formBody encodes as application/x-www-form-urlencoded', async () => {
    const captured = { path: null, headers: {} };
    const mock = mockHttpsRequest([
      { statusCode: 200, body: JSON.stringify({ number: 42 }) }
    ]);
    const origRequest = https.request;
    https.request = function (options, callback) {
      captured.path = options.path;
      captured.headers = options.headers;
      return origRequest(options, callback);
    };

    await api.request('/api/v5/repos/test-org/test-repo/issues/42', {
      method: 'PATCH',
      formBody: { state_event: 'close' }
    });
    expect(captured.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(captured.headers['Authorization']).toBeUndefined();
    https.request = origRequest;
    mock.restore();
  });

  test('commentOnIssue() sends POST comment', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 201, body: JSON.stringify({ id: 100, body: 'test comment' }) }
    ]);

    const result = await api.commentOnIssue(42, 'test comment');
    expect(result.body).toBe('test comment');
    mock.restore();
  });

  test('getPullRequest() sends GET for PR details', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 200, body: JSON.stringify({ number: 1, title: 'test PR' }) }
    ]);

    const result = await api.getPullRequest(1);
    expect(result.number).toBe(1);
    mock.restore();
  });

  test('createPullRequest() sends POST with correct payload', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 201, body: JSON.stringify({ number: 5, title: 'fix bug' }) }
    ]);

    const result = await api.createPullRequest({
      title: 'fix bug',
      body: 'description',
      head: 'fix-branch',
      base: 'master'
    });
    expect(result.number).toBe(5);
    mock.restore();
  });

  test('rate limit handling: 429 → retry then succeed', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 429, headers: { 'retry-after': '1' }, body: '' },
      { statusCode: 200, body: JSON.stringify([{ number: 1 }]) }
    ]);

    const result = await api.listIssues('bot-detected');
    expect(result).toHaveLength(1);
    expect(mock.callCount()).toBe(2);
    mock.restore();
  });

  test('auth error: 401 → throw with clear message', async () => {
    const mock = mockHttpsRequest([
      { statusCode: 401, body: '' }
    ]);

    await expect(api.listIssues('bot-detected'))
      .rejects.toThrow('GitCode auth failed: check your gitcodeToken');
    mock.restore();
  });

  test('calculatePosition() finds line in diff', () => {
    const patch = '@@ -1,3 +1,4 @@\n context\n-old line\n+new line\n+extra line';
    const position = api.calculatePosition(patch, 3, false);
    expect(position).toBe(4); // position at the +extra line
  });

  test('calculatePosition() returns null for unfound line', () => {
    const position = api.calculatePosition('@@ -1 +1 @@\n context', 999, false);
    expect(position).toBeNull();
  });

  test('calculatePosition() returns lineNumber for new file', () => {
    const position = api.calculatePosition(null, 10, true);
    expect(position).toBe(10);
  });
});

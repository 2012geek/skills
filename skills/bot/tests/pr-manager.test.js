const { PRManager } = require('../lib/pr-manager');

describe('PRManager', () => {
  const mockApi = {
    createPullRequest: jest.fn().mockResolvedValue({ number: 5 }),
    commentOnIssue: jest.fn().mockResolvedValue({ id: 200 })
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createPR() creates PR with title and branch', async () => {
    const manager = new PRManager(mockApi);
    const issue = { issueNumber: 42, title: 'null pointer bug' };
    const fixAttempt = { attempt: 1 };
    const result = await manager.createPR(issue, fixAttempt, { owner: 'org', repo: 'repo' });

    expect(result.prNumber).toBe(5);
    expect(result.branch).toBe('bot/fix-42');
    expect(result.status).toBe('created');
    expect(mockApi.createPullRequest).toHaveBeenCalledWith({
      title: 'fix #42: null pointer bug',
      body: expect.stringContaining('Closes #42'),
      head: 'bot/fix-42',
      base: 'master'
    });
  });

  test('PR-Issue linking — body includes Closes #42 for auto-close', async () => {
    const manager = new PRManager(mockApi);
    const issue = { issueNumber: 42, title: 'bug' };
    await manager.createPR(issue, {}, { owner: 'org', repo: 'repo' });

    const callArgs = mockApi.createPullRequest.mock.calls[0][0];
    expect(callArgs.body).toContain('Closes #42');
  });

  test('API rejection — comment on Issue, mark bot-blocked', async () => {
    mockApi.createPullRequest.mockRejectedValueOnce(new Error('protected branch'));
    const manager = new PRManager(mockApi);
    const issue = { issueNumber: 10, title: 'bug' };
    const result = await manager.createPR(issue, {}, { owner: 'org', repo: 'repo' });

    expect(result.status).toBe('bot-blocked');
    expect(result.prNumber).toBeNull();
    expect(mockApi.commentOnIssue).toHaveBeenCalledWith(
      10,
      expect.stringContaining('bot blocked')
    );
  });
});

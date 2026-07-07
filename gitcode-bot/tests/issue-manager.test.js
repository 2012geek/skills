const { IssueManager } = require('../lib/issue-manager');

describe('IssueManager', () => {
  const mockApi = {
    createIssue: jest.fn().mockResolvedValue({ number: 42 }),
    listIssues: jest.fn().mockResolvedValue([]),
    closeIssue: jest.fn().mockResolvedValue({ number: 42, state: 'closed' }),
    commentOnIssue: jest.fn().mockResolvedValue({ id: 100 })
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('createIssue() sends POST to GitCode API', async () => {
    const manager = new IssueManager(mockApi);
    const finding = { id: 'f1', severity: 'medium', title: 'test bug', file: 'a.js', line: 10, description: 'desc' };
    const result = await manager.createIssue('org', 'repo', finding, null);
    expect(result.issueNumber).toBe(42);
    expect(result.status).toBe('open');
    expect(mockApi.createIssue).toHaveBeenCalledWith({
      title: '[medium] test bug',
      body: expect.stringContaining('a.js'),
      labels: 'bot-detected'
    });
  });

  test('createIssue() includes verify test in body', async () => {
    const manager = new IssueManager(mockApi);
    const finding = { id: 'f1', severity: 'critical', title: 'security vuln', file: 'b.js', line: 5, description: 'desc' };
    const verifyTest = { testCode: 'assert(false)', testResult: 'FAILED' };
    const result = await manager.createIssue('org', 'repo', finding, verifyTest);
    expect(mockApi.createIssue).toHaveBeenCalledWith({
      title: expect.any(String),
      body: expect.stringContaining('assert(false)'),
      labels: 'bot-detected'
    });
  });

  test('listOpenIssues() GETs with bot-detected label', async () => {
    const manager = new IssueManager(mockApi);
    await manager.listOpenIssues('org', 'repo');
    expect(mockApi.listIssues).toHaveBeenCalledWith('bot-detected');
  });

  test('closeIssue() PATCHes issue to closed', async () => {
    const manager = new IssueManager(mockApi);
    await manager.closeIssue('org', 'repo', 42);
    expect(mockApi.closeIssue).toHaveBeenCalledWith(42);
  });

  test('commentOnIssue() POSTs comment', async () => {
    const manager = new IssueManager(mockApi);
    await manager.commentOnIssue('org', 'repo', 42, 'bot unable to fix');
    expect(mockApi.commentOnIssue).toHaveBeenCalledWith(42, 'bot unable to fix');
  });

  test('findDuplicate() detects same file+line in existing issues', async () => {
    mockApi.listIssues.mockResolvedValueOnce([
      { number: 10, body: 'File: a.js\nLine: 10\nbug description' }
    ]);
    const manager = new IssueManager(mockApi);
    const finding = { file: 'a.js', line: 10 };
    const duplicate = await manager.findDuplicate('org', 'repo', finding);
    expect(duplicate).toBeDefined();
    expect(duplicate.number).toBe(10);
  });

  test('findDuplicate() returns undefined for no duplicate', async () => {
    mockApi.listIssues.mockResolvedValueOnce([]);
    const manager = new IssueManager(mockApi);
    const finding = { file: 'a.js', line: 10 };
    const duplicate = await manager.findDuplicate('org', 'repo', finding);
    expect(duplicate).toBeUndefined();
  });
});

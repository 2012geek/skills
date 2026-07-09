const { StateStore } = require('../lib/state-store');
const path = require('path');
const os = require('os');
const fs = require('fs');

const testDir = path.join(os.tmpdir(), 'gitcode-bot-test-state');

describe('StateStore', () => {
  let store;

  beforeEach(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
    store = new StateStore(testDir);
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true });
  });

  test('load() returns empty state for new project', () => {
    const state = store.load('neworg', 'newrepo');
    expect(state.findings).toEqual([]);
    expect(state.issues).toEqual([]);
    expect(state.lastScanAt).toBeNull();
  });

  test('addFinding() persists finding to state file', () => {
    store.addFinding('testorg', 'testrepo', {
      id: 'f-1',
      source: 'code-analyzer',
      severity: 'medium',
      title: 'test bug',
      status: 'pending'
    });
    const state = store.load('testorg', 'testrepo');
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0].id).toBe('f-1');
  });

  test('updateFinding() updates finding status', () => {
    store.addFinding('testorg2', 'testrepo2', { id: 'f-2', status: 'pending' });
    store.updateFinding('testorg2', 'testrepo2', 'f-2', { status: 'confirmed' });
    const state = store.load('testorg2', 'testrepo2');
    expect(state.findings[0].status).toBe('confirmed');
  });

  test('addIssue() persists issue record', () => {
    store.addIssue('testorg3', 'testrepo3', { issueNumber: 42, findingId: 'f-3', status: 'open' });
    const state = store.load('testorg3', 'testrepo3');
    expect(state.issues).toHaveLength(1);
    expect(state.issues[0].issueNumber).toBe(42);
  });

  test('updateIssue() updates issue status', () => {
    store.addIssue('testorg5', 'testrepo5', { issueNumber: 10, status: 'open' });
    store.updateIssue('testorg5', 'testrepo5', 10, { status: 'bot-unable-to-fix' });
    const state = store.load('testorg5', 'testrepo5');
    expect(state.issues[0].status).toBe('bot-unable-to-fix');
  });

  test('addFix() persists fix attempt', () => {
    store.addFix('testorg6', 'testrepo6', { issueNumber: 1, attempt: 1, patch: 'diff', testResult: 'PASSED' });
    const state = store.load('testorg6', 'testrepo6');
    expect(state.fixes).toHaveLength(1);
  });

  test('addPR() persists PR record', () => {
    store.addPR('testorg7', 'testrepo7', { prNumber: 1, branch: 'bot/fix-1', status: 'created' });
    const state = store.load('testorg7', 'testrepo7');
    expect(state.prs).toHaveLength(1);
  });

  test('getApprovedIssues() returns only open issues', () => {
    store.addIssue('testorg8', 'testrepo8', { issueNumber: 1, status: 'open' });
    store.addIssue('testorg8', 'testrepo8', { issueNumber: 2, status: 'closed' });
    const approved = store.getApprovedIssues('testorg8', 'testrepo8');
    expect(approved).toHaveLength(1);
    expect(approved[0].issueNumber).toBe(1);
  });

  test('setLastScanAt() updates timestamp', () => {
    const ts = new Date().toISOString();
    store.setLastScanAt('testorg9', 'testrepo9', ts);
    const result = store.getLastScanAt('testorg9', 'testrepo9');
    expect(result).toBe(ts);
  });

  test('state files use owner_repo.json naming', () => {
    store.addFinding('my_org', 'my_repo', { id: 'f-1' });
    const filePath = path.join(testDir, 'my_org_my_repo.json');
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

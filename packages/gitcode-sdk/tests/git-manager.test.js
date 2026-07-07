const { GitManager } = require('../src/git-manager');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock simple-git
jest.mock('simple-git', () => {
  const mockGit = {
    clone: jest.fn().mockResolvedValue(undefined),
    fetch: jest.fn().mockResolvedValue(undefined),
    checkout: jest.fn().mockResolvedValue(undefined),
    checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
    applyPatch: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
    rebase: jest.fn().mockResolvedValue(undefined),
    log: jest.fn().mockResolvedValue({ all: [{ hash: 'abc123', message: 'fix bug' }] }),
    diff: jest.fn().mockResolvedValue('diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n@@ -1 +1 @@\n-old\n+new')
  };

  const factory = jest.fn().mockReturnValue(mockGit);
  factory.mockGit = mockGit;
  return factory;
});

describe('GitManager', () => {
  let manager;
  let tempDir;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = path.join(os.tmpdir(), `gitmanager-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    manager = new GitManager({ reposDir: tempDir });
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('cloneRepo() clones to owner_repo directory', async () => {
    const result = await manager.cloneRepo('https://gitcode.com/org/repo.git', 'org', 'repo');
    expect(result).toBe(path.join(tempDir, 'org_repo'));
    expect(require('simple-git')).toHaveBeenCalled();
  });

  test('cloneRepo() reuses existing clone by fetching', async () => {
    const repoPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(repoPath, { recursive: true });

    const result = await manager.cloneRepo('https://gitcode.com/org/repo.git', 'org', 'repo');
    expect(result).toBe(repoPath);
    expect(require('simple-git').mockGit.fetch).toHaveBeenCalledWith('origin');
    expect(require('simple-git').mockGit.clone).not.toHaveBeenCalled();
  });

  test('createBranch() fetches origin, checks out master, creates local branch', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    await manager.createBranch(localPath, 'bot/fix-42');
    const git = require('simple-git').mockGit;
    expect(git.fetch).toHaveBeenCalledWith('origin');
    expect(git.checkout).toHaveBeenCalledWith('origin/master');
    expect(git.checkoutLocalBranch).toHaveBeenCalledWith('bot/fix-42');
  });

  test('applyPatch() writes patch file, applies it, then removes the file', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    const patchContent = 'diff --git a/file.py b/file.py\n--- a/file.py\n+++ b/file.py\n-old\n+new';
    await manager.applyPatch(localPath, patchContent);

    const patchFile = path.join(localPath, 'fix.patch');
    expect(require('simple-git').mockGit.applyPatch).toHaveBeenCalledWith(patchFile);
    // Patch file should be removed after apply
    expect(fs.existsSync(patchFile)).toBe(false);
  });

  test('applyPatch() removes patch file even if git apply fails', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });
    require('simple-git').mockGit.applyPatch.mockRejectedValueOnce(new Error('patch does not apply'));

    const patchContent = 'broken patch';
    await expect(manager.applyPatch(localPath, patchContent)).rejects.toThrow('patch does not apply');
    // Patch file should still be removed
    expect(fs.existsSync(path.join(localPath, 'fix.patch'))).toBe(false);
  });

  test('commitChanges() adds all files and commits', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    await manager.commitChanges(localPath, 'fix #42: null pointer');
    const git = require('simple-git').mockGit;
    expect(git.add).toHaveBeenCalledWith('-A');
    expect(git.commit).toHaveBeenCalledWith('fix #42: null pointer');
  });

  test('pushBranch() force-pushes to remote', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    await manager.pushBranch(localPath, 'bot/fix-42');
    expect(require('simple-git').mockGit.push).toHaveBeenCalledWith('origin', 'bot/fix-42', ['--force']);
  });

  test('pushBranch() uses custom remote', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    await manager.pushBranch(localPath, 'bot/fix-42', 'upstream');
    expect(require('simple-git').mockGit.push).toHaveBeenCalledWith('upstream', 'bot/fix-42', ['--force']);
  });

  test('rebaseFromMain() fetches and rebases onto origin/master', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    await manager.rebaseFromMain(localPath, 'bot/fix-42');
    const git = require('simple-git').mockGit;
    expect(git.fetch).toHaveBeenCalledWith('origin');
    expect(git.rebase).toHaveBeenCalledWith(['origin/master']);
  });

  test('rebaseFromMain() aborts rebase on conflict and throws', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });
    require('simple-git').mockGit.rebase.mockRejectedValueOnce(new Error('conflict'));

    await expect(manager.rebaseFromMain(localPath, 'bot/fix-42')).rejects.toThrow('Rebase conflict');
    expect(require('simple-git').mockGit.rebase).toHaveBeenCalledWith(['--abort']);
  });

  test('cleanup() removes the local clone directory', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });
    fs.writeFileSync(path.join(localPath, 'README.md'), 'test');

    await manager.cleanup(localPath);
    expect(fs.existsSync(localPath)).toBe(false);
  });

  test('cleanup() is safe if directory does not exist', async () => {
    const localPath = path.join(tempDir, 'nonexistent');
    await manager.cleanup(localPath); // should not throw
  });

  test('getRecentDiff() returns diff for commits since timestamp', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    const diff = await manager.getRecentDiff(localPath, '2026-07-01');
    expect(diff).toContain('diff --git');
    expect(require('simple-git').mockGit.log).toHaveBeenCalled();
    expect(require('simple-git').mockGit.diff).toHaveBeenCalled();
  });

  test('getRecentDiff() returns empty string when no commits', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });
    require('simple-git').mockGit.log.mockResolvedValueOnce({ all: [] });

    const diff = await manager.getRecentDiff(localPath, '2026-07-01');
    expect(diff).toBe('');
  });

  test('getFileContent() reads file from local clone', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });
    fs.writeFileSync(path.join(localPath, 'main.py'), 'def hello():\n    pass');

    const content = await manager.getFileContent(localPath, 'main.py');
    expect(content).toBe('def hello():\n    pass');
  });

  test('getFileContent() returns null for nonexistent file', async () => {
    const localPath = path.join(tempDir, 'org_repo');
    fs.mkdirSync(localPath, { recursive: true });

    const content = await manager.getFileContent(localPath, 'nonexistent.py');
    expect(content).toBeNull();
  });
});

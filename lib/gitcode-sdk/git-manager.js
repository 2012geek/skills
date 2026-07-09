const path = require('path');
const fs = require('fs');
// Resolve simple-git from the plugin root's node_modules
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const simpleGit = require(path.join(PLUGIN_ROOT, 'node_modules', 'simple-git'));
const os = require('os');

const REPOS_DIR = path.join(os.homedir(), '.gitcode-bot', 'repos');

class GitManager {
  constructor(options = {}) {
    this.reposDir = options.reposDir || REPOS_DIR;
    if (!fs.existsSync(this.reposDir)) fs.mkdirSync(this.reposDir, { recursive: true });
  }

  _repoPath(owner, repo) {
    return path.join(this.reposDir, `${owner}_${repo}`);
  }

  _git(localPath) {
    return simpleGit(localPath);
  }

  async cloneRepo(cloneUrl, owner, repo) {
    const localPath = this._repoPath(owner, repo);

    if (fs.existsSync(localPath)) {
      // Reuse existing clone — fetch latest instead of re-cloning
      await this._git(localPath).fetch('origin');
      return localPath;
    }

    await simpleGit().clone(cloneUrl, localPath);
    return localPath;
  }

  async createBranch(localPath, branchName) {
    const git = this._git(localPath);
    await git.fetch('origin');
    await git.checkout('origin/master');
    await git.checkoutLocalBranch(branchName);
  }

  async applyPatch(localPath, patchContent) {
    const patchFile = path.join(localPath, 'fix.patch');
    fs.writeFileSync(patchFile, patchContent);

    try {
      await this._git(localPath).applyPatch(patchFile);
    } finally {
      if (fs.existsSync(patchFile)) fs.unlinkSync(patchFile);
    }
  }

  async commitChanges(localPath, message) {
    const git = this._git(localPath);
    await git.add('-A');
    await git.commit(message);
  }

  async pushBranch(localPath, branchName, remote = 'origin') {
    await this._git(localPath).push(remote, branchName, ['--force']);
  }

  async rebaseFromMain(localPath, branchName) {
    const git = this._git(localPath);
    await git.fetch('origin');
    try {
      await git.rebase(['origin/master']);
    } catch (e) {
      // Rebase conflict — abort and throw
      await git.rebase(['--abort']);
      throw new Error(`Rebase conflict on branch ${branchName}: ${e.message}`);
    }
  }

  async cleanup(localPath) {
    if (fs.existsSync(localPath)) {
      fs.rmSync(localPath, { recursive: true, force: true });
    }
  }

  async getRecentDiff(localPath, sinceTimestamp) {
    const git = this._git(localPath);
    const log = await git.log([`--since=${sinceTimestamp}`, '--format=%H %s']);
    if (log.all.length === 0) return '';

    const latestCommit = log.all[0].hash;
    const diff = await git.diff([latestCommit + '~1', latestCommit]);
    return diff;
  }

  async getFileContent(localPath, filePath) {
    const fullPath = path.join(localPath, filePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
  }
}

module.exports = { GitManager };

const fs = require('fs');
const path = require('path');

class TestDiscovery {
  async discover(repoPath) {
    // Check in priority order
    const checks = [
      { file: 'package.json', getCommand: () => this._getNpmTest(repoPath) },
      { file: 'Makefile', getCommand: () => 'make test' },
      { file: 'pytest.ini', getCommand: () => 'pytest' },
      { file: 'pyproject.toml', getCommand: () => this._getPytestCommand(repoPath) },
      { file: 'tox.ini', getCommand: () => 'tox' },
      { file: 'Cargo.toml', getCommand: () => 'cargo test' },
      { file: 'go.mod', getCommand: () => 'go test ./...' }
    ];

    for (const check of checks) {
      const filePath = path.join(repoPath, check.file);
      if (fs.existsSync(filePath)) {
        const command = check.getCommand();
        if (command) return command;
      }
    }

    return null;
  }

  async getTestCommand(projectConfig, repoPath) {
    if (projectConfig.testCommand) return projectConfig.testCommand;
    return await this.discover(repoPath);
  }

  _getNpmTest(repoPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, 'package.json'), 'utf8'));
      if (pkg.scripts && pkg.scripts.test) return 'npm test';
    } catch (e) {}
    return null;
  }

  _getPytestCommand(repoPath) {
    try {
      const content = fs.readFileSync(path.join(repoPath, 'pyproject.toml'), 'utf8');
      if (content.includes('[tool.pytest')) return 'pytest';
    } catch (e) {}
    return 'pytest';
  }
}

module.exports = { TestDiscovery };

const { execSync } = require('child_process');

class TestRunner {
  async run(testCommand, repoPath) {
    try {
      const output = execSync(testCommand, {
        cwd: repoPath,
        timeout: 120000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const passCount = this._countPasses(output);
      const failCount = this._countFails(output);

      return {
        passed: failCount === 0,
        passCount,
        failCount,
        output
      };
    } catch (e) {
      const output = e.stdout || '' + (e.stderr || '');
      const passCount = this._countPasses(output);
      const failCount = this._countFails(output) || 1;

      return {
        passed: false,
        passCount,
        failCount,
        output
      };
    }
  }

  _countPasses(output) {
    // Jest: "Tests:       5 passed"
    // pytest: "5 passed"
    const jestMatch = output.match(/Tests:\s+\d+ passed/);
    if (jestMatch) return parseInt(jestMatch[0].match(/\d+/)[0]);
    const pytestMatch = output.match(/(\d+) passed/);
    if (pytestMatch) return parseInt(pytestMatch[1]);
    return 0;
  }

  _countFails(output) {
    // Jest: "1 failed"
    // pytest: "2 failed"
    const jestMatch = output.match(/(\d+) failed/);
    if (jestMatch) return parseInt(jestMatch[1]);
    const pytestMatch = output.match(/(\d+) failed/);
    if (pytestMatch) return parseInt(pytestMatch[1]);
    return 0;
  }
}

module.exports = { TestRunner };

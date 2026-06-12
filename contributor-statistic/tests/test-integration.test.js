const { analyze } = require('../scripts/analyze.js');
const fs = require('fs');
const path = require('path');

describe('Integration: analyze with local repo (--no-llm)', () => {
  const outputPath = path.join(__dirname, '..', 'test-report.md');

  afterAll(() => {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  });

  test('analyzes local repo and generates report', async () => {
    const localRepoPath = path.join(__dirname, '..', '..');

    const result = await analyze({
      repoPath: localRepoPath,
      noLLM: true,
      output: outputPath,
    });

    expect(result.reportPath).toBe(outputPath);
    expect(result.contributors.length).toBeGreaterThan(0);

    const report = fs.readFileSync(outputPath, 'utf-8');
    expect(report).toContain('贡献者统计报告');
    expect(report).toContain('总览');
  }, 30000);
});
const { ReportGenerator } = require('../lib/report-generator.js');
const { GitHubUrlBuilder } = require('../lib/github-url.js');

describe('ReportGenerator', () => {
  const urlBuilder = new GitHubUrlBuilder('https://github.com/org/repo.git');

  test('generates header with repo info', () => {
    const gen = new ReportGenerator({ urlBuilder, analysisDate: '2026-06-12', timeRange: '全部历史' });
    const report = gen.generateHeader();
    expect(report).toContain('贡献者统计报告 — repo');
    expect(report).toContain('分析时间: 2026-06-12');
    expect(report).toContain('https://github.com/org/repo');
  });

  test('generates summary table', () => {
    const gen = new ReportGenerator({ urlBuilder });
    const contributors = [
      { name: 'Alice', email: 'alice@example.com', totalCommits: 142, totalLinesAdded: 8230, totalLinesRemoved: 2100, files: ['a.js', 'b.js'] },
      { name: 'Bob', email: 'bob@example.com', totalCommits: 87, totalLinesAdded: 3500, totalLinesRemoved: 1800, files: ['c.js'] },
    ];
    const table = gen.generateSummaryTable(contributors);
    expect(table).toContain('Alice');
    expect(table).toContain('142');
    expect(table).toContain('8,230');
    expect(table).toContain('Bob');
    expect(table).toContain('2');
  });

  test('generates contributor profile with narrative', () => {
    const gen = new ReportGenerator({ urlBuilder });
    const contrib = {
      name: 'Alice', email: 'alice@example.com',
      totalCommits: 10, totalLinesAdded: 500, totalLinesRemoved: 100,
      files: ['src/auth.js', 'src/util.js'],
      narrative: 'Alice 是该项目的核心开发者，主导了认证模块的架构设计。',
      importantCommits: [
        { hash: 'abc123', subject: 'feat: add auth', reason: '实现了核心认证功能' },
        { hash: 'def456', subject: 'fix: token refresh', reason: '修复了关键安全漏洞' },
      ],
    };
    const profile = gen.generateContributorProfile(contrib);
    expect(profile).toContain('Alice (alice@example.com)');
    expect(profile).toContain('Alice 是该项目的核心开发者');
    expect(profile).toContain('https://github.com/org/repo/commit/abc123');
    expect(profile).toContain('feat: add auth');
    expect(profile).toContain('实现了核心认证功能');
  });

  test('generates full report combining all sections', () => {
    const gen = new ReportGenerator({ urlBuilder, analysisDate: '2026-06-12', timeRange: '全部历史' });
    const contributors = [
      { name: 'Alice', email: 'alice@example.com', totalCommits: 10, totalLinesAdded: 500, totalLinesRemoved: 100, files: ['a.js'],
        narrative: 'Alice contributed to auth.', importantCommits: [{ hash: 'abc123', subject: 'feat: auth', reason: 'core feature' }] },
    ];
    const report = gen.generateFullReport(contributors);
    expect(report).toContain('贡献者统计报告 — repo');
    expect(report).toContain('总览');
    expect(report).toContain('Alice (alice@example.com)');
    expect(report).toContain('报告由 contributor-statistic skill 自动生成');
  });
});
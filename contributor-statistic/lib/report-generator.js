'use strict';

// ============================================================================
// REPORT GENERATOR
// ============================================================================

class ReportGenerator {
  constructor(options) {
    this.urlBuilder = options.urlBuilder;
    this.analysisDate = options.analysisDate || new Date().toISOString().split('T')[0];
    this.timeRange = options.timeRange || '全部历史';
    this.repoUrl = options.repoUrl || this.urlBuilder?.baseUrl || '';
    this.repoName = options.repoName || this.urlBuilder?.repoName || 'unknown';
  }

  generateHeader() {
    return `# 贡献者统计报告 — ${this.repoName}\n\n> 分析时间: ${this.analysisDate} | 时间范围: ${this.timeRange} | 仓库: ${this.repoUrl}\n`;
  }

  generateSummaryTable(contributors) {
    const header = '| 贡献者 | 提交数 | 新增行数 | 删除行数 | 涉及文件数 |';
    const separator = '|--------|--------|----------|----------|------------|';
    const rows = contributors.map(c =>
      `| ${c.name} | ${c.totalCommits} | ${this.formatNumber(c.totalLinesAdded)} | ${this.formatNumber(c.totalLinesRemoved)} | ${c.files?.length || 0} |`
    );
    return `${header}\n${separator}\n${rows.join('\n')}\n`;
  }

  generateContributorProfile(contrib) {
    const lines = [];

    lines.push(`## ${contrib.name} (${contrib.email})\n`);
    lines.push(`**贡献概述**: ${contrib.narrative || '暂无摘要'}\n`);

    if (contrib.files?.length) {
      const categories = this.categorizeFiles(contrib.files);
      lines.push(`**主要贡献领域**: ${categories.join('、')}\n`);
    }

    if (contrib.importantCommits?.length) {
      lines.push('**关键提交**:');
      for (const ic of contrib.importantCommits) {
        const url = this.urlBuilder?.commitUrl(ic.hash) || ic.hash;
        lines.push(`- [${ic.subject}](${url}) — ${ic.reason}`);
      }
    }

    lines.push('');
    return lines.join('\n');
  }

  generateFullReport(contributors) {
    const parts = [];

    parts.push(this.generateHeader());
    parts.push('## 总览\n');
    parts.push(this.generateSummaryTable(contributors));
    parts.push('\n---\n');

    for (const c of contributors) {
      parts.push(this.generateContributorProfile(c));
      parts.push('\n---\n');
    }

    parts.push('\n*报告由 contributor-statistic skill 自动生成*\n');
    return parts.join('\n');
  }

  categorizeFiles(files) {
    const categories = new Set();
    for (const f of files) {
      const dir = f.split('/').find(d => d !== 'src' && d !== 'lib' && d !== 'tests') || f.split('/')[0];
      categories.add(dir);
    }
    return [...categories];
  }

  formatNumber(n) {
    return n.toLocaleString();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { ReportGenerator };
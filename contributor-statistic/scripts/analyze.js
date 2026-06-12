#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { simpleGit } = require('simple-git');
const { GitAnalyzer } = require('../lib/git-analyzer.js');
const { CommitFilter } = require('../lib/commit-filter.js');
const { LLMRunner } = require('../lib/llm-runner.js');
const { ReportGenerator } = require('../lib/report-generator.js');
const { GitHubUrlBuilder } = require('../lib/github-url.js');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG = {
  lineChangeThreshold: 100,
  maxImportantCommits: 5,
};

// ============================================================================
// MAIN PIPELINE
// ============================================================================

async function analyze(options) {
  const config = loadConfig();
  const skillConfig = { ...DEFAULT_CONFIG, ...config.contributorStatistic, ...options };

  // Step 1: Get repo path (clone or use local)
  const repoPath = await getRepoPath(options);

  // Step 2: Extract git data
  console.log('📊 提取贡献者数据...');
  const git = simpleGit(repoPath);
  const remoteUrl = await getRemoteUrl(git);
  const urlBuilder = new GitHubUrlBuilder(remoteUrl);

  const logArgs = buildLogArgs(options);
  const shortlog = await git.raw(['shortlog', '-sne', ...logArgs]);
  const logOutput = await git.raw(['log', '--format=%H|%an|%ae|%ai|%s', ...logArgs]);
  const numstatOutput = await git.raw(['log', '--numstat', '--format=%H|%an', ...logArgs]);

  // Parse data
  const contributors = GitAnalyzer.parseShortlog(shortlog);
  const commits = GitAnalyzer.parseLog(logOutput);
  const numstats = GitAnalyzer.parseNumstat(numstatOutput);

  // Merge numstat into commits
  for (const c of commits) {
    const stats = numstats[c.hash];
    if (stats) {
      c.linesAdded = stats.linesAdded;
      c.linesRemoved = stats.linesRemoved;
      c.files = stats.files;
    } else {
      c.linesAdded = 0;
      c.linesRemoved = 0;
      c.files = [];
    }
  }

  // Aggregate by contributor
  const aggregated = GitAnalyzer.aggregateByContributor(contributors, commits);

  // Step 3: Filter candidate commits
  console.log('🔍 过滤候选提交...');
  const filter = new CommitFilter(skillConfig);
  const filteredCommits = filter.filterBySize(commits);
  const byAuthor = filter.groupByAuthor(filteredCommits);

  // Step 4 & 5: LLM agents (if enabled)
  let noLLM = options.noLLM || false;
  const contributorList = [];

  for (const [name, data] of Object.entries(aggregated)) {
    // Filter by author if specified
    if (options.author && name !== options.author) continue;

    const entry = { ...data, importantCommits: [], narrative: '' };

    if (!noLLM && config.anthropic?.apiKey) {
      console.log(`🤖 分析贡献者: ${name}...`);
      const llm = new LLMRunner(config);

      // Step 4: Judge importance
      const authorCandidates = byAuthor[name] || data.commits;
      const importanceResult = await llm.judgeCommitImportance(data, authorCandidates, commits);
      entry.importantCommits = importanceResult.map(ic => ({
        ...ic,
        hash: ic.hash,
        subject: commits.find(c => c.hash === ic.hash)?.subject || ic.subject,
      }));

      // Step 5: Write narrative
      entry.contributionAreas = filter.categorizeFiles ? [] : data.files;
      entry.narrative = await llm.writeContributorSummary(entry);
    } else {
      // No LLM: use size-filtered commits as important
      const authorCandidates = byAuthor[name] || [];
      entry.importantCommits = authorCandidates.slice(0, skillConfig.maxImportantCommits).map(c => ({
        hash: c.hash, subject: c.subject, reason: `${c.linesAdded + c.linesRemoved} 行变化`,
      }));
    }

    contributorList.push(entry);
  }

  // Sort by commit count descending
  contributorList.sort((a, b) => b.totalCommits - a.totalCommits);

  // Step 6: Generate report
  console.log('📝 生成报告...');
  const timeRange = options.since && options.until
    ? `${options.since} ~ ${options.until}`
    : '全部历史';

  const gen = new ReportGenerator({
    urlBuilder,
    analysisDate: new Date().toISOString().split('T')[0],
    timeRange,
  });

  const report = gen.generateFullReport(contributorList);

  const outputPath = options.output || 'report.md';
  fs.writeFileSync(outputPath, report, 'utf-8');
  console.log(`✅ 报告已生成: ${outputPath}`);

  // Cleanup temp clone
  if (options._tempClonePath && !options.keepClone) {
    console.log('🧹 清理临时 clone...');
    fs.rmSync(options._tempClonePath, { recursive: true, force: true });
  }

  return { reportPath: outputPath, contributors: contributorList };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getRepoPath(options) {
  if (options.repoPath) {
    console.log(`📂 使用本地仓库: ${options.repoPath}`);
    return options.repoPath;
  }

  if (!options.repo) {
    throw new Error('请指定 --repo <url> 或 --repo-path <path>');
  }

  const tempDir = path.join(os.tmpdir(), `contributor-statistic-${Date.now()}`);
  console.log(`⬇️  Clone 仓库到: ${tempDir}`);
  await simpleGit().clone(options.repo, tempDir);
  options._tempClonePath = tempDir;
  return tempDir;
}

async function getRemoteUrl(git) {
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    return origin?.refs?.push || origin?.refs?.fetch || '';
  } catch {
    return '';
  }
}

function buildLogArgs(options) {
  const args = ['--all'];
  if (options.branch) args.push(options.branch);
  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  if (options.author) args.push(`--author=${options.author}`);
  return args;
}

function loadConfig() {
  const configPaths = [
    path.join(__dirname, '..', 'config.json'),
    path.join(process.cwd(), 'config.json'),
  ];

  for (const cp of configPaths) {
    if (fs.existsSync(cp)) {
      return JSON.parse(fs.readFileSync(cp, 'utf-8'));
    }
  }

  return {};
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
  contributor-statistic — GitHub 仓库贡献者统计分析

  Usage:
    node scripts/analyze.js --repo <url>
    node scripts/analyze.js --repo-path <path>

  Options:
    --repo <url>          GitHub 仓库 URL (自动 clone)
    --repo-path <path>    本地仓库路径
    --since <date>        起始日期 (YYYY-MM-DD)
    --until <date>        结束日期 (YYYY-MM-DD)
    --branch <name>       分析指定分支
    --author <name>       仅分析指定作者
    --output <path>       输出路径 (默认 report.md)
    --no-llm              跳过 LLM，仅输出统计数据
    --keep-clone          保留 clone 目录
    -h, --help            显示帮助
    `);
    process.exit(0);
  }

  const options = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--repo': options.repo = args[++i]; break;
      case '--repo-path': options.repoPath = args[++i]; break;
      case '--since': options.since = args[++i]; break;
      case '--until': options.until = args[++i]; break;
      case '--branch': options.branch = args[++i]; break;
      case '--author': options.author = args[++i]; break;
      case '--output': options.output = args[++i]; break;
      case '--no-llm': options.noLLM = true; break;
      case '--keep-clone': options.keepClone = true; break;
    }
  }

  analyze(options).catch(err => {
    console.error(`❌ 分析失败: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { analyze };
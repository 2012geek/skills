#!/usr/bin/env node

/**
 * GitCode PR 代码检视工具
 * 功能: 提取 PR 变更信息，支持提交行内评论
 *
 * 使用方式:
 * 1. 使用 Claude Code 进行代码审查
 * 2. 将审查结果保存为 JSON 文件
 * 3. 使用 --issues-from-json 参数提交行内评论
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// 配置文件路径 - 支持从不同目录运行
const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const DEFAULT_CONFIG = {
  gitcode: {
    token: '',
    owner: 'openeuler',
    repo: 'lerobot_ros2',
    baseUrl: 'https://api.gitcode.com'
  },
  codeReview: {
    outputDir: './review-reports',
    autoSubmit: true
  }
};

/**
 * GitCode API 类
 */
class GitCodeAPI {
  constructor(config) {
    this.config = config.gitcode;
    this.headers = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Code-Review-Skill/1.0'
    };
  }

  /**
   * 发送 HTTP 请求（使用内置 https 模块）
   */
  async request(endpoint, options = {}) {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);

    const requestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        ...this.headers,
        ...options.headers
      }
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              reject(new Error(`API 请求失败: ${res.statusCode} - ${JSON.stringify(jsonData)}`));
            } else {
              resolve(jsonData);
            }
          } catch (e) {
            reject(new Error(`解析响应失败: ${e.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`请求失败: ${error.message}`));
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * 获取 PR 列表
   */
  async getPullRequests(state = 'open') {
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}&per_page=100`
    );
    return data;
  }

  /**
   * 获取单个 PR 详情
   */
  async getPullRequest(prNumber) {
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`
    );
    return data;
  }

  /**
   * 获取 PR 文件变更
   */
  async getPRFiles(prNumber) {
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/files`
    );
    return data;
  }

  /**
   * 获取 PR diff（用于计算 position）
   */
  async getPRDiff(prNumber) {
    const files = await this.getPRFiles(prNumber);
    const diffs = {};

    for (const file of files) {
      if (file.patch) {
        // GitCode 的 patch 是一个对象，包含 diff 字段
        const patchContent = file.patch.diff || file.patch;
        diffs[file.filename] = {
          patch: patchContent,
          additions: file.additions,
          deletions: file.deletions,
          status: file.status
        };
      }
    }

    return diffs;
  }

  /**
   * 计算行号在 diff 中的 position
   * GitCode API 使用 position 而不是 line 来定位行内评论
   * position 是从 diff 开始位置的行数索引（从 1 开始）
   */
  calculatePosition(patch, lineNumber, isNewFile) {
    if (!patch) return null;

    const lines = patch.split('\n');
    let position = 0;
    let currentNewLine = 0;  // 新文件中的当前行号

    // 跳过文件头（@@ 前面的行）
    let inHunk = false;
    let hunkNewStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 hunk 头 (@@ -L,S +L,S @@)
      // 修复：使用第3个捕获组获取新文件起始行号 (+184)
      const hunkMatch = line.match(/^@@\s+-\d+,?\d*\s+\+(\d+),?\d*\s+@@/);
      if (hunkMatch) {
        hunkNewStart = parseInt(hunkMatch[1]);
        inHunk = true;
        position = i + 1;  // position 从 1 开始
        currentNewLine = hunkNewStart - 1;  // 修复：设置当前行为新文件起始行-1
        continue;
      }

      if (!inHunk) continue;

      // 解析 diff 行
      const firstChar = line.charAt(0);

      if (firstChar === '+') {
        // 新增行
        currentNewLine++;
        if (currentNewLine === lineNumber) {
          return position;
        }
      } else if (firstChar === '-') {
        // 删除行 - position 增加，但新文件行号不变
      } else if (firstChar === ' ') {
        // 上下文行
        currentNewLine++;
        if (currentNewLine === lineNumber) {
          return position;
        }
      }

      position++;
    }

    return null;
  }

  /**
   * 获取文件内容
   */
  async getFileContent(filePath, ref = 'HEAD') {
    const encodedPath = encodeURIComponent(filePath);
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/contents/${encodedPath}?ref=${ref}`
    );

    // GitCode 返回 base64 编码的内容
    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return '';
  }

  /**
   * 提交 PR 评论
   */
  async submitComment(prNumber, body, commitId, path, position) {
    const payload = { body };
    if (commitId) payload.commit_id = commitId;
    if (path) payload.path = path;
    if (position !== undefined) payload.position = position;

    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return data;
  }

  /**
   * 提交 PR 整体审查评论
   */
  async submitReviewComment(prNumber, body) {
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body })
      }
    );
    return data;
  }
}

/**
 * 代码检视器类
 */
class CodeReviewer {
  constructor(api, config) {
    this.api = api;
    this.config = config.codeReview;
  }

  /**
   * 生成检视报告（简化版 - 不包含规格检查）
   * 规格检查由用户使用 Claude Code 进行
   */
  async generateReview(pr, files) {
    // 收集变更文件列表（供 Claude Code 审查使用）
    const changedFiles = files
      .filter(f => f.status !== 'removed')
      .map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch
      }));

    return {
      pr: {
        number: pr.number,
        title: pr.title,
        author: pr.user.login,
        branch: `${pr.head.ref} → ${pr.base.ref}`,
        headSha: pr.head.sha,
        changedFiles: changedFiles
      },
      // 预留供外部传入问题
      issues: []
    };
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 GitCode PR 代码检视工具\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const options = {
    testApi: args.includes('--test-api'),
    prNumber: null,
    allPrs: args.includes('--all'),
    noSubmit: args.includes('--no-submit'),
    issuesFromJson: null,
    extractOnly: args.includes('--extract-only')
  };

  // 查找 --pr 参数
  const prIndex = args.indexOf('--pr');
  if (prIndex !== -1 && args[prIndex + 1]) {
    options.prNumber = parseInt(args[prIndex + 1]);
  }

  // 查找 --issues-from-json 参数
  const issuesIndex = args.indexOf('--issues-from-json');
  if (issuesIndex !== -1 && args[issuesIndex + 1]) {
    options.issuesFromJson = args[issuesIndex + 1];
  }

  // 加载配置
  let config;
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(configContent) };
  } catch (error) {
    console.log('⚠️  未找到配置文件，使用默认配置');
    config = DEFAULT_CONFIG;
  }

  // 验证 token
  if (!config.gitcode.token) {
    console.error('❌ 错误: 请在 config.json 中配置 gitcode.token');
    console.log('\n获取 Token 步骤:');
    console.log('1. 访问 https://gitcode.com 并登录');
    console.log('2. 点击右上角头像 → 个人设置');
    console.log('3. 找到「访问令牌」选项');
    console.log('4. 创建新的访问令牌');
    console.log('5. 将 Token 填入 config.json\n');
    process.exit(1);
  }

  // 创建 API 实例
  const api = new GitCodeAPI(config);

  // 测试 API 连接
  if (options.testApi) {
    console.log('🔌 测试 API 连接...\n');
    try {
      const prs = await api.getPullRequests('open');
      console.log(`✅ API 连接成功!`);
      console.log(`   仓库: ${config.gitcode.owner}/${config.gitcode.repo}`);
      console.log(`   当前开放 PR 数量: ${prs.length}\n`);
      process.exit(0);
    } catch (error) {
      console.error(`❌ API 连接失败: ${error.message}\n`);
      process.exit(1);
    }
  }

  // 从 JSON 提交问题
  if (options.issuesFromJson && options.prNumber) {
    await submitIssuesFromJson(api, options.prNumber, options.issuesFromJson, options.noSubmit);
    return;
  }

  // 创建检视器
  const reviewer = new CodeReviewer(api, config);

  // 创建输出目录
  const outputDir = path.join(process.cwd(), config.codeReview.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  // 获取要检视的 PR 列表
  let prsToReview = [];

  if (options.prNumber) {
    console.log(`📋 获取 PR #${options.prNumber} 详情...\n`);
    const pr = await api.getPullRequest(options.prNumber);
    prsToReview = [pr];
  } else if (options.allPrs) {
    console.log('📋 获取开放状态的 PR 列表...\n');
    prsToReview = await api.getPullRequests('open');
    console.log(`找到 ${prsToReview.length} 个开放状态的 PR\n`);
  } else {
    console.log('请指定要检视的 PR:');
    console.log('  --pr <number>              检视指定的 PR（提取变更信息）');
    console.log('  --extract-only            仅提取信息，不生成报告');
    console.log('  --issues-from-json <file> 从 JSON 文件加载问题并提交行内评论');
    console.log('  --no-submit                不自动提交评论');
    console.log('  --all                      检视所有开放状态的 PR');
    console.log('  --test-api                 测试 API 连接\n');
    console.log('\nJSON 文件格式:');
    console.log('  [');
    console.log('    {');
    console.log('      "file": "path/to/file.py",');
    console.log('      "line": 42,');
    console.log('      "type": "bug|security|logic_error",');
    console.log('      "severity": "error|warning",');
    console.log('      "title": "问题标题",');
    console.log('      "description": "详细描述",');
    console.log('      "suggestion": "修复建议"');
    console.log('    }');
    console.log('  ]\n');
    process.exit(0);
  }

  // 遍历处理每个 PR
  for (const pr of prsToReview) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔍 PR #${pr.number}: ${pr.title}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      // 获取 PR 文件变更
      const files = await api.getPRFiles(pr.number);
      console.log(`📁 变更文件: ${files.length} 个\n`);

      // 生成报告（提取变更信息）
      const report = await reviewer.generateReview(pr, files);

      // 保存为 JSON（供 Claude Code 审查使用）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const jsonPath = path.join(outputDir, `pr-${pr.number}-info-${timestamp}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`📄 PR 信息已保存: ${jsonPath}\n`);

      console.log(`📊 变更摘要:`);
      console.log(`   分支: ${report.pr.branch}`);
      console.log(`   文件: ${report.pr.changedFiles.length} 个\n`);

      console.log('💡 使用以下命令提交审查结果:');
      console.log(`   node scripts/gitcode-pr-reviewer.js --pr ${pr.number} --issues-from-json issues.json\n`);

    } catch (error) {
      console.error(`❌ 处理失败: ${error.message}\n`);
    }
  }

  // 打印最终汇总
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ 完成');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * 从 JSON 文件加载问题并提交行内评论
 */
async function submitIssuesFromJson(api, prNumber, jsonPath, noSubmit) {
  console.log(`📋 从 JSON 加载问题: ${jsonPath}\n`);

  let issues;
  try {
    const content = await fs.readFile(jsonPath, 'utf-8');
    issues = JSON.parse(content);
  } catch (error) {
    console.error(`❌ 无法读取 JSON 文件: ${error.message}`);
    process.exit(1);
  }

  if (!Array.isArray(issues) || issues.length === 0) {
    console.log('⚠️  没有要提交的问题\n');
    return;
  }

  console.log(`📝 准备提交 ${issues.length} 个问题\n`);

  // 获取 PR 信息
  const pr = await api.getPullRequest(prNumber);
  const diffs = await api.getPRDiff(prNumber);

  if (noSubmit) {
    console.log('ℹ️  --no-submit 模式：将显示提交计划但不执行\n');
    for (const issue of issues) {
      console.log(`  - ${issue.file}:${issue.line} - ${issue.title || issue.message}`);
    }
    console.log('');
    return;
  }

  // 提交整体摘要评论
  const summaryComment = `## 代码审查摘要\n\n` +
    `- **PR**: #${prNumber} - ${pr.title}\n` +
    `- **问题数**: ${issues.length}\n\n` +
    `详细问题请查看各代码行的行内评论。\n\n` +
    `---\n🤖 generated by ai@claude`;

  await api.submitReviewComment(prNumber, summaryComment);
  console.log(`✅ 已提交摘要评论\n`);

  // 为每个问题创建行内评论
  let successCount = 0;
  for (const issue of issues) {
    try {
      const diffInfo = diffs[issue.file];
      if (!diffInfo || !diffInfo.patch) {
        console.log(`  ⚠️  跳过 ${issue.file}:${issue.line} (无 patch 信息)`);
        continue;
      }

      // 计算 position
      const position = api.calculatePosition(diffInfo.patch, issue.line, diffInfo.status === 'added');
      if (position === null) {
        console.log(`  ⚠️  跳过 ${issue.file}:${issue.line} (无法计算 position)`);
        continue;
      }

      // 格式化评论内容（包含文件和行号信息）
      let body = '';
      const severityIcon = {
        'critical': '🚨',
        'error': '❌',
        'warning': '⚠️',
        'minor': 'ℹ️',
        'info': '💡'
      }[issue.severity] || '📝';

      // 注意：GitCode API 不支持行内评论，因此在评论体中包含文件和行号信息
      body += `**文件**: \`${issue.file}:${issue.line}\`\n\n`;
      body += `${severityIcon} **${issue.title || issue.type}**\n\n`;
      if (issue.description) {
        body += `${issue.description}\n\n`;
      }
      if (issue.suggestion) {
        body += `**建议**: ${issue.suggestion}\n`;
      }
      body += `\n---\n🤖 generated by ai@claude`;

      // 提交评论（由于 GitCode API 不支持行内评论，提交为普通评论）
      await api.submitComment(prNumber, body);
      successCount++;
      console.log(`  ✅ ${issue.file}:${issue.line}`);
    } catch (err) {
      console.log(`  ❌ ${issue.file}:${issue.line} - ${err.message}`);
    }
  }

  console.log(`\n✅ 已提交到 PR #${prNumber} (摘要 + ${successCount} 条评论)\n`);
}

// 导出供其他模块使用
module.exports = { GitCodeAPI, CodeReviewer };

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

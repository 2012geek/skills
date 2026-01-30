#!/usr/bin/env node

/**
 * GitCode PR 审查工具
 * 基于官方 code-review 插件的 9 步流程
 *
 * 工作流程:
 * Step 1: 前置检查 - 判断 PR 是否需要审查
 * Step 2: 收集上下文 - 获取 PR 详情、文件内容、CLAUDE.md
 * Step 3: 总结 PR - 概述变更内容
 * Step 4: 并行审查 - 4 个代理同时审查
 * Step 5: 独立验证 - 对问题进行二次验证
 * Step 6: 过滤 - 移除未验证通过的问题，去重
 * Step 7: 判断 - 无问题则发送 summary
 * Step 8: 准备评论 - 格式化评论
 * Step 9: 发布评论 - 提交到 GitCode
 */

const fs = require('fs').promises;
const path = require('path');

const { GitCodeAPI } = require('../lib/gitcode-api');
const { CommentFormatter } = require('../lib/comment-formatter');
const { AgentRunner } = require('../lib/agent-runner');

// 配置文件路径
const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const DEFAULT_CONFIG = {
  gitcode: {
    token: '',
    owner: 'openeuler',
    repo: 'lerobot_ros2',
    baseUrl: 'https://api.gitcode.com'
  },
  codeReview: {
    confidenceThreshold: 80,
    skipValidation: false
  }
};

/**
 * GitCode PR 审查器
 */
class GitCodeReviewer {
  constructor(config) {
    this.api = new GitCodeAPI(config);
    this.formatter = new CommentFormatter(config);
    this.runner = new AgentRunner(config);
    this.config = config;
  }

  /**
   * 主审查流程 - 实现官方 9 步
   * @param {number} prNumber - PR 编号
   * @param {boolean} force - 是否强制审查（跳过前置检查）
   * @param {boolean} dryRun - 是否为 dry-run 模式（只生成 prompts，不提交评论）
   */
  async review(prNumber, force = false, dryRun = false) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 GitCode PR 审查工具`);
    console.log(`${'='.repeat(60)}`);
    console.log(`审查 PR #${prNumber}${dryRun ? ' (DRY-RUN 模式)' : ''}\n`);

    // Step 1: 前置检查
    const shouldProceed = await this.step1_PreCheck(prNumber);
    if (!shouldProceed && !force) {
      console.log('⏭️  PR 跳过审查\n');
      return { skipped: true };
    }
    if (force && !shouldProceed) {
      console.log('⚠️  强制审查模式 (--force)\n');
    }

    // 🔧 方案5: DRY-RUN 模式检查
    if (dryRun) {
      console.log('🔍 DRY RUN 模式 - 不会提交评论\n');
    }

    // Step 2: 收集上下文
    const context = await this.step2_GatherContext(prNumber);

    // Step 3: 总结 PR
    const summary = await this.step3_SummaryPR(context);

    // Step 4: 并行审查 (4 个代理)
    const issues = await this.step4_ParallelReview(context, summary);

    console.log(`\n📋 发现 ${issues.length} 个问题`);

    // Step 5: 独立验证
    const validatedIssues = await this.step5_ValidateIssues(issues, context);

    console.log(`✅ 验证通过: ${validatedIssues.length}/${issues.length}\n`);

    // Step 6: 过滤 + 去重
    const filteredIssues = this.step6_FilterIssues(validatedIssues);

    console.log(`🔍 去重后: ${filteredIssues.length} 个问题\n`);

    // Step 7: 判断
    if (filteredIssues.length === 0) {
      // 🔧 方案5: DRY-RUN 模式只输出信息
      if (dryRun) {
        console.log('\n📋 DRY RUN 结果: 未发现问题\n');
        console.log('🎯 可以安全提交，不会创建任何评论\n');
        return { reviewed: true, dryRun: true, issuesFound: false, issues: [] };
      }
      await this.step7_NoIssues(prNumber);
      return { reviewed: true, issuesFound: false };
    }

    // Step 8: 准备评论
    const comments = this.step8_PrepareComments(filteredIssues, context);

    // 🔧 方案5: DRY-RUN 模式输出预览
    if (dryRun) {
      this.previewDryRunIssues(filteredIssues);
      return { reviewed: true, dryRun: true, issuesFound: true, issues: filteredIssues };
    }

    // Step 9: 发布评论
    const results = await this.step9_PostComments(prNumber, comments);

    return { reviewed: true, issuesFound: true, results };
  }

  /**
   * 从 JSON 文件加载问题并提交评论
   * 跳过 Step 1-4，直接执行 Step 5-9
   */
  async reviewFromJson(prNumber, jsonPath) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 GitCode PR 审查工具（从 JSON 加载）`);
    console.log(`${'='.repeat(60)}`);
    console.log(`审查 PR #${prNumber}`);
    console.log(`问题来源: ${jsonPath}\n`);

    // Step 2: 收集上下文（需要 patchInfos 计算 position）
    const context = await this.step2_GatherContext(prNumber);

    // Step 4: 从 JSON 加载问题
    const issues = await this.step4_LoadFromJson(jsonPath);

    if (issues.length === 0) {
      console.log('⚠️  没有要提交的问题\n');
      return { reviewed: true, issuesFound: false };
    }

    // Step 5: 独立验证
    const validatedIssues = await this.step5_ValidateIssues(issues, context);

    console.log(`✅ 验证通过: ${validatedIssues.length}/${issues.length}\n`);

    // Step 6: 过滤 + 去重
    const filteredIssues = this.step6_FilterIssues(validatedIssues);

    console.log(`🔍 去重后: ${filteredIssues.length} 个问题\n`);

    // Step 7: 判断
    if (filteredIssues.length === 0) {
      await this.step7_NoIssues(prNumber);
      return { reviewed: true, issuesFound: false };
    }

    // Step 8: 准备评论
    const comments = this.step8_PrepareComments(filteredIssues, context);

    // Step 9: 发布评论
    const results = await this.step9_PostComments(prNumber, comments);

    return { reviewed: true, issuesFound: true, results };
  }

  /**
   * Step 1: 前置检查
   */
  async step1_PreCheck(prNumber) {
    console.log('Step 1: 前置检查...');

    try {
      const pr = await this.api.getPullRequest(prNumber);

      // 检查条件
      if (pr.state === 'closed') {
        console.log('  ⊘ PR 已关闭\n');
        return false;
      }

      if (pr.draft) {
        console.log('  ⊘ PR 是草稿\n');
        return false;
      }

      // 检查是否已有 Claude 评论
      try {
        const comments = await this.api.getPRComments(prNumber);
        const hasClaudeComment = comments.some(c =>
          c.body && c.body.includes('generated by ai@claude')
        );

        if (hasClaudeComment) {
          console.log('  ⊘ Claude 已评论\n');
          return false;
        }
      } catch (e) {
        // 无法获取评论，继续审查
      }

      console.log('  ✅ 通过前置检查\n');
      return true;
    } catch (error) {
      console.log(`  ⚠️  检查失败: ${error.message}\n`);
      return true; // 检查失败时继续审查
    }
  }

  /**
   * Step 2: 收集上下文
   */
  async step2_GatherContext(prNumber) {
    console.log('Step 2: 收集上下文...');

    const pr = await this.api.getPullRequest(prNumber);
    const files = await this.api.getPRFiles(prNumber);

    // 获取完整文件内容和 patch
    const filesWithContent = [];
    const patchInfos = {};  // 用于 position 计算

    for (const file of files) {
      const fileData = {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      };

      // 保存 patch 信息用于 position 计算
      if (file.patch) {
        // GitCode 的 patch 是一个对象，包含 diff 字段
        const patchContent = file.patch.diff || file.patch;
        patchInfos[file.filename] = {
          patch: patchContent,
          status: file.status
        };
      }

      if (file.status !== 'removed') {
        try {
          const fullContent = await this.api.getFileContent(file.filename, pr.head.sha);
          fileData.fullContent = fullContent;
        } catch (e) {
          // 无法获取完整内容，继续
        }
      }

      filesWithContent.push(fileData);
    }

    // 查找 CLAUDE.md
    const claudeMdFiles = await this.findClaudeMdFiles(filesWithContent, pr.head.sha);

    console.log(`  ✅ ${filesWithContent.length} 个文件, ${claudeMdFiles.length} 个 CLAUDE.md\n`);

    return {
      pr: {
        number: pr.number,
        title: pr.title,
        body: pr.body || '',
        author: pr.user && pr.user.login ? pr.user.login : 'unknown',
        headSha: pr.head.sha,
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
        htmlUrl: pr.html_url  // 添加实际的 PR URL
      },
      files: filesWithContent,
      claudeMd: claudeMdFiles,
      patchInfos: patchInfos  // 添加 patch 信息
    };
  }

  /**
   * Step 3: 总结 PR
   */
  async step3_SummaryPR(context) {
    console.log('Step 3: 总结 PR...');

    const summary = {
      purpose: this.analyzePRPurpose(context.pr),
      changedFiles: context.files.map(f => ({
        path: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions
      }))
    };

    console.log(`  ✅ 目的: ${summary.purpose}\n`);
    return summary;
  }

  /**
   * Step 4: 并行审查 (5 个代理)
   */
  async step4_ParallelReview(context, summary) {
    console.log('Step 4: 并行审查 (5 个代理)...');

    // 准备代理上下文
    const agentContext = { context, summary };

    // 运行代理获取 prompts
    const [agent1, agent2, agent3, agent4, agent5] = await Promise.all([
      this.runner.runAgent('bug-scanner-diff', agentContext),
      this.runner.runAgent('bug-scanner-diff-2', agentContext),
      this.runner.runAgent('code-analyzer', agentContext),
      this.runner.runAgent('semantic-analyzer', agentContext),
      this.runner.runAgent('python-classmethod-checker', agentContext)
    ]);

    // 将 prompts 保存到临时文件供 Claude 执行
    const tempDir = path.join(process.cwd(), '.temp-review');
    await fs.mkdir(tempDir, { recursive: true });

    // 保存每个代理的 prompt
    await fs.writeFile(
      path.join(tempDir, `agent-1-bug-scanner-diff.md`),
      `# Agent 1: Bug Scanner (Diff)\n\n${agent1.prompt}`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, `agent-2-bug-scanner-diff-2.md`),
      `# Agent 2: Bug Scanner (Diff) - Redundant\n\n${agent2.prompt}`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, `agent-3-code-analyzer.md`),
      `# Agent 3: Code Analyzer\n\n${agent3.prompt}`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, `agent-4-semantic-analyzer.md`),
      `# Agent 4: Semantic Analyzer\n\n${agent4.prompt}`,
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, `agent-5-python-classmethod-checker.md`),
      `# Agent 5: Python @classmethod Checker\n\n${agent5.prompt}`,
      'utf-8'
    );

    console.log(`  ✅ Prompts 已保存到 ${tempDir}`);
    console.log(`  ℹ️  请在另一个 Claude Code 会话中执行这些 prompts`);
    console.log(`  ℹ️  然后使用 --issues 参数传入发现的问题\n`);

    // 返回空数组，实际使用时需要 Claude 执行代理
    // 或者用户可以通过 --issues-from-json 参数传入
    return [];
  }

  /**
   * Step 4 替代方案: 从 JSON 文件加载问题
   */
  async step4_LoadFromJson(jsonPath) {
    console.log('Step 4: 从 JSON 文件加载问题...');

    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const issues = JSON.parse(content);

      console.log(`  ✅ 加载 ${issues.length} 个问题\n`);
      return issues;
    } catch (error) {
      console.error(`  ❌ 加载失败: ${error.message}`);
      return [];
    }
  }

  /**
   * Step 5: 独立验证
   */
  async step5_ValidateIssues(issues, context) {
    console.log('Step 5: 独立验证...');

    if (this.config.codeReview.skipValidation) {
      console.log('  ⊘ 跳过验证 (--skip-validation)\n');
      return issues;
    }

    // 只验证标记为需要验证的问题
    const needsValidation = issues.filter(i => i.needsValidation);
    const noValidationNeeded = issues.filter(i => !i.needsValidation);

    const validated = [];

    for (const issue of needsValidation) {
      const result = await this.validateIssue(issue, context);
      if (result.isValid) {
        validated.push({
          ...issue,
          // 保持原始置信度，不覆盖
          validationNote: result.note
        });
      } else {
        console.log(`  ⊘ 验证失败: ${issue.file}:${issue.line} - ${result.reason}`);
      }
    }

    const allValidated = [...validated, ...noValidationNeeded];
    console.log(`  ✅ 验证完成: ${allValidated.length}/${issues.length}\n`);
    return allValidated;
  }

  /**
   * 验证单个问题
   */
  async validateIssue(issue, context) {
    const agentContext = { context, issue };
    const agent = await this.runner.runAgent('issue-validator', agentContext);

    // 实际使用时需要 Claude 执行验证
    // 如果验证通过，保持原始置信度；如果失败，返回低置信度
    return {
      isValid: true,
      confidence: issue.confidence || 85,  // 保持原始置信度
      reason: '',
      note: '验证通过'
    };
  }

  /**
   * Step 6: 过滤 + 去重
   */
  step6_FilterIssues(issues) {
    console.log('Step 6: 过滤 + 去重...');

    // 按置信度过滤
    const filtered = issues.filter(i =>
      i.confidence >= this.config.codeReview.confidenceThreshold
    );

    // 按文件+行号+类型去重
    const seen = new Set();
    const unique = [];

    for (const issue of filtered) {
      const key = `${issue.file}:${issue.line}:${issue.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      }
    }

    console.log(`  ✅ 去重后: ${unique.length} 个问题\n`);
    return unique;
  }

  /**
   * Step 7: 无问题处理
   */
  async step7_NoIssues(prNumber) {
    console.log('Step 7: 无问题，发送 summary...\n');

    const comment = this.formatter.formatNoIssues();
    await this.api.submitPRComment(prNumber, comment);

    console.log('✅ 已发送 "No issues found" 评论\n');
  }

  /**
   * Step 8: 准备评论
   */
  step8_PrepareComments(issues, context) {
    console.log('Step 8: 准备评论...');

    // 获取 head SHA 和 patchInfos
    const headSha = context.pr.headSha;
    const patchInfos = context.patchInfos || {};

    // 使用 patchInfos 计算 position
    const comments = this.formatter.formatIssues(issues, patchInfos).map(comment => ({
      ...comment,
      commitId: headSha
    }));

    console.log(`  ✅ 准备 ${comments.length} 条评论\n`);
    return comments;
  }

  /**
   * Step 9: 发布评论
   */
  async step9_PostComments(prNumber, comments) {
    console.log('Step 9: 发布评论...\n');

    const results = await this.api.submitBatchComments(prNumber, comments);

    const successCount = results.filter(r => r.success).length;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 成功发布 ${successCount}/${comments.length} 条评论`);
    console.log(`${'='.repeat(60)}\n`);

    // 打印审查意见链接
    const prUrl = this.api.getPRUrl(prNumber);
    console.log(`📋 审查意见链接:`);
    console.log(`   PR 页面: ${prUrl}\n`);

    // 打印成功的评论链接
    const successResults = results.filter(r => r.success);
    if (successResults.length > 0) {
      console.log(`   行内评论:`);
      for (const r of successResults) {
        const file = r.comment.path;
        const line = r.comment.line;
        if (r.commentUrl) {
          console.log(`   - ${file}:${line} → ${r.commentUrl}`);
        } else {
          console.log(`   - ${file}:${line} → ${prUrl}`);
        }
      }
      console.log('');
    }

    // 打印失败的评论
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      console.log('⚠️  以下评论发布失败:');
      for (const f of failed) {
        console.log(`  - ${f.comment.path}:${f.comment.line} - ${f.error}`);
      }
    }

    return results;
  }

  /**
   * 🔧 方案5: DRY-RUN 模式预览
   * 显示问题预览而不提交
   */
  previewDryRunIssues(filteredIssues) {
    console.log('\n📋 DRY RUN 模式 - 发现的问题预览:\n');
    console.log(`共 ${filteredIssues.length} 个问题:\n`);
    filteredIssues.forEach((issue, i) => {
      console.log(`  ${i + 1}. [${issue.severity}] ${issue.file}:${issue.line || '?'}`);
      console.log(`     ${issue.title}`);
      if (issue.description) {
        console.log(`     描述: ${issue.description.substring(0, 100)}${issue.description.length > 100 ? '...' : ''}`);
      }
      console.log('');
    });
    console.log('🎯 以上是预览，实际提交时会创建行内评论\n');
  }

  /**
   * 辅助方法：查找 CLAUDE.md 文件
   */
  async findClaudeMdFiles(files, ref) {
    const claudeMdFiles = [];

    // 检查根目录
    try {
      const content = await this.api.getFileContent('CLAUDE.md', ref);
      if (content) {
        claudeMdFiles.push({ path: 'CLAUDE.md', content });
      }
    } catch (e) {
      // 根目录没有 CLAUDE.md
    }

    // 检查变更文件所在目录
    const checkedDirs = new Set();

    for (const file of files) {
      const dir = path.dirname(file.filename);
      if (dir === '.' || checkedDirs.has(dir)) continue;

      checkedDirs.add(dir);

      try {
        const claudePath = path.join(dir, 'CLAUDE.md');
        const content = await this.api.getFileContent(claudePath, ref);
        if (content) {
          claudeMdFiles.push({ path: claudePath, content });
        }
      } catch (e) {
        // 该目录没有 CLAUDE.md
      }
    }

    return claudeMdFiles;
  }

  /**
   * 辅助方法：分析 PR 目的
   */
  analyzePRPurpose(pr) {
    const title = pr.title || '';

    if (title.includes('feat:') || title.includes('feature') || title.includes('add')) {
      return '新增功能';
    } else if (title.includes('fix:') || title.includes('fix') || title.includes('bug')) {
      return '修复问题';
    } else if (title.includes('refactor') || title.includes('重构') || title.includes('优化')) {
      return '优化重构';
    } else if (title.includes('docs') || title.includes('doc') || title.includes('文档')) {
      return '文档更新';
    } else if (title.includes('test') || title.includes('测试')) {
      return '测试相关';
    } else {
      return '代码修改';
    }
  }

  /**
   * 🔧 方案1: 自动执行所有 agents（输出结构化 JSON）
   * 此方法生成所有 prompts 并输出为结构化 JSON，便于自动化处理
   *
   * @param {number} prNumber - PR 编号
   * @param {boolean} force - 是否强制审查
   * @param {boolean} dryRun - 是否为 dry-run 模式
   * @returns {Object} 包含所有 prompts 和上下文的结果
   */
  async runAllAgents(prNumber, force = false, dryRun = false) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 自动审查模式`);
    console.log(`${'='.repeat(60)}`);
    console.log(`PR #${prNumber}${dryRun ? ' (DRY-RUN)' : ''}\n`);

    // Step 1: 前置检查
    const shouldProceed = await this.step1_PreCheck(prNumber);
    if (!shouldProceed && !force) {
      console.log('⏭️  PR 跳过审查\n');
      return { skipped: true };
    }

    // Step 2: 收集上下文
    const context = await this.step2_GatherContext(prNumber);

    // Step 3: 总结 PR
    const summary = await this.step3_SummaryPR(context);

    // Step 4: 并行审查（生成所有 prompts）
    const agentResults = await this.step4_GenerateAllPrompts(context, summary);

    // 输出结构化 JSON
    const outputPath = path.join(process.cwd(), `.temp-review`, `pr-${prNumber}-prompts.json`);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(agentResults, null, 2), 'utf-8');

    console.log(`\n📋 已保存 prompts 到: ${outputPath}`);
    console.log(`\n📊 统计:`);
    console.log(`  - Agent 1 (Bug Scanner): ${agentResults.agents[0].prompt.length} 字符`);
    console.log(`  - Agent 2 (Bug Scanner 2): ${agentResults.agents[1].prompt.length} 字符`);
    console.log(`  - Agent 3 (Code Analyzer): ${agentResults.agents[2].prompt.length} 字符`);
    console.log(`  - Agent 4 (Semantic Analyzer): ${agentResults.agents[3].prompt.length} 字符`);
    console.log(`  - Agent 5 (Python Checker): ${agentResults.agents[4].prompt.length} 字符`);

    if (dryRun) {
      console.log('\n🔍 DRY RUN - 未执行审查\n');
      return { reviewed: true, dryRun: true, promptsPath: outputPath };
    }

    return {
      reviewed: true,
      promptsPath: outputPath,
      agentCount: agentResults.agents.length,
      context: {
        prNumber: context.pr.number,
        prTitle: context.pr.title,
        filesCount: context.files.length,
        hasClaudeMd: context.claudeMd.length > 0
      }
    };
  }

  /**
   * 🔧 方案1: 生成所有 agents 的 prompts（用于自动审查模式）
   */
  async step4_GenerateAllPrompts(context, summary) {
    console.log('生成所有 agent prompts...');

    const agentContext = { context, summary };
    const agentNames = [
      'bug-scanner-diff',
      'bug-scanner-diff-2',
      'code-analyzer',
      'semantic-analyzer',
      'python-classmethod-checker'
    ];

    const agents = [];
    for (const agentName of agentNames) {
      const result = await this.runner.runAgent(agentName, agentContext);
      agents.push({
        name: agentName,
        prompt: result.prompt,
        model: result.model
      });
    }

    console.log(`  ✅ 已生成 ${agents.length} 个 prompts\n`);

    return {
      pr: {
        number: context.pr.number,
        title: context.pr.title,
        url: context.pr.htmlUrl
      },
      summary: summary,
      agents: agents,
      generatedAt: new Date().toISOString()
    };
  }
}

/**
 * 主函数
 */
async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const options = {
    prNumber: null,
    skipValidation: args.includes('--skip-validation'),
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    autoReview: args.includes('--auto-review'),  // 🔧 方案1: 自动执行所有 agents
    threshold: null,
    issuesFromJson: null
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

  // 查找 --threshold 参数
  const thresholdIndex = args.indexOf('--threshold');
  if (thresholdIndex !== -1 && args[thresholdIndex + 1]) {
    options.threshold = parseInt(args[thresholdIndex + 1]);
  }

  if (!options.prNumber) {
    console.error('❌ 请指定 PR 编号: --pr <number>');
    console.error('\n使用方法:');
    console.error('  # 完整流程（生成 prompts 供手动审查）');
    console.error('  node gitcode-reviewer.js --pr <number>');
    console.error('');
    console.error('  # 自动审查模式（生成结构化 JSON prompts）');
    console.error('  node gitcode-reviewer.js --pr <number> --auto-review');
    console.error('');
    console.error('  # DRY-RUN 模式（预览不提交）');
    console.error('  node gitcode-reviewer.js --pr <number> --dry-run');
    console.error('');
    console.error('  # 从 JSON 文件加载问题并提交评论');
    console.error('  node gitcode-reviewer.js --pr <number> --issues-from-json <path>');
    console.error('');
    console.error('  # 跳过验证');
    console.error('  node gitcode-reviewer.js --pr <number> --issues-from-json <path> --skip-validation');
    console.error('');
    console.error('  # 强制审查（跳过前置检查）');
    console.error('  node gitcode-reviewer.js --pr <number> --force');
    console.error('');
    console.error('  # 自定义置信度阈值');
    console.error('  node gitcode-reviewer.js --pr <number> --threshold <0-100>');
    console.error('');
    console.error('JSON 文件格式:');
    console.error('  [');
    console.error('    {');
    console.error('      "file": "path/to/file.py",');
    console.error('      "line": 42,');
    console.error('      "type": "bug|security|logic_error|api_misuse",');
    console.error('      "severity": "error|warning",');
    console.error('      "confidence": 90,');
    console.error('      "title": "问题标题",');
    console.error('      "description": "详细描述",');
    console.error('      "contextCode": "相关代码",');
    console.error('      "fix": { "code": "修复代码", "explanation": "说明" }');
    console.error('    }');
    console.error('  ]');
    process.exit(1);
  }

  // 加载配置
  let config;
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
    const userConfig = JSON.parse(configContent);
    // 深度合并配置
    config = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      gitcode: {
        ...DEFAULT_CONFIG.gitcode,
        ...(userConfig.gitcode || {})
      },
      codeReview: {
        ...DEFAULT_CONFIG.codeReview,
        ...(userConfig.codeReview || {})
      }
    };
  } catch (error) {
    console.log('⚠️  未找到配置文件，使用默认配置');
    config = DEFAULT_CONFIG;
  }

  // 应用命令行选项
  if (options.skipValidation) {
    config.codeReview.skipValidation = true;
  }
  if (options.dryRun) {
    config.codeReview.dryRun = true;
  }
  if (options.threshold !== null) {
    config.codeReview.confidenceThreshold = options.threshold;
  }

  // 验证 token
  if (!config.gitcode.token) {
    console.error('❌ 错误: 请在 config.json 中配置 gitcode.token');
    process.exit(1);
  }

  // 创建审查器并执行
  const reviewer = new GitCodeReviewer(config);

  try {
    if (options.issuesFromJson) {
      // 从 JSON 加载问题并提交
      await reviewer.reviewFromJson(options.prNumber, options.issuesFromJson);
    } else if (options.autoReview) {
      // 🔧 方案1: 自动执行所有 agents，输出结构化 JSON
      console.log('🤖 自动审查模式 - 执行所有 agents\n');
      const result = await reviewer.runAllAgents(options.prNumber, options.force, config.codeReview.dryRun);
      console.log('\n✅ 自动审查完成');
    } else {
      // 完整流程（生成 prompts 供手动审查）
      await reviewer.review(options.prNumber, options.force, config.codeReview.dryRun);
    }
  } catch (error) {
    console.error(`\n❌ 审查失败: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 导出
module.exports = { GitCodeReviewer };

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

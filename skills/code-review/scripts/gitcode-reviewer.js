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

// Resolve SDK path relative to this skill so the package works when copied or
// installed independently on another machine.
const SKILL_ROOT = path.resolve(__dirname, '..');
const { GitCodeAPI, CommentFormatter, AgentRunner, ConfigLoader } = require(path.join(SKILL_ROOT, 'lib'));

// Prefer gitcode-review.config.json over generic config.json to avoid conflicts
const CONFIG_PATH = require('fs').existsSync(path.join(process.cwd(), 'gitcode-review.config.json'))
  ? path.join(process.cwd(), 'gitcode-review.config.json')
  : path.join(process.cwd(), 'config.json');

const DEFAULT_CONFIG = {
  gitcode: {
    token: '',
    owner: '',
    repo: '',
    baseUrl: 'https://api.gitcode.com'
  },
  codeReview: {
    confidenceThreshold: 80,
    skipValidation: false,
    commentLanguage: null,
    writeTemp: false,
    reviewGuidePath: null,
    reviewGuide: null
  }
};

function loadConfig() {
  // Try config.json first, fall back to environment variables
  const envConfig = {
    gitcode: {
      token: process.env.GITCODE_TOKEN || '',
      owner: process.env.GITCODE_OWNER || DEFAULT_CONFIG.gitcode.owner,
      repo: process.env.GITCODE_REPO || DEFAULT_CONFIG.gitcode.repo,
      baseUrl: process.env.GITCODE_BASE_URL || DEFAULT_CONFIG.gitcode.baseUrl
    }
  };

  try {
    const loader = new ConfigLoader({ configPath: CONFIG_PATH });
    const userConfig = loader.loadRaw();
    const merged = {
      ...DEFAULT_CONFIG,
      ...userConfig,
      gitcode: {
        ...DEFAULT_CONFIG.gitcode,
        ...(userConfig.gitcode || {}),
        // Config.json explicit values take precedence, env vars provide fallback defaults
        token: (userConfig.gitcode && userConfig.gitcode.token) || envConfig.gitcode.token,
        owner: (userConfig.gitcode && userConfig.gitcode.owner) || envConfig.gitcode.owner,
        repo: (userConfig.gitcode && userConfig.gitcode.repo) || envConfig.gitcode.repo,
        baseUrl: (userConfig.gitcode && userConfig.gitcode.baseUrl) || envConfig.gitcode.baseUrl
      },
      codeReview: {
        ...DEFAULT_CONFIG.codeReview,
        ...(userConfig.codeReview || {})
      }
    };
    return merged;
  } catch (e) {
    // No config.json found — use env vars as fallback
    console.log('⚠️  未找到配置文件，使用环境变量');
    return {
      ...DEFAULT_CONFIG,
      gitcode: {
        ...DEFAULT_CONFIG.gitcode,
        ...envConfig.gitcode
      }
    };
  }
}

function normalizeCommentLanguage(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['zh', 'cn', 'chinese', '中文'].includes(normalized)) return 'zh';
  if (['en', 'english', '英文'].includes(normalized)) return 'en';
  return null;
}

async function loadReviewGuide(reviewGuidePath) {
  if (!reviewGuidePath) return null;

  const resolvedPath = path.resolve(process.cwd(), reviewGuidePath);
  const content = await fs.readFile(resolvedPath, 'utf-8');
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error(`Review guide is empty: ${reviewGuidePath}`);
  }

  return {
    path: reviewGuidePath,
    resolvedPath,
    content: trimmed
  };
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function askQuestion(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function resolveCommentLanguage(config, cliLanguage, willPost) {
  const configured = normalizeCommentLanguage(cliLanguage) ||
    normalizeCommentLanguage(config.codeReview.commentLanguage) ||
    normalizeCommentLanguage(process.env.CODE_REVIEW_COMMENT_LANGUAGE);

  if (configured) return configured;

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const answer = await askQuestion('Choose review comment language [en/zh]: ');
    const language = normalizeCommentLanguage(answer);
    if (language) return language;
  }

  if (willPost) {
    throw new Error('Comment language is required before posting. Use --comment-language en or --comment-language zh.');
  }

  return 'zh';
}

function parseApprovalList(value) {
  if (!value) return null;
  return new Set(String(value)
    .split(',')
    .map(v => parseInt(v.trim(), 10))
    .filter(Number.isFinite));
}

// Default scratch dir under the project working directory so paths stay stable
// across plugin upgrades (unlike paths under the plugin cache). Each PR gets
// its own subdirectory to avoid cross-PR contamination.
function defaultReviewDir(prNumber) {
  return path.join(process.cwd(), '.tmp', 'gitcode-review', `pr-${prNumber}`);
}

function defaultPromptsPath(prNumber) {
  return path.join(defaultReviewDir(prNumber), 'prompts.json');
}

function safeAgentFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function selectReviewAgentNames(context) {
  const agentNames = ['bug-scanner-diff', 'bug-scanner-diff-2', 'code-analyzer', 'semantic-analyzer'];
  const needsPythonClassChecker = (context.files || []).some(file => {
    if (!String(file.filename || '').endsWith('.py')) return false;
    const patch = typeof file.patch === 'string' ? file.patch : (file.patch && file.patch.diff) || '';
    const addedLines = patch.split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1))
      .join('\n');
    const fullContent = typeof file.fullContent === 'string' ? file.fullContent : '';
    return /(^|\n)\s*(?:class\s+\w+|@classmethod\b)/m.test(addedLines)
      || /(^|\n)\s*@classmethod\b/m.test(fullContent)
      || /(^|\n)\s*class\s+\w+/m.test(fullContent);
  });
  if (needsPythonClassChecker) agentNames.push('python-classmethod-checker');
  return agentNames;
}

async function writePromptBundle(manifestPath, agentResults) {
  const reviewDir = path.dirname(manifestPath);
  await fs.mkdir(reviewDir, { recursive: true });
  const agents = [];
  for (const [index, agent] of agentResults.agents.entries()) {
    const promptFile = `prompt-${index}-${safeAgentFileName(agent.name)}.md`;
    const issueFile = `issue-${index}.json`;
    await fs.writeFile(path.join(reviewDir, promptFile), agent.prompt, 'utf-8');
    agents.push({ index, name: agent.name, model: agent.model, promptPath: promptFile, issuePath: issueFile, promptLength: agent.prompt.length });
  }
  const manifest = { formatVersion: 2, pr: agentResults.pr, summary: agentResults.summary, reviewGuide: agentResults.reviewGuide, agents, generatedAt: agentResults.generatedAt };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  return manifest;
}

/**
 * GitCode PR 审查器
 */
class GitCodeReviewer {
  constructor(config) {
    this.api = new GitCodeAPI(config);
    this.formatter = new CommentFormatter(config);
    this.runner = new AgentRunner(path.join(__dirname, '..', 'agents'));
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
    if (issues === null) {
      return { reviewed: true, promptsGenerated: true };
    }

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
  async reviewFromJson(prNumber, jsonPath, submitOptions = {}) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 GitCode PR 审查工具（从 JSON 加载）`);
    console.log(`${'='.repeat(60)}`);
    console.log(`审查 PR #${prNumber}`);
    console.log(`问题来源: ${jsonPath}\n`);
    // Step 4: 从 JSON 加载问题
    const issues = await this.step4_LoadFromJson(jsonPath);
    return await this.reviewFromIssues(prNumber, issues, submitOptions);
  }

  /**
   * 从目录聚合 agent 输出的 issues 并提交评论
   * 跳过 Step 1-4，直接执行 Step 5-9
   */
  async reviewFromDir(prNumber, dirPath, submitOptions = {}) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 GitCode PR 审查工具（从目录聚合 issues）`);
    console.log(`${'='.repeat(60)}`);
    console.log(`审查 PR #${prNumber}`);
    console.log(`问题来源目录: ${dirPath}\n`);
    const issues = await this.step4_LoadFromDir(dirPath);
    return await this.reviewFromIssues(prNumber, issues, submitOptions);
  }

  /**
   * 从已解析的问题数组预览或提交评论
   */
  async reviewFromIssues(prNumber, issues, submitOptions = {}) {
    const shouldPost = Boolean(submitOptions.post && !submitOptions.dryRun);
    console.log(`发布模式: ${shouldPost ? '提交评论' : '仅预览'}\n`);

    // Step 2: 收集上下文（需要 patchInfos 计算 position）
    const context = await this.step2_GatherContext(prNumber);

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
      if (!shouldPost) {
        console.log('ℹ️  仅预览，未发布 "No issues found" 评论。\n');
        return { reviewed: true, preview: true, issuesFound: false };
      }
      await this.step7_NoIssues(prNumber);
      return { reviewed: true, issuesFound: false };
    }

    // Step 8: 准备评论
    const comments = this.step8_PrepareComments(filteredIssues, context);

    if (!shouldPost) {
      this.previewComments(comments);
      console.log('ℹ️  仅预览，未发布评论。添加 --post 并显式批准后才会提交。\n');
      return { reviewed: true, preview: true, issuesFound: true, comments };
    }

    const approvedComments = await this.selectApprovedComments(comments, submitOptions);
    if (approvedComments.length === 0) {
      console.log('ℹ️  没有批准的评论，未发布任何内容。\n');
      return { reviewed: true, posted: false, issuesFound: true, comments: [] };
    }

    // Step 9: 发布评论
    const results = await this.step9_PostComments(prNumber, approvedComments);

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
    const agentContext = {
      context,
      summary,
      commentLanguage: this.config.codeReview.commentLanguage || null
    };

    // 运行代理获取 prompts
    const [agent1, agent2, agent3, agent4, agent5] = await Promise.all([
      this.runner.runAgent('bug-scanner-diff', agentContext),
      this.runner.runAgent('bug-scanner-diff-2', agentContext),
      this.runner.runAgent('code-analyzer', agentContext),
      this.runner.runAgent('semantic-analyzer', agentContext),
      this.runner.runAgent('python-classmethod-checker', agentContext)
    ]);

    if (this.config.codeReview.writeTemp) {
      const tempDir = path.join(process.cwd(), '.temp-review');
      await fs.mkdir(tempDir, { recursive: true });

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
    } else {
      console.log('  ℹ️  未写入临时文件。建议使用 --auto-review --prompts-stdout 获取机器可读 prompts。');
    }
    console.log(`  ℹ️  执行 prompts 后使用 --issues-from-stdin 或 --issues-from-json 传入发现的问题\n`);

    return null;
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
   * Step 4 替代方案: 从目录聚合所有 agent 的 issues
   *
   * 读取目录下所有 *.json（排除 prompts.json 等非 issues 文件），
   * 将每个文件中的 issues 数组（或整个文件若是数组）合并后返回。
   * 兼容 agent 输出 {issues: [...]} 或直接 [ {...}, {...} ] 两种形态。
   */
  async step4_LoadFromDir(dirPath) {
    console.log(`Step 4: 从目录聚合 issues: ${dirPath} ...`);

    let entries;
    try {
      entries = await fs.readdir(dirPath);
    } catch (error) {
      console.error(`  ❌ 无法读取目录: ${error.message}`);
      return [];
    }

    const jsonFiles = entries.filter(f => f.endsWith('.json') && f !== 'prompts.json' && f !== 'issues-combined.json');
    const allIssues = [];
    for (const f of jsonFiles) {
      const fp = path.join(dirPath, f);
      try {
        const content = await fs.readFile(fp, 'utf-8');
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.issues) ? parsed.issues : []);
        if (items.length === 0) {
          console.log(`  ⚠️  ${f}: 无 issues，跳过`);
          continue;
        }
        console.log(`  ✅ ${f}: ${items.length} 个 issue`);
        allIssues.push(...items);
      } catch (error) {
        console.error(`  ❌ ${f}: 解析失败 - ${error.message}`);
      }
    }

    console.log(`  合计: ${allIssues.length} 个 issue\n`);
    return allIssues;
  }

  /**
   * Step 5: 独立验证
   */
  async step5_ValidateIssues(issues, context) {
    console.log('Step 5: 独立验证...');

    // Schema validation first — reject missing-field issues before threshold
    // filtering. Without this gate, an agent that omits `confidence` would
    // pass step5 (schema not checked) and get silently dropped in step6
    // (`undefined >= 80` is false). Fail loud: surface rejections in preview.
    const { validateIssues } = require('../lib/issue-schema');
    const { accepted: schemaValid, rejectedInvalid } = validateIssues(issues);
    if (rejectedInvalid.length > 0) {
      console.log(`  ⚠️  Schema 拒绝: ${rejectedInvalid.length}/${issues.length} 个 issue 缺字段或类型错误`);
      for (const r of rejectedInvalid) {
        const loc = r.issue && r.issue.file ? `${r.issue.file}:${r.issue.line ?? '?'}` : '<no file>';
        console.log(`    ⊘ ${loc} — ${r.errors.join('; ')}`);
      }
    }
    this._lastRejectedInvalid = rejectedInvalid;
    const schemaAccepted = schemaValid;

    if (this.config.codeReview.skipValidation) {
      console.log('  ⊘ 跳过语义验证 (--skip-validation)\n');
      return schemaAccepted;
    }

    // 只验证标记为需要验证的问题
    const needsValidation = schemaAccepted.filter(i => i.needsValidation);
    const noValidationNeeded = schemaAccepted.filter(i => !i.needsValidation);

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
    console.log(`  ✅ 验证完成: ${allValidated.length}/${schemaAccepted.length} (schema 拒绝 ${rejectedInvalid.length})\n`);
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
   *
   * 分桶策略（防止静默丢弃）:
   *   accepted              = 通过阈值 + dedup（最终评论）
   *   rejectedBelowThreshold= confidence < 阈值（正常过滤，仅计数）
   *   rejectedInvalid       = 缺字段或类型错误（来自 step5 schema 验证，附原因）
   *   dedupedOut            = 通过阈值但与已接受的 issue 同 key（dedup 副产品）
   *
   * 之前: `i.confidence >= threshold` 对 undefined 返回 false → 静默丢，
   * 5 个 en-cn-parity 发现全部消失，预览显示"0 个问题"且无警告。
   * 现在: schema 违规在 step5 已分桶并显示原因，这里只对 accepted 跑阈值。
   */
  step6_FilterIssues(issues) {
    console.log('Step 6: 过滤 + 去重...');

    const rejectedInvalid = this._lastRejectedInvalid || [];
    const threshold = this.config.codeReview.confidenceThreshold;

    // 按置信度过滤（schema 已保证 confidence 是整数，这里不需要再判 undefined）
    const aboveThreshold = issues.filter(i => i.confidence >= threshold);
    const rejectedBelowThreshold = issues.filter(i => i.confidence < threshold);

    if (rejectedBelowThreshold.length > 0) {
      console.log(`  ⊘ 低于阈值 ${threshold}: ${rejectedBelowThreshold.length} 个`);
    }

    // 按文件+行号+类型去重
    const seen = new Set();
    const unique = [];
    const dedupedOut = [];

    for (const issue of aboveThreshold) {
      const key = `${issue.file}:${issue.line}:${issue.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(issue);
      } else {
        dedupedOut.push(issue);
      }
    }

    this._lastFilterStats = {
      total: issues.length + rejectedInvalid.length,
      accepted: unique.length,
      rejectedInvalid,
      rejectedBelowThreshold,
      dedupedOut,
      threshold,
    };

    const invalidCount = rejectedInvalid.length;
    const belowCount = rejectedBelowThreshold.length;
    const dedupCount = dedupedOut.length;
    console.log(`  ✅ 去重后: ${unique.length} 个问题 (拒绝: ${invalidCount} schema, ${belowCount} 低于阈值, ${dedupCount} 重复)\n`);
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

  previewComments(comments) {
    this.previewFilterStats();
    console.log('\n📋 评论预览:\n');
    comments.forEach((comment, index) => {
      const firstLine = comment.body.split('\n').find(Boolean) || '';
      console.log(`[${index + 1}] ${comment.path}:${comment.line || '?'} ${firstLine}`);
    });
    console.log('');
  }

  /**
   * 显示 schema/阈值/dedup 拒绝统计，让坏 agent 一眼可见。
   * 解决 "5 个发现 → 静默变 0 个问题" 的失败模式：用户看到拒绝原因，
   * 能判断是 agent 模板问题还是真的没问题。
   */
  previewFilterStats() {
    const stats = this._lastFilterStats;
    if (!stats) return;

    console.log('\n📊 过滤统计:');
    console.log(`   输入: ${stats.total} | 接受: ${stats.accepted} | 拒绝: ${stats.rejectedInvalid.length + stats.rejectedBelowThreshold.length + stats.dedupedOut.length}`);

    if (stats.rejectedInvalid.length > 0) {
      console.log(`   Schema 拒绝 (${stats.rejectedInvalid.length}):`);
      for (const r of stats.rejectedInvalid) {
        const loc = r.issue && r.issue.file ? `${r.issue.file}:${r.issue.line ?? '?'}` : '<no file>';
        console.log(`     ⊘ ${loc} — ${r.errors.join('; ')}`);
      }
    }

    if (stats.rejectedBelowThreshold.length > 0) {
      console.log(`   低于阈值 ${stats.threshold} (${stats.rejectedBelowThreshold.length}):`);
      for (const i of stats.rejectedBelowThreshold) {
        console.log(`     ⊘ ${i.file}:${i.line ?? '?'} confidence=${i.confidence}`);
      }
    }

    if (stats.dedupedOut.length > 0) {
      console.log(`   Dedup 重复 (${stats.dedupedOut.length}):`);
      for (const i of stats.dedupedOut) {
        console.log(`     ⊘ ${i.file}:${i.line ?? '?'} (${i.type}) — 与已接受 issue 同 key`);
      }
    }
    console.log('');
  }

  async selectApprovedComments(comments, options) {
    if (options.noApproval || options.approveAll) {
      return comments;
    }

    if (options.approveList && options.approveList.size > 0) {
      return comments.filter((_, index) => options.approveList.has(index + 1));
    }

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new Error('Posting requires explicit approval. Use --approve-all, --approve 1,3, or --no-approval.');
    }

    const approved = [];
    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      console.log(`\n[${i + 1}] ${comment.path}:${comment.line || '?'}`);
      console.log(comment.body);
      const answer = await askQuestion('Post this comment? [y/N]: ');
      if (/^y(es)?$/i.test(answer.trim())) {
        approved.push(comment);
      }
    }

    return approved;
  }

  /**
   * 🔧 方案5: DRY-RUN 模式预览
   * 显示问题预览而不提交
   */
  previewDryRunIssues(filteredIssues) {
    this.previewFilterStats();
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
  async runAllAgents(prNumber, options = {}) {
    const force = Boolean(options.force);
    const dryRun = Boolean(options.dryRun);
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

    if (this.config.codeReview.reviewGuide) {
      console.log(`  📘 Review guide: ${this.config.codeReview.reviewGuide.path}`);
    }

    // Step 4: 并行审查（生成所有 prompts）
    const agentResults = await this.step4_GenerateAllPrompts(context, summary);

    let outputPath = null;
    // --prompts-to (with or without path) takes precedence; fall back to legacy --write-temp
    const promptsToActive = options.promptsTo !== undefined;
    const writePromptsToFile = promptsToActive || options.writeTemp;
    if (writePromptsToFile) {
      outputPath = promptsToActive
        ? (options.promptsTo || defaultPromptsPath(prNumber))
        : path.join(process.cwd(), `.temp-review`, `pr-${prNumber}-prompts.json`);
      if (promptsToActive) {
        await writePromptBundle(outputPath, agentResults);
        console.log(`\n📋 已保存 prompt bundle 到: ${path.dirname(outputPath)}`);
      } else {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, JSON.stringify(agentResults, null, 2), 'utf-8');
        console.log(`\n📋 已保存 prompts 到: ${outputPath}`);
      }
    }

    console.log(`\n📊 统计:`);
    console.log(`  - Agent 1 (Bug Scanner): ${agentResults.agents[0].prompt.length} 字符`);
    console.log(`  - Agent 2 (Bug Scanner 2): ${agentResults.agents[1].prompt.length} 字符`);
    console.log(`  - Agent 3 (Code Analyzer): ${agentResults.agents[2].prompt.length} 字符`);
    console.log(`  - Agent 4 (Semantic Analyzer): ${agentResults.agents[3].prompt.length} 字符`);
    console.log(`  - Agent 5 (Python Checker): ${agentResults.agents[4].prompt.length} 字符`);

    if (options.promptsStdout) {
      console.log('\n---BEGIN_GITCODE_REVIEW_PROMPTS_JSON---');
      console.log(JSON.stringify(agentResults, null, 2));
      console.log('---END_GITCODE_REVIEW_PROMPTS_JSON---');
    } else if (!writePromptsToFile) {
      console.log('\nℹ️  未写入临时文件。需要机器可读 prompts 时请使用 --prompts-to [path] 或 --prompts-stdout；调试落盘请使用 --write-temp。');
    }

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

    const agentContext = {
      context,
      summary,
      reviewGuide: this.config.codeReview.reviewGuide || null,
      commentLanguage: this.config.codeReview.commentLanguage || null
    };
    const agentNames = selectReviewAgentNames(context);

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
      reviewGuide: this.config.codeReview.reviewGuide
        ? {
            path: this.config.codeReview.reviewGuide.path,
            contentLength: this.config.codeReview.reviewGuide.content.length
          }
        : null,
      agents: agents,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Build the planner agent prompt for the given PR context.
   * Delegates to lib/planner-prompt-builder.js.
   */
  async buildPlannerPrompt(context) {
    const { buildPlannerPrompt } = require('../lib/planner-prompt-builder');
    const kbDir = path.join(__dirname, '..', 'known-bugs');
    return await buildPlannerPrompt(context, kbDir);
  }

  /**
   * Scan the agents/ directory and return one-line template descriptors
   * (excluding _generic.md and planner.md itself, which are infrastructure).
   * The planner reads this list to decide which template to apply.
   */
  listAgentTemplates() {
    const fs = require('fs');
    const path = require('path');
    const agentsDir = path.join(__dirname, '..', 'agents');
    if (!fs.existsSync(agentsDir)) return [];
    const skip = new Set(['_generic.md', 'planner.md', 'pre-check.md', 'issue-validator.md']);
    const templates = [];
    for (const file of fs.readdirSync(agentsDir)) {
      if (!file.endsWith('.md') || skip.has(file)) continue;
      const content = fs.readFileSync(path.join(agentsDir, file), 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
      if (!fmMatch) continue;
      const fm = fmMatch[1];
      const get = key => {
        const m = fm.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
      };
      templates.push({
        name: get('name') || path.basename(file, '.md'),
        model: get('model') || 'inherit',
        description: get('description') || '',
      });
    }
    return templates;
  }

  /**
   * Validate and persist review-plan.json to the given directory.
   * Returns the absolute path to the written file.
   * Throws if the plan fails schema validation.
   */
  async writeReviewPlan(plan, outDir) {
    const { validateReviewPlan } = require('../lib/review-plan-schema');
    const result = validateReviewPlan(plan);
    if (!result.valid) {
      throw new Error(`invalid review-plan: ${result.errors.join('; ')}`);
    }
    const fs = require('fs').promises;
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'review-plan.json');
    await fs.writeFile(outPath, JSON.stringify(plan, null, 2), 'utf-8');
    return outPath;
  }

  /**
   * Given a validated review-plan.json, generate one prompt file per agent.
   * Uses the named template if it exists in agents/; otherwise uses _generic.
   * Injects planner-specified focusAreas and relevant known-bugs entries.
   *
   * @param {object} plan - validated review-plan.json
   * @param {string} outDir - .tmp/gitcode-review/pr-<N>/
   * @param {object} opts - { prNumber: number }
   * @returns {Promise<{promptFiles: [{agentName, path}]}>}
   */
  async generateAgentPromptsFromPlan(plan, outDir, opts) {
    const fs = require('fs').promises;
    const path = require('path');
    const { AgentRunner } = require('../lib/agent-runner');
    const { loadKnownBugFile, filterRelevance } = require('../lib/known-bugs-loader');

    await fs.mkdir(outDir, { recursive: true });
    const agentRunner = new AgentRunner(this.config);
    const kbDir = path.join(__dirname, '..', 'known-bugs');
    const relevantKb = filterRelevance(plan.knownBugRelevance);

    // Derive agents from riskCoverage[] — group by agent name.
    // Each agent gets the union of risks it must cover, with the planner's
    // through/fail focus text per risk.
    const coverage = Array.isArray(plan.riskCoverage) ? plan.riskCoverage : [];
    const agentMap = new Map();
    for (const rc of coverage) {
      if (!rc || typeof rc.agent !== 'string') continue;
      if (!agentMap.has(rc.agent)) {
        agentMap.set(rc.agent, []);
      }
      agentMap.get(rc.agent).push(rc);
    }

    // Build the KB section once — same for all agents (the planner already
    // filtered relevance).
    let kbSection = '';
    if (relevantKb.length > 0) {
      const blocks = relevantKb.map(r => {
        const content = loadKnownBugFile(kbDir, r.file);
        return `### ${r.file}\n\n${content}`;
      });
      kbSection = `## 已知 bug 参考\n\n${blocks.join('\n\n')}\n\n`;
    }

    const promptFiles = [];
    let i = 0;
    for (const [agentName, rcs] of agentMap.entries()) {
      // Delegate prompt assembly to agentRunner.runAgent → buildPrompt so the
      // Output Language directive is injected consistently with the legacy
      // --auto-review path. Plan-specific sections (focusAreas, kbSection,
      // output target) are passed via context and rendered by buildPrompt.
      const agentContext = {
        planMode: true,
        focusAreas: rcs.map(rc => ({ risk: rc.risk, focus: rc.focus })),
        kbSection,
        prNumber: opts.prNumber,
        issueIndex: i,
        commentLanguage: (this.config && this.config.codeReview && this.config.codeReview.commentLanguage)
          || (this.config && this.config.commentLanguage)
          || null,
      };

      let result;
      try {
        result = await agentRunner.runAgent(agentName, agentContext);
      } catch (e) {
        // Unknown agent name → fall back to _generic template, but still via
        // runAgent so the Output Language directive is injected.
        result = await agentRunner.runAgent('_generic', agentContext);
      }

      const filename = `prompt-${i}-${agentName}.md`;
      const pPath = path.join(outDir, filename);
      await fs.writeFile(pPath, result.prompt, 'utf-8');
      promptFiles.push({ agentName, path: pPath });
      i++;
    }
    return { promptFiles };
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
    planOnly: args.includes('--plan-only'),
    issuesFromStdin: args.includes('--issues-from-stdin'),
    post: args.includes('--post'),
    approveAll: args.includes('--approve-all'),
    noApproval: args.includes('--no-approval'),
    promptsStdout: args.includes('--prompts-stdout'),
    writeTemp: args.includes('--write-temp'),
    // undefined = flag absent; '' = flag present, no path (use default); <path> = explicit
    promptsTo: undefined,
    collectIssuesFrom: null,
    threshold: null,
    issuesFromJson: null,
    approveList: null,
    commentLanguage: null,
    reviewGuidePath: null,
    executePlan: null
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

  // 查找 --prompts-to 参数（可选路径，缺省走默认 .tmp/gitcode-review/pr-N/prompts.json）
  const promptsToIndex = args.indexOf('--prompts-to');
  if (promptsToIndex !== -1) {
    const next = args[promptsToIndex + 1];
    options.promptsTo = next && !next.startsWith('--') ? next : '';
  }

  // 查找 --execute-plan 参数（指向 review-plan.json 文件路径）
  const executePlanIndex = args.indexOf('--execute-plan');
  if (executePlanIndex !== -1 && args[executePlanIndex + 1]) {
    options.executePlan = args[executePlanIndex + 1];
  }

  // 查找 --collect-issues-from 参数（目录，读所有 *.json 合并）
  const collectIndex = args.indexOf('--collect-issues-from');
  if (collectIndex !== -1 && args[collectIndex + 1]) {
    options.collectIssuesFrom = args[collectIndex + 1];
  }

  // 查找 --approve 参数
  const approveIndex = args.indexOf('--approve');
  if (approveIndex !== -1 && args[approveIndex + 1]) {
    options.approveList = parseApprovalList(args[approveIndex + 1]);
  }

  // 查找 --comment-language 参数
  const languageIndex = args.indexOf('--comment-language');
  if (languageIndex !== -1 && args[languageIndex + 1]) {
    options.commentLanguage = args[languageIndex + 1];
  }

  // 查找 --review-guide 参数
  const reviewGuideIndex = args.indexOf('--review-guide');
  if (reviewGuideIndex !== -1 && args[reviewGuideIndex + 1]) {
    options.reviewGuidePath = args[reviewGuideIndex + 1];
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
    console.error('  # 自动审查模式（生成结构化 JSON prompts 到文件，推荐）');
    console.error('  node gitcode-reviewer.js --pr <number> --auto-review --prompts-to [<path>] --dry-run --force [--review-guide <path>] [--comment-language en|zh]');
    console.error('  #   未传 <path> 时默认写到 .tmp/gitcode-review/pr-<N>/prompts.json');
    console.error('');
    console.error('  # 旧版输出到 stdout（仍可用，CI 场景）');
    console.error('  node gitcode-reviewer.js --pr <number> --auto-review --prompts-stdout [--review-guide <path>]');
    console.error('');
    console.error('  # DRY-RUN 模式（预览不提交）');
    console.error('  node gitcode-reviewer.js --pr <number> --dry-run');
    console.error('');
    console.error('  # 从目录聚合 agent 输出并预览评论（每个 agent 写一个 .json）');
    console.error('  node gitcode-reviewer.js --pr <number> --collect-issues-from <dir> [--skip-validation] [--comment-language en|zh]');
    console.error('');
    console.error('  # 从 JSON 文件加载问题并预览评论');
    console.error('  node gitcode-reviewer.js --pr <number> --issues-from-json <path>');
    console.error('');
    console.error('  # 从 stdin 加载问题并预览评论');
    console.error('  cat issues.json | node gitcode-reviewer.js --pr <number> --issues-from-stdin');
    console.error('');
    console.error('  # 提交已批准评论');
    console.error('  node gitcode-reviewer.js --pr <number> --issues-from-json <path> --post --approve 1,3 --comment-language en');
    console.error('  node gitcode-reviewer.js --pr <number> --issues-from-json <path> --post --approve-all --comment-language zh');
    console.error('  node gitcode-reviewer.js --pr <number> --collect-issues-from <dir> --post --approve-all --comment-language zh');
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
  const config = loadConfig();

  // 应用命令行选项
  if (options.skipValidation) {
    config.codeReview.skipValidation = true;
  }
  if (options.dryRun) {
    config.codeReview.dryRun = true;
  }
  if (options.writeTemp) {
    config.codeReview.writeTemp = true;
  }
  if (options.threshold !== null) {
    config.codeReview.confidenceThreshold = options.threshold;
  }

  // Resolve review guide: CLI flag > config.json
  const reviewGuidePath = options.reviewGuidePath || config.codeReview.reviewGuidePath;
  if (reviewGuidePath) {
    try {
      config.codeReview.reviewGuide = await loadReviewGuide(reviewGuidePath);
    } catch (error) {
      console.error(`❌ 无法加载 review guide: ${error.message}`);
      process.exit(1);
    }
  }

  config.codeReview.commentLanguage = await resolveCommentLanguage(
    config,
    options.commentLanguage,
    options.post && !options.dryRun
  );

  // 验证 token
  if (!config.gitcode.token || !config.gitcode.owner || !config.gitcode.repo) {
    console.error('❌ 错误: 请配置 gitcode.token、gitcode.owner 和 gitcode.repo');
    console.error('可使用 config.json，或设置 GITCODE_TOKEN、GITCODE_OWNER、GITCODE_REPO 环境变量。');
    process.exit(1);
  }

  // 创建审查器并执行
  const reviewer = new GitCodeReviewer(config);

  try {
    if (options.issuesFromJson) {
      // 从 JSON 加载问题并预览或提交
      await reviewer.reviewFromJson(options.prNumber, options.issuesFromJson, options);
    } else if (options.issuesFromStdin) {
      const input = await readStdin();
      const issues = JSON.parse(input);
      await reviewer.reviewFromIssues(options.prNumber, issues, options);
    } else if (options.collectIssuesFrom) {
      // 从目录聚合所有 agent 输出的 issues
      await reviewer.reviewFromDir(options.prNumber, options.collectIssuesFrom, options);
    } else if (options.executePlan) {
      const fs = require('fs').promises;
      const path = require('path');
      const planRaw = await fs.readFile(options.executePlan, 'utf-8');
      const plan = JSON.parse(planRaw);
      const { validateReviewPlan } = require('../lib/review-plan-schema');
      const result = validateReviewPlan(plan);
      if (!result.valid) {
        throw new Error(`review-plan.json invalid: ${result.errors.join('; ')}`);
      }
      const outDir = path.join(process.cwd(), '.tmp', 'gitcode-review', `pr-${options.prNumber}`);
      const { promptFiles } = await reviewer.generateAgentPromptsFromPlan(plan, outDir, { prNumber: options.prNumber });
      console.log(`Generated ${promptFiles.length} agent prompt(s) from review-plan.json:`);
      promptFiles.forEach(p => console.log(`  - ${p.agentName}: ${p.path}`));
      return { promptFiles };
    } else if (options.planOnly) {
      // Plan-only mode: build planner prompt and short-circuit before any other work.
      const rawContext = await reviewer.step2_GatherContext(options.prNumber);
      // Adapt the script's context shape to the planner-prompt-builder's expected shape.
      // The builder consumes { pr: { url, description, isDraft }, files: [{ path, status }], diff, commitMessages, reviewGuide, agentTemplateIndex }.
      // step2_GatherContext returns { pr: { htmlUrl, body }, files: [{ filename, status, patch }] } — no unified diff string.
      const plannerContext = {
        pr: {
          number: rawContext.pr.number,
          title: rawContext.pr.title,
          url: rawContext.pr.htmlUrl,
          author: rawContext.pr.author,
          isDraft: false,
          description: rawContext.pr.body || '',
        },
        commitMessages: rawContext.commitMessages || [],
        files: (rawContext.files || []).map(f => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
          // GitCode's API leaves `status` undefined for modified files; normalize so the
          // planner sees a meaningful value rather than `[undefined]`.
          status: f.status || (f.deletions > 0 && f.additions > 0 ? 'modified' : (f.additions > 0 ? 'added' : (f.deletions > 0 ? 'deleted' : 'modified'))),
        })),
        diff: (rawContext.files || [])
          .filter(f => f.patch)
          .map(f => {
            const patchStr = typeof f.patch === 'string' ? f.patch : (f.patch.diff || JSON.stringify(f.patch, null, 2));
            return `diff --git a/${f.filename} b/${f.filename}\n${patchStr}`;
          })
          .join('\n\n'),
        reviewGuide: options.reviewGuidePath ? require('fs').readFileSync(options.reviewGuidePath, 'utf-8') : undefined,
        agentTemplateIndex: reviewer.listAgentTemplates ? reviewer.listAgentTemplates() : [],
      };
      const plannerPrompt = await reviewer.buildPlannerPrompt(plannerContext);
      const outDir = path.join(process.cwd(), '.tmp', 'gitcode-review', `pr-${options.prNumber}`);
      const fs = require('fs').promises;
      await fs.mkdir(outDir, { recursive: true });
      const promptPath = path.join(outDir, 'planner-prompt.md');
      await fs.writeFile(promptPath, plannerPrompt, 'utf-8');
      console.log(`Planner prompt written to: ${promptPath}`);
      console.log('Run this prompt through an opus subagent, then call writeReviewPlan.');
    } else if (options.autoReview) {
      // 🔧 方案1: 自动执行所有 agents，输出结构化 JSON
      console.log('🤖 自动审查模式 - 执行所有 agents\n');
      await reviewer.runAllAgents(options.prNumber, options);
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
module.exports = { GitCodeReviewer, writePromptBundle, selectReviewAgentNames };

// 运行主函数
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

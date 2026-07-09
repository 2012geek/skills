#!/usr/bin/env node

/**
 * 智能 PR 描述生成工具
 *
 * 使用 AI 分析代码变更，生成语义化的 PR 描述
 *
 * 用法：
 *   node skills/code-review/scripts/generate-pr-description.js <prNumber>
 *
 * 示例：
 *   node skills/code-review/scripts/generate-pr-description.js 50
 */

const fs = require('fs');
const path = require('path');

// 读取配置文件
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}\n请创建 config.json 文件并配置 GitCode token`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!config.gitcode || !config.gitcode.token) {
    throw new Error('配置文件中缺少 gitcode.token');
  }

  return config;
}

// 收集 PR 上下文信息
async function collectPRContext(api, prNumber) {
  console.log('正在收集 PR 上下文信息...');

  // 获取 PR 基本信息
  const pr = await api.getPullRequest(prNumber);

  // 获取 commits
  const commits = await api.getPRCommits(prNumber);

  // 获取文件变更
  const files = await api.getPRFiles(prNumber);

  // 提取 commit messages
  const commitMessages = commits.map(c => ({
    sha: c.sha.substring(0, 7),
    title: c.commit.message.split('\n')[0],
    message: c.commit.message,
    author: c.author?.login || c.commit?.author?.name,
    date: c.commit?.author?.date || c.created_at
  }));

  // 提取文件变更摘要（每个文件只取前面部分）
  const fileChanges = files.map(f => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    // 限制 patch 大小，避免太长
    patchPreview: f.patch ? (f.patch.length > 2000 ? f.patch.substring(0, 2000) + '...' : f.patch) : null
  }));

  return {
    pr: {
      number: pr.number,
      title: pr.title,
      sourceBranch: pr.head?.ref,
      targetBranch: pr.base?.ref,
      sourceRepo: pr.head?.repo?.full_name
    },
    commits: commitMessages,
    files: fileChanges
  };
}

// 生成 AI 分析提示
function generateAnalysisPrompt(context) {
  const commitsText = context.commits.map(c =>
    `- ${c.title} (${c.sha})`
  ).join('\n');

  const filesText = context.files.map(f => {
    let line = `${f.status === 'added' ? '+' : f.status === 'deleted' ? '-' : '~'} ${f.filename}`;
    if (f.additions > 0 || f.deletions > 0) {
      line += ` (+${f.additions}, -${f.deletions})`;
    }
    return line;
  }).join('\n');

  return `你是一个技术文档专家，擅长分析代码变更并生成清晰的 Pull Request 描述。

## PR 基本信息

**标题**: ${context.pr.title}
**源分支**: ${context.pr.sourceBranch}
**目标分支**: ${context.pr.targetBranch}

## Commit 历史

${commitsText}

## 文件变更

${filesText}

## 你的任务

请分析上述代码变更，生成一个清晰的"本 PR 所做的工作"描述。

要求：
1. **不要**简单重复文件列表
2. **要**理解代码变更的目的和意义
3. **要**总结主要功能和改进点
4. 使用简洁的中文描述

请按照以下格式输出：

## 本 PR 所做的工作

[这里填写你生成的描述，2-5句话，总结主要功能和改进]

### 主要变更

- [变更点1]
- [变更点2]
- [变更点3]

### 技术细节

[如果需要，可以添加一些技术实现的说明]`;
}

// 生成完整的 PR 描述模板
function generateFullPRDescription(aiAnalysis) {
  return `${aiAnalysis}

---

## 如何测试

请说明/展示你如何测试这些更改。

## 如何测试（给审查者）

为审查者提供一个简单的方式来测试你的更改。

---

**注意**: 社区中的任何人都可以在测试通过后审查 PR。欢迎标记对你这个 PR 感兴趣的成员/贡献者。尽量避免标记超过 3 个人。

**注意**: 在提交 PR 之前，请阅读 [贡献者指南](https://github.com/huggingface/lerobot/blob/main/CONTRIBUTING.md#submitting-a-pull-request-pr)。
`;
}

// 主函数
async function main() {
  const { GitCodeAPI } = require('../lib/gitcode-api');

  // 解析参数
  const args = process.argv.slice(2);
  const prNumber = parseInt(args[0]);

  if (!prNumber || isNaN(prNumber)) {
    console.error('❌ 错误: 请提供有效的 PR 编号');
    console.error('');
    console.error('用法:');
    console.error('  node generate-pr-description.js <prNumber>');
    console.error('');
    console.error('示例:');
    console.error('  node generate-pr-description.js 50');
    process.exit(1);
  }

  try {
    // 加载配置
    const config = loadConfig();
    const api = new GitCodeAPI(config);

    console.log('============================================================');
    console.log('🤖 智能 PR 描述生成工具');
    console.log('============================================================');
    console.log(`PR 编号: #${prNumber}`);
    console.log(`仓库: ${config.gitcode.owner}/${config.gitcode.repo}`);
    console.log('');

    // 收集上下文
    const context = await collectPRContext(api, prNumber);

    console.log('✓ 收集到以下信息:');
    console.log(`  - ${context.commits.length} 个 commits`);
    console.log(`  - ${context.files.length} 个文件变更`);
    console.log('');

    // 生成 AI 分析提示
    const analysisPrompt = generateAnalysisPrompt(context);

    console.log('============================================================');
    console.log('📋 AI 分析提示（请将以下内容发送给 AI 进行分析）');
    console.log('============================================================');
    console.log(analysisPrompt);
    console.log('============================================================');
    console.log('');
    console.log('请将上述提示发送给 AI，然后将 AI 生成的描述粘贴到下面：');
    console.log('');

    // 暂停等待用户输入
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('按 Enter 继续，或粘贴 AI 生成的描述（然后按 Ctrl+D）...\n', () => {
      console.log('');
      console.log('提示：你可以手动编辑 PR 描述，或使用以下脚本更新：');
      console.log('');
      console.log(`  node skills/code-review/scripts/update-pr.js ${prNumber} <description-file.md>`);
      console.log('');
      console.log(`PR 链接: ${api.getPRUrl(prNumber)}`);
      rl.close();
    });

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ 生成失败');
    console.error('============================================================');
    console.error(error.message);
    process.exit(1);
  }
}

// 运行主函数
main();

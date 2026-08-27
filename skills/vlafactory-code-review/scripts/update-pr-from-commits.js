#!/usr/bin/env node

/**
 * GitCode PR 描述更新工具（基于 commit messages）
 *
 * 用法：
 *   node skills/vlafactory-code-review/scripts/update-pr-from-commits.js <prNumber>
 *
 * 示例：
 *   node skills/vlafactory-code-review/scripts/update-pr-from-commits.js 50
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

// 格式化 commit messages
function formatCommitMessages(commits) {
  if (!commits || commits.length === 0) {
    return '（无 commit 信息）';
  }

  const lines = [];

  for (const commit of commits) {
    const title = commit.commit.message.split('\n')[0]; // 只取第一行（标题）
    const shortSha = commit.sha.substring(0, 7);
    const author = commit.author?.login || commit.commit?.author?.name || 'Unknown';
    const date = new Date(commit.commit?.author?.date || commit.created_at).toLocaleDateString('zh-CN');

    lines.push(`- **${title}** (\`${shortSha}\`, ${author}, ${date})`);
  }

  return lines.join('\n');
}

// 统计文件变更
function formatFileChanges(files) {
  if (!files || files.length === 0) {
    return '';
  }

  const additions = files.reduce((sum, f) => sum + (f.additions || 0), 0);
  const deletions = files.reduce((sum, f) => sum + (f.deletions || 0), 0);
  const changes = files.reduce((sum, f) => sum + (f.changes || 0), 0);

  let summary = `\n\n**文件变更统计**:\n`;
  summary += `- 总变更: ${changes} 行\n`;
  summary += `- 新增: ${additions} 行\n`;
  summary += `- 删除: ${deletions} 行\n`;

  // 列出主要文件
  const modifiedFiles = files.filter(f => f.status !== 'unchanged').map(f => {
    const emoji = f.status === 'added' ? '➕' : f.status === 'deleted' ? '❌' : '📝';
    return `${emoji} \`${f.filename}\` (${f.status === 'added' ? '+' : ''}${f.additions}, ${f.status === 'deleted' ? '-' : ''}${f.deletions})`;
  });

  if (modifiedFiles.length > 0) {
    summary += `\n**主要文件**:\n${modifiedFiles.map(f => `  ${f}`).join('\n')}`;
  }

  return summary;
}

// 生成 PR 描述
function generatePRDescription(commits, files) {
  const commitSection = formatCommitMessages(commits);
  const fileSection = formatFileChanges(files);

  return `## 本 PR 所做的工作

本 PR 包含以下提交：

${commitSection}
${fileSection}

---

## 如何测试

请说明/展示你如何测试这些更改。

示例：

- 在 \`tests/test_stuff.py\` 中添加了 \`test_something\` 测试。
- 添加了 \`new_feature\` 并验证在使用策略 X 在数据集/环境 Y 上训练能够收敛。
- 优化了 \`some_function\`，现在比之前快 X 倍。

## 如何测试（给审查者）

为审查者提供一个简单的方式来测试你的更改。

示例：

\`\`\`bash
pytest -sx tests/test_stuff.py::test_something
\`\`\`

\`\`\`bash
lerobot-train --some.option=true
\`\`\`

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
    console.error('  node update-pr-from-commits.js <prNumber>');
    console.error('');
    console.error('示例:');
    console.error('  node update-pr-from-commits.js 50');
    process.exit(1);
  }

  try {
    // 加载配置
    const config = loadConfig();
    const api = new GitCodeAPI(config);

    console.log('============================================================');
    console.log('📝 GitCode PR 描述更新工具（基于 commit messages）');
    console.log('============================================================');
    console.log(`PR 编号: #${prNumber}`);
    console.log(`仓库: ${config.gitcode.owner}/${config.gitcode.repo}`);
    console.log('');

    // 获取 PR 的 commits
    console.log('正在获取 PR commits...');
    const commits = await api.getPRCommits(prNumber);
    console.log(`✓ 找到 ${commits.length} 个 commits`);

    // 获取 PR 的文件变更
    console.log('正在获取文件变更...');
    const files = await api.getPRFiles(prNumber);
    console.log(`✓ 找到 ${files.length} 个文件变更`);
    console.log('');

    // 生成 PR 描述
    const description = generatePRDescription(commits, files);

    // 显示生成的描述
    console.log('============================================================');
    console.log('生成的 PR 描述:');
    console.log('============================================================');
    console.log(description);
    console.log('============================================================');
    console.log('');

    // 获取当前 PR 信息
    const currentPR = await api.getPullRequest(prNumber);
    console.log(`当前标题: ${currentPR.title}`);
    console.log(`当前描述长度: ${currentPR.body ? currentPR.body.length : 0} 字符`);
    console.log(`新描述长度: ${description.length} 字符`);
    console.log('');

    // 更新 PR
    console.log('正在更新 PR...');

    const updatedPR = await api.updatePullRequest(prNumber, {
      body: description
    });

    console.log('');
    console.log('============================================================');
    console.log('✅ PR 描述更新成功');
    console.log('============================================================');
    console.log(`PR 编号: #${updatedPR.number || prNumber}`);
    console.log(`PR 标题: ${updatedPR.title || currentPR.title}`);
    console.log(`PR 链接: ${api.getPRUrl(prNumber)}`);
    console.log('============================================================');

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ 更新 PR 失败');
    console.error('============================================================');
    console.error(error.message);
    process.exit(1);
  }
}

// 运行主函数
main();

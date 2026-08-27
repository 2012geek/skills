#!/usr/bin/env node

/**
 * 智能 PR 描述生成工具（完整版）
 *
 * 分析代码变更、测试文件，生成语义化的 PR 描述
 *
 * 用法：
 *   node skills/vlafactory-code-review/scripts/generate-smart-pr-desc.js <prNumber>
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// 读取配置文件
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}`);
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!config.gitcode || !config.gitcode.token) {
    throw new Error('配置文件中缺少 gitcode.token');
  }
  return config;
}

// 获取远程文件内容
function fetchFile(owner, repo, filePath, ref, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.gitcode.com',
      port: 443,
      path: `/api/v5/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'PR-Generator/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.content) {
            resolve(Buffer.from(json.content, 'base64').toString('utf-8'));
          } else {
            resolve('');
          }
        } catch (e) {
          resolve('');
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 从 README 提取测试命令（通用化）
function extractGenericTestCommands(readmeContent) {
  const commands = [];

  // 提取 bash 代码块
  const bashMatches = readmeContent.match(/```bash\n([\s\S]*?)```/g) || [];

  bashMatches.forEach(match => {
    let content = match.replace(/```bash\n?|```/g, '').trim();

    // 过滤掉具体路径的命令
    const lines = content.split('\n');
    const filteredLines = lines.filter(line => {
      // 跳过包含绝对路径的行
      if (line.includes('/home/') || line.includes('/Users/') || line.includes('cd /home')) {
        return false;
      }
      // 跳过 conda/环境激活命令
      if (line.includes('conda activate') || line.includes('source activate')) {
        return false;
      }
      // 跳过注释行（除非是说明）
      if (line.trim().startsWith('#') && !line.includes('进入') && !line.includes('激活')) {
        return false;
      }
      // 跳过 cd 到具体目录的命令
      if (line.trim().startsWith('cd ') && !line.includes('cd tests/')) {
        return false;
      }
      return true;
    });

    // 清理空行
    const cleanedLines = filteredLines.filter(line => line.trim() !== '');

    if (cleanedLines.length > 0) {
      commands.push(cleanedLines.join('\n'));
    }
  });

  // 去重并限制数量
  const uniqueCommands = [...new Set(commands)];

  // 只返回最关键的命令（最多3个）
  return uniqueCommands.slice(0, 3);
}

// 分析测试文件
async function analyzeTestFiles(files, sourceRepo, sourceBranch, token) {
  const testFiles = files.filter(f =>
    f.filename.includes('test_') ||
    f.filename.includes('conftest') ||
    f.filename.startsWith('tests/')
  );

  if (testFiles.length === 0) {
    return null;
  }

  let testInstructions = '';

  // 查找 README 文件
  const readmeFile = files.find(f => f.filename.includes('README.md') && f.filename.includes('tests/'));
  if (readmeFile) {
    try {
      const readmeContent = await fetchFile(
        sourceRepo.split('/')[0],
        sourceRepo.split('/')[1],
        readmeFile.filename,
        sourceBranch,
        token
      );

      // 提取通用的测试命令
      const commands = extractGenericTestCommands(readmeContent);

      if (commands.length > 0) {
        testInstructions += '### 测试命令\n\n';
        commands.forEach(cmd => {
          testInstructions += '```bash\n' + cmd + '\n```\n\n';
        });
      }
    } catch (e) {
      // 忽略错误
    }
  }

  // 查找 pytest 测试文件
  const pytestFiles = testFiles.filter(f => f.filename.includes('test_') && f.filename.endsWith('.py'));
  if (pytestFiles.length > 0 && !testInstructions) {
    testInstructions += '### 测试命令\n\n';
    testInstructions += '```bash\n# 运行所有测试\npytest tests/ -v\n\n# 运行特定测试\n';
    testInstructions += `pytest ${pytestFiles[0].filename} -v\n`;
    testInstructions += '```\n\n';
  }

  return testInstructions || null;
}

// 生成语义化的 PR 描述
async function generateSmartDescription(context, testInstructions) {
  const { pr, commits, files } = context;

  // 分析 commits 提取主要功能
  const mainFeatures = commits
    .map(c => {
      const msg = c.title.toLowerCase();
      if (msg.includes('feat') || msg.includes('add')) {
        return { type: '新增', title: c.title.replace(/^(feat|add|chore):\s*/, '') };
      } else if (msg.includes('fix') || msg.includes('bug')) {
        return { type: '修复', title: c.title.replace(/^(fix|bugfix):\s*/, '') };
      } else if (msg.includes('refactor') || msg.includes('improve')) {
        return { type: '优化', title: c.title.replace(/^(refactor|improve|chore):\s*/, '') };
      }
      return null;
    })
    .filter(Boolean);

  // 构建描述
  let description = '## 本 PR 所做的工作\n\n';

  // 生成概述
  if (mainFeatures.length > 0) {
    description += mainFeatures.map(f => `- **${f.type}**: ${f.title}`).join('\n');
  } else {
    description += `- ${commits[0]?.title || '代码更新'}`;
  }

  description += '\n\n### 主要变更\n\n';

  // 按功能分组文件
  const newFiles = files.filter(f => f.status === 'added');
  const modifiedFiles = files.filter(f => f.status === 'modified');

  if (newFiles.length > 0) {
    // 按目录分组
    const grouped = {};
    newFiles.forEach(f => {
      const dir = f.filename.substring(0, f.filename.lastIndexOf('/'));
      if (!grouped[dir]) grouped[dir] = [];
      grouped[dir].push(f);
    });

    Object.keys(grouped).forEach(dir => {
      const filesInDir = grouped[dir];
      const displayName = dir.replace(/^src\//, '').replace(/^tests\//, '');
      description += `- **${displayName}**\n`;
      filesInDir.forEach(f => {
        const name = f.filename.substring(f.filename.lastIndexOf('/') + 1);
        description += `  - \`${name}\` (+${f.additions})\n`;
      });
      description += '\n';
    });
  }

  if (modifiedFiles.length > 0) {
    description += '### 修改的文件\n\n';
    modifiedFiles.forEach(f => {
      description += `- \`${f.filename}\` (+${f.additions}, -${f.deletions})\n`;
    });
  }

  // 添加测试说明
  description += '\n---\n\n## 如何测试\n\n';

  if (testInstructions) {
    description += testInstructions;
  } else {
    description += '请说明/展示你如何测试这些更改。\n\n';
    description += '示例：\n\n';
    description += '- 在相关测试文件中添加了测试用例\n';
    description += '- 手动测试验证功能正常\n';
    description += '- 检查没有引入新的 bug\n';
  }

  description += '\n## 如何测试（给审查者）\n\n';

  description += '为审查者提供一个简单的方式来测试你的更改。\n\n';
  description += '示例：\n\n';
  description += '```bash\n';
  description += '# 克隆仓库并切换到 PR 分支\n';
  description += `git checkout ${pr.sourceBranch}\n`;
  description += '\n';
  description += '# 运行测试\n';
  description += 'pytest tests/ -v\n';
  description += '```\n';

  description += '\n---\n\n';
  description += '**注意**: 社区中的任何人都可以在测试通过后审查 PR。欢迎标记对你这个 PR 感兴趣的成员/贡献者。尽量避免标记超过 3 个人。\n\n';
  description += '**注意**: 在提交 PR 之前，请阅读 [贡献者指南](https://github.com/huggingface/lerobot/blob/main/CONTRIBUTING.md#submitting-a-pull-request-pr)。\n';

  return description;
}

// 主函数
async function main() {
  const { GitCodeAPI } = require('../lib/gitcode-api');

  const args = process.argv.slice(2);
  const prNumber = parseInt(args[0]);

  if (!prNumber || isNaN(prNumber)) {
    console.error('❌ 错误: 请提供有效的 PR 编号');
    console.error('用法: node generate-smart-pr-desc.js <prNumber>');
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const api = new GitCodeAPI(config);

    console.log('============================================================');
    console.log('🤖 智能 PR 描述生成工具（完整版）');
    console.log('============================================================');
    console.log(`PR 编号: #${prNumber}`);
    console.log('');

    // 收集上下文
    console.log('正在收集 PR 信息...');
    const pr = await api.getPullRequest(prNumber);
    const commits = await api.getPRCommits(prNumber);
    const files = await api.getPRFiles(prNumber);

    const context = {
      pr: {
        number: pr.number,
        title: pr.title,
        sourceBranch: pr.head?.ref,
        sourceRepo: pr.head?.repo?.full_name,
        targetBranch: pr.base?.ref
      },
      commits: commits.map(c => ({
        sha: c.sha.substring(0, 7),
        title: c.commit.message.split('\n')[0]
      })),
      files
    };

    console.log(`✓ ${commits.length} 个 commits`);
    console.log(`✓ ${files.length} 个文件变更`);
    console.log('');

    // 分析测试文件
    console.log('正在分析测试文件...');
    const testInstructions = await analyzeTestFiles(
      files,
      context.pr.sourceRepo,
      context.pr.sourceBranch,
      config.gitcode.token
    );
    if (testInstructions) {
      console.log('✓ 找到测试说明');
    } else {
      console.log('⚠ 未找到测试说明，使用默认模板');
    }
    console.log('');

    // 生成描述
    console.log('正在生成描述...');
    const description = await generateSmartDescription(context, testInstructions);

    console.log('');
    console.log('============================================================');
    console.log('生成的 PR 描述:');
    console.log('============================================================');
    console.log(description);
    console.log('============================================================');
    console.log('');

    // 更新 PR
    console.log('正在更新 PR...');
    const updatedPR = await api.updatePullRequest(prNumber, { body: description });

    console.log('');
    console.log('============================================================');
    console.log('✅ PR 描述更新成功');
    console.log('============================================================');
    console.log(`PR 链接: ${api.getPRUrl(prNumber)}`);
    console.log(`描述长度: ${description.length} 字符`);

  } catch (error) {
    console.error('');
    console.error('❌ 失败:', error.message);
    process.exit(1);
  }
}

main();

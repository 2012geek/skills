#!/usr/bin/env node

/**
 * GitCode PR 描述更新工具
 *
 * 用法：
 *   node skills/code-review/scripts/update-pr.js <prNumber>
 *
 * 示例：
 *   node skills/code-review/scripts/update-pr.js 50
 */

const fs = require('fs');
const path = require('path');

// 默认的 PR 描述模板（中文）
const DEFAULT_TEMPLATE = `## 本 PR 所做的工作

请简要说明这个 PR 做了什么。可以根据内容添加适当的标签。

示例：
| 标题 | 标签 |
|----------------------|-----------------|
| 修复 #[issue] | (🐛 Bug) |
| 添加新数据集 | (🗃️ Dataset) |
| 优化某项功能 | (⚡️ Performance) |

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

// 从文件读取自定义模板
function loadTemplate(filePath) {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf8');
  }
  return null;
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
    console.error('  node update-pr.js <prNumber> [templateFile]');
    console.error('');
    console.error('示例:');
    console.error('  node update-pr.js 50');
    console.error('  node update-pr.js 50 custom-template.md');
    process.exit(1);
  }

  const templateFile = args[1];

  try {
    // 加载配置
    const config = loadConfig();
    const api = new GitCodeAPI(config);

    console.log('============================================================');
    console.log('📝 GitCode PR 描述更新工具');
    console.log('============================================================');
    console.log(`PR 编号: #${prNumber}`);
    console.log(`仓库: ${config.gitcode.owner}/${config.gitcode.repo}`);
    console.log('');

    // 获取模板
    let body = templateFile ? loadTemplate(templateFile) : null;
    if (!body) {
      body = DEFAULT_TEMPLATE;
      console.log('使用默认 PR 描述模板');
    } else {
      console.log(`使用自定义模板: ${templateFile}`);
    }
    console.log('');

    // 获取当前 PR 信息
    console.log('获取当前 PR 信息...');
    const currentPR = await api.getPullRequest(prNumber);
    console.log(`当前标题: ${currentPR.title}`);
    console.log(`当前描述长度: ${currentPR.body ? currentPR.body.length : 0} 字符`);
    console.log('');

    // 确认更新
    console.log('============================================================');
    console.log('将使用以下描述模板更新 PR:');
    console.log('============================================================');
    console.log(body);
    console.log('============================================================');
    console.log('');

    // 更新 PR
    console.log('正在更新 PR...');

    const updatedPR = await api.updatePullRequest(prNumber, {
      body
    });

    console.log('');
    console.log('============================================================');
    console.log('✅ PR 描述更新成功');
    console.log('============================================================');
    console.log(`PR 编号: #${updatedPR.number}`);
    console.log(`PR 标题: ${updatedPR.title}`);
    console.log(`PR 链接: ${api.getPRUrl(updatedPR.number)}`);
    console.log('============================================================');

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ 更新 PR 失败');
    console.error('============================================================');
    console.error(error.message);
    if (error.message.includes('404')) {
      console.error('');
      console.error('PR 不存在或无权访问');
    }
    process.exit(1);
  }
}

// 运行主函数
main();

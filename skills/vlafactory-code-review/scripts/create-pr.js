#!/usr/bin/env node

/**
 * GitCode PR 自动创建工具
 *
 * 用法：
 *   node skills/vlafactory-code-review/scripts/create-pr.js <sourceUrl> [options]
 *
 * 参数：
 *   sourceUrl    源代码仓库 URL（如：https://gitcode.com/leningchen_admin/lerobot_ros2/commits/video_2_img）
 *
 * 选项：
 *   --title      PR 标题（默认：从分支名生成）
 *   --body       PR 描述
 *   --base       目标分支（默认：master）
 *   --draft      创建为草稿 PR
 *   --dry-run    只验证参数，不实际创建 PR
 *
 * 示例：
 *   node skills/vlafactory-code-review/scripts/create-pr.js https://gitcode.com/leningchen_admin/lerobot_ros2/commits/video_2_img
 *   node skills/vlafactory-code-review/scripts/create-pr.js https://gitcode.com/leningchen_admin/lerobot_ros2/commits/video_2_img --title "feat: add video to image conversion"
 */

const fs = require('fs');
const path = require('path');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    sourceUrl: null,
    title: null,
    body: null,
    base: 'master',
    draft: false,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--title':
        options.title = args[++i];
        break;
      case '--body':
        options.body = args[++i];
        break;
      case '--base':
        options.base = args[++i];
        break;
      case '--draft':
        options.draft = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        if (!arg.startsWith('--') && !options.sourceUrl) {
          options.sourceUrl = arg;
        }
        break;
    }
  }

  return options;
}

// 读取配置文件
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}\n请创建 config.json 文件并配置 GitCode token 和目标仓库信息`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  if (!config.gitcode || !config.gitcode.token) {
    throw new Error('配置文件中缺少 gitcode.token');
  }

  return config;
}

// 主函数
async function main() {
  const { GitCodeAPI } = require('../lib/gitcode-api');

  console.log('============================================================');
  console.log('🚀 GitCode PR 自动创建工具');
  console.log('============================================================');

  // 解析参数
  const options = parseArgs();

  if (!options.sourceUrl) {
    console.error('❌ 错误: 请提供源代码仓库 URL');
    console.error('');
    console.error('用法:');
    console.error('  node create-pr.js <sourceUrl> [options]');
    console.error('');
    console.error('示例:');
    console.error('  node create-pr.js https://gitcode.com/leningchen_admin/lerobot_ros2/commits/video_2_img');
    console.error('  node create-pr.js https://gitcode.com/leningchen_admin/lerobot_ros2/commits/video_2_img --title "feat: add feature"');
    process.exit(1);
  }

  try {
    // 加载配置
    const config = loadConfig();
    console.log(`📋 配置: ${config.gitcode.owner}/${config.gitcode.repo}`);
    console.log(`🔗 源 URL: ${options.sourceUrl}`);
    console.log('');

    // 解析源 URL
    const api = new GitCodeAPI(config);
    const sourceInfo = api.parseGitCodeUrl(options.sourceUrl);

    console.log(`📂 源仓库: ${sourceInfo.owner}/${sourceInfo.repo}`);
    console.log(`🌿 源分支: ${sourceInfo.branch}`);
    console.log(`🎯 目标分支: ${options.base}`);
    console.log('');

    // 构建(head)参数
    const head = `${sourceInfo.owner}:${sourceInfo.branch}`;

    // 生成默认标题（如果没有提供）
    const title = options.title || `feat: merge ${sourceInfo.branch} into ${options.base}`;

    // 显示将要创建的 PR 信息
    console.log('============================================================');
    console.log('📝 PR 信息');
    console.log('============================================================');
    console.log(`标题: ${title}`);
    console.log(`源: ${head}`);
    console.log(`目标: ${config.gitcode.owner}/${config.gitcode.repo}:${options.base}`);
    console.log(`草稿: ${options.draft ? '是' : '否'}`);
    console.log('============================================================');
    console.log('');

    // Dry run 模式
    if (options.dryRun) {
      console.log('✅ Dry run 模式: 参数验证通过，未实际创建 PR');
      return;
    }

    // 创建 PR
    console.log('正在创建 PR...');

    const pr = await api.createPullRequest({
      title,
      body: options.body || '',
      head,
      base: options.base,
      draft: options.draft
    });

    console.log('');
    console.log('============================================================');
    console.log('✅ PR 创建成功');
    console.log('============================================================');
    console.log(`PR 编号: #${pr.number}`);
    console.log(`PR 标题: ${pr.title}`);
    console.log(`PR 链接: ${pr.html_url || api.getPRUrl(pr.number)}`);
    console.log(`状态: ${pr.state}`);
    console.log('============================================================');

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ 创建 PR 失败');
    console.error('============================================================');
    console.error(error.message);
    if (error.message.includes('API')) {
      console.error('');
      console.error('可能的原因:');
      console.error('1. Token 无效或权限不足');
      console.error('2. 目标仓库不存在');
      console.error('3. 源分支不存在或无法访问');
      console.error('4. 目标分支不存在');
    }
    process.exit(1);
  }
}

// 运行主函数
main();

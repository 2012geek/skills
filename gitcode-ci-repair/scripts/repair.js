#!/usr/bin/env node
/**
 * GitCode CI Auto-Repair 主程序
 *
 * 自动修复 GitCode MR 的 CI 失败问题
 */

const { GitCodeAPI, ConfigLoader } = require('@skills/gitcode-sdk');
const path = require('path');

// 加载配置
const loader = new ConfigLoader({ configPath: path.join(process.cwd(), 'config.json') });
let config, api;
try {
  config = loader.loadRaw();
  api = new GitCodeAPI({ gitcode: config.gitcode });
} catch (e) {
  console.error('❌ 配置文件不存在: config.json');
  console.error('请在项目根目录创建 config.json:');
  console.error(JSON.stringify({
    gitcode: {
      token: 'your_gitcode_token',
      baseUrl: 'https://api.gitcode.com',
      owner: 'openeuler',
      repo: 'lerobot_ros2'
    }
  }, null, 2));
  process.exit(1);
}

/**
 * 解析 MR 编号或 URL
 */
function parseMRInput(input) {
  // URL 格式: https://gitcode.com/openeuler/lerobot_ros2/pull/50
  const urlMatch = input.match(/\/pull\/(\d+)$/);
  if (urlMatch) {
    return parseInt(urlMatch[1]);
  }
  // 纯数字格式
  const num = parseInt(input);
  if (!isNaN(num)) {
    return num;
  }
  throw new Error(`无法解析 MR 编号: ${input}`);
}

/**
 * 从 PR URL 解析 owner 和 repo
 */
function parseRepoFromUrl(url) {
  const match = url.match(/gitcode\.com\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

/**
 * 主修复流程
 */
async function repairWorkflow(mrNumber, mrUrl = null) {
  console.log('========================================');
  console.log('🔧 GitCode CI Auto-Repair');
  console.log('========================================');
  console.log(`📋 MR #${mrNumber}`);

  // 如果提供了 URL，更新配置
  if (mrUrl) {
    const repoInfo = parseRepoFromUrl(mrUrl);
    if (repoInfo) {
      config.gitcode.owner = repoInfo.owner;
      config.gitcode.repo = repoInfo.repo;
    }
  }

  console.log(`📍 ${config.gitcode.owner}/${config.gitcode.repo}`);
  console.log('');

  let iteration = 0;
  const maxIterations = 10;

  while (iteration < maxIterations) {
    iteration++;
    console.log(`\n--- 迭代 ${iteration}/${maxIterations} ---`);

    // 获取 labels
    const pr = await api.getPullRequest(mrNumber);
    const labels = pr.labels.map(l => l.name);
    console.log(`🏷️  当前标签: ${labels.join(', ') || '(无)'}`);

    // 如果没有 ci 相关标签，触发 /retest
    if (!labels.includes('ci_failed') && !labels.includes('ci_successful')) {
      console.log('⏳ 未找到 CI 标签，触发 /retest...');
      await api.submitPRComment(mrNumber, '/retest');
      console.log('✅ 已触发 /retest，等待 30 秒...');
      await new Promise(r => setTimeout(r, 30000));
      continue;
    }

    // 如果 ci_successful，成功退出
    if (labels.includes('ci_successful')) {
      console.log('');
      console.log('========================================');
      console.log('🎉 CI 修复成功！');
      console.log('========================================');
      console.log(`✅ MR #${mrNumber} 的所有检查已通过`);
      console.log(`🔗 ${pr.html_url || pr.web_url}`);
      return true;
    }

    // 如果 ci_failed，获取失败详情
    if (labels.includes('ci_failed')) {
      console.log('❌ CI 检查失败，开始分析...');

      // 获取最新评论
      const comments = await api.getPRComments(mrNumber);
      const ciComment = findCIFailureComment(comments);

      if (!ciComment) {
        console.log('⚠️  未找到 CI 失败评论，触发 /retest...');
        await api.submitPRComment(mrNumber, '/retest');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      // 解析失败项
      const { summary, failures } = parseCIFailureComment(ciComment.body);

      console.log(`\n📊 构建信息:`);
      console.log(`   ${summary || 'CI 失败'}`);

      if (failures.length === 0) {
        console.log('⚠️  无法解析具体失败项');
        await api.submitPRComment(mrNumber, '/retest');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }

      console.log(`\n❌ 失败项 (${failures.length}):`);
      failures.forEach((f, i) => {
        console.log(`   ${i + 1}. ${f.check}: ${f.status}`);
      });

      // 生成修复方案
      const fixes = await generateFixes(failures);

      if (fixes.length === 0) {
        console.log('\n⚠️  无法自动生成修复方案');
        console.log('请手动检查并修复后重新运行');
        return false;
      }

      console.log('\n💡 修复方案:');
      fixes.forEach((fix, i) => {
        console.log(`   ${i + 1}. ${fix.description}`);
        if (fix.command) {
          console.log(`      命令: ${fix.command}`);
        }
      });

      // 执行修复
      console.log('\n🔧 执行修复...');
      for (const fix of fixes) {
        await applyFix(fix);
      }

      // 提交修复
      console.log('\n📝 提交修复 (git commit --amend)...');
      const repoPath = process.cwd();
      await commitFixes(repoPath);

      // 触发重测
      console.log('🔄 触发 /retest...');
      await api.submitPRComment(mrNumber, '/retest');

      console.log('✅ 修复完成，等待 CI 结果...');
      console.log('⏳ 等待 60 秒...');
      await new Promise(r => setTimeout(r, 60000));
    }
  }

  console.log('\n⚠️  达到最大迭代次数，请手动检查');
  return false;
}

/**
 * 查找 CI 失败评论
 */
function findCIFailureComment(comments) {
  const sorted = comments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  for (const comment of sorted) {
    const body = comment.body || '';
    if (body.includes('openEuler Embedded') && body.includes('门禁检查') && body.includes('❌')) {
      return comment;
    }
  }
  return null;
}

/**
 * 解析 CI 失败评论
 */
function parseCIFailureComment(commentBody) {
  const failures = [];
  let summary = '';

  const lines = commentBody.split('\n');
  for (const line of lines) {
    if (line.includes('本次构建耗时')) {
      summary = line.trim();
      break;
    }
  }

  // 解析检查项: checkcommit_msg ✅ SUCCESS#82
  const checkPattern = /check(\w+)\s+([✅❌])\s*(\w+)/g;
  let match;

  while ((match = checkPattern.exec(commentBody)) !== null) {
    const [, check, emoji, status] = match;
    const isFailed = emoji === '❌' || status.toUpperCase().includes('FAIL');

    failures.push({
      check: check,
      status: status,
      failed: isFailed,
      emoji: emoji
    });
  }

  return { summary, failures };
}

/**
 * 生成修复方案
 */
async function generateFixes(failures) {
  const fixes = [];

  for (const failure of failures) {
    if (!failure.failed) continue;

    switch (failure.check) {
      case 'pre-commit':
        const preCommitFixes = await analyzePreCommitFailure();
        fixes.push(...preCommitFixes);
        break;
      case 'commit_msg':
        const commitMsgFixes = await analyzeCommitMessageFailure();
        fixes.push(...commitMsgFixes);
        break;
      default:
        console.log(`⚠️  未知的检查类型: ${failure.check}`);
    }
  }

  return fixes;
}

/**
 * 分析 pre-commit 失败
 */
async function analyzePreCommitFailure() {
  const { execSync } = require('child_process');
  const fixes = [];

  try {
    const output = execSync('SKIP=gitleaks pre-commit run --all-files 2>&1', {
      encoding: 'utf-8',
      cwd: process.cwd()
    });

    // 解析输出生成修复方案
    if (output.includes('ruff')) {
      fixes.push({
        type: 'ruff',
        description: '运行 ruff 自动修复',
        command: 'ruff check --fix .'
      });
    }

    if (output.includes('mypy')) {
      fixes.push({
        type: 'mypy',
        description: '需要手动添加类型注解',
        command: null
      });
    }

  } catch (error) {
    const output = error.stdout || error.stderr || '';
    // 解析错误输出
  }

  return fixes;
}

/**
 * 分析 commit_msg 失败
 */
async function analyzeCommitMessageFailure() {
  const { execSync } = require('child_process');
  const fixes = [];

  try {
    const latestCommit = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' });
    const lines = latestCommit.split('\n');

    if (lines[0].length > 72) {
      fixes.push({
        type: 'commit-title-length',
        description: '缩短 commit 标题',
        command: null
      });
    }

    if (!latestCommit.includes('Signed-off-by')) {
      fixes.push({
        type: 'commit-signed-off',
        description: '添加 Signed-off-by',
        command: 'git commit --amend --signoff'
      });
    }

  } catch (error) {
    // ignore
  }

  return fixes;
}

/**
 * 应用修复
 */
async function applyFix(fix) {
  const { execSync } = require('child_process');

  console.log(`   应用: ${fix.description}`);

  if (fix.command) {
    try {
      execSync(fix.command, { stdio: 'inherit', cwd: process.cwd() });
    } catch (error) {
      console.log(`   ⚠️  命令失败: ${error.message}`);
    }
  }
}

/**
 * 提交修复
 */
async function commitFixes(repoPath) {
  const { execSync } = require('child_process');

  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: repoPath });

    if (!status.trim()) {
      console.log('   ℹ️  没有需要提交的变更');
      return;
    }

    execSync('git add -A', { stdio: 'inherit', cwd: repoPath });
    execSync('git commit --amend --no-edit', { stdio: 'inherit', cwd: repoPath });

    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: repoPath }).trim();

    try {
      execSync(`git push -f ${branch}`, { stdio: 'inherit', cwd: repoPath });
    } catch (error) {
      execSync(`git push -f origin ${branch}`, { stdio: 'inherit', cwd: repoPath });
    }

    console.log('   ✅ 修复已提交并推送');

  } catch (error) {
    console.log(`   ❌ 提交失败: ${error.message}`);
    throw error;
  }
}

// 主程序入口
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('用法: node repair.js <mr_number_or_url>');
    console.log('示例: node repair.js 50');
    console.log('      node repair.js https://gitcode.com/openeuler/lerobot_ros2/pull/50');
    process.exit(1);
  }

  const input = args[0];

  try {
    const mrNumber = parseMRInput(input);
    const success = await repairWorkflow(mrNumber, input.includes('http') ? input : null);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`\n❌ 错误: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  repairWorkflow,
  parseMRInput,
  findCIFailureComment,
  parseCIFailureComment,
  generateFixes,
  applyFix,
  commitFixes
};

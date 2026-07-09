#!/usr/bin/env node

/**
 * GitCode PR Review Comment Repair Script
 *
 * Usage: node scripts/repair-pr.js
 *
 * This script:
 * 1. Prompts for PR URL
 * 2. Gets review comment status
 * 3. Fetches unresolved comments
 * 4. Generates fixes using LLM
 * 5. Applies fixes and replies to comments
 * 6. Commits with git commit --amend
 * 7. Outputs summary table
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// Add the plugin lib directory to the path
const libPath = path.join(__dirname, '..', 'lib');
const { GitCodeAPIRepair } = require(path.join(libPath, 'gitcode-api-repair.js'));

// Temporary directory for PR checkout
let tempPrDir = null;

/**
 * Load config from project root
 */
function loadConfig() {
  const configPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(__dirname, '..', '..', '..', 'config.json')
  ];

  let config = null;

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`✓ Loaded config from: ${configPath}`);
      break;
    }
  }

  if (!config) {
    throw new Error('config.json not found. Please create config.json with gitcode and anthropic sections.');
  }

  // Fallback: Load API key and base URL from Claude settings if not set
  if (!config.anthropic?.apiKey || config.anthropic.apiKey === 'sk-ant-your-key-here') {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    try {
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.env?.ANTHROPIC_AUTH_TOKEN) {
          config.anthropic = config.anthropic || {};
          config.anthropic.apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
          console.log(`✓ Loaded Anthropic API key from Claude settings`);
        }
        if (settings.env?.ANTHROPIC_BASE_URL) {
          config.anthropic = config.anthropic || {};
          config.anthropic.baseUrl = settings.env.ANTHROPIC_BASE_URL;
          console.log(`✓ Loaded Anthropic base URL from Claude settings`);
        }
      }
    } catch (e) {
      console.log(`  ⚠ Could not load settings.json: ${e.message}`);
    }
  }

  return config;
}

/**
 * Prompt user for input
 */
async function prompt(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Generate multiple LLM analyses for the same review comment
 */
async function generateMultipleSolutions(api, fileContent, reviewComment, filePath, lineNumber, fileDiff) {
  console.log('  🔄 正在生成多个解决方案 / Generating multiple solutions...');

  const solutions = [];
  const numSolutions = 3;

  for (let i = 0; i < numSolutions; i++) {
    try {
      console.log(`  📝 生成方案 ${i + 1}/${numSolutions} / Generating solution ${i + 1}/${numSolutions}...`);

      const fix = await api.generateFix({
        fileContent,
        reviewComment,
        filePath,
        lineNumber,
        prDiff: fileDiff
      });

      solutions.push({
        index: i + 1,
        fix: fix
      });

      // Small delay between requests to avoid rate limiting
      if (i < numSolutions - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`    ✗ 方案 ${i + 1} 生成失败 / Solution ${i + 1} failed: ${error.message}`);
    }
  }

  console.log(`  ✓ 生成了 ${solutions.length} 个解决方案 / Generated ${solutions.length} solutions`);
  return solutions;
}

/**
 * Show multiple solutions and let user choose
 */
async function selectSolution(solutions, filePath) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 多方案对比 / Multiple Solution Comparison');
  console.log('='.repeat(80));

  for (const solution of solutions) {
    const fix = solution.fix;
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🔍 方案 ${solution.index} / Solution ${solution.index}`);
    console.log(`${'─'.repeat(80)}`);

    if (fix.needsDeleteLines) {
      console.log(`类型 / Type: 删除特定行 / Delete specific lines`);
      console.log(`删除行 / Lines: ${fix.deleteLines.join(', ')}`);
      console.log(`说明 / Description: ${fix.fixDescription.substring(0, 200)}...`);
    } else if (fix.needsRevertFile) {
      console.log(`类型 / Type: 回退整个文件 / Revert entire file`);
      console.log(`说明 / Description: ${fix.fixDescription.substring(0, 200)}...`);
    } else if (fix.hasFix) {
      console.log(`类型 / Type: 代码修改 / Code modification`);
      console.log(`说明 / Description: ${fix.fixDescription.substring(0, 200)}...`);
      console.log(`修改前 / Before: ${fix.originalCode.substring(0, 100)}...`);
      console.log(`修改后 / After: ${fix.fixedCode.substring(0, 100)}...`);
    } else {
      console.log(`类型 / Type: 仅回复 / Reply only`);
      console.log(`说明 / Description: ${fix.reason.substring(0, 200)}...`);
    }
  }

  console.log('\n' + '='.repeat(80));

  const answer = await prompt('\n❓ 选择要执行的方案 (1-3) 或跳过 (0)/Enter / Choose solution (1-3) or skip (0)/Enter: ');

  const choice = parseInt(answer) || 0;

  if (choice === 0 || answer === '') {
    return null;
  }

  const selected = solutions.find(s => s.index === choice);
  if (!selected) {
    console.log('  ⚠️ 无效选择，默认使用方案 1 / Invalid choice, using solution 1');
    return solutions[0];
  }

  console.log(`  ✓ 选择了方案 ${choice} / Selected solution ${choice}`);
  return selected.fix;
}

/**
 * Show code change preview and ask for confirmation
 */
async function confirmChange(fix, filePath) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 代码修改预览 / Code Change Preview');
  console.log('='.repeat(80));

  if (fix.needsDeleteLines) {
    console.log(`\n🔍 操作类型 / Action: 删除特定行 / Delete specific lines`);
    console.log(`📄 文件 / File: ${filePath}`);
    console.log(`📍 要删除的行号 / Lines to delete: ${fix.deleteLines.join(', ')}`);
    console.log(`\n📝 说明 / Description:`);
    console.log(`  ${fix.fixDescription}`);
  } else if (fix.needsRevertFile) {
    console.log(`\n🔍 操作类型 / Action: 回退整个文件 / Revert entire file`);
    console.log(`📄 文件 / File: ${filePath}`);
    console.log(`\n📝 说明 / Description:`);
    console.log(`  ${fix.fixDescription}`);
  } else if (fix.hasFix) {
    console.log(`\n🔍 操作类型 / Action: 代码修改 / Code modification`);
    console.log(`📄 文件 / File: ${filePath}`);
    console.log(`\n📝 说明 / Description:`);
    console.log(`  ${fix.fixDescription}`);
    console.log(`\n🔻 修改前 / Before:`);
    console.log('```');
    console.log(fix.originalCode);
    console.log('```');
    console.log(`\n🔺 修改后 / After:`);
    console.log('```');
    console.log(fix.fixedCode);
    console.log('```');
  } else {
    console.log(`\n🔍 操作类型 / Action: 仅回复 / Reply only`);
    console.log(`\n📝 说明 / Description:`);
    console.log(`  ${fix.reason}`);
  }

  console.log('\n' + '='.repeat(80));

  const answer = await prompt('\n❓ 是否执行此修改？/ Execute this change? [y/N]: ');
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Format reply for code fix
 */
function formatFixReply(fix, comment, filePath) {
  return `感谢您的审阅意见。已按要求完成修复，具体内容如下：

**修复方案**:
${fix.fixDescription}

**修改文件**: \`${filePath}\`

**代码变更**:
\`\`\`
# 修改前 (Before)
${fix.originalCode}

# 修改后 (After)
${fix.fixedCode}
\`\`\`

如有任何疑问，请随时提出。

---
🤖 Generated by gitcode-code-review-repair`;
}

/**
 * Format reply for file revert
 */
function formatRevertReply(fix, comment) {
  return `感谢您的审阅意见。

**处理结果**:
${fix.fixDescription}

已按要求回退该文件的修改，恢复到原仓库状态。

如有任何疑问，请随时提出。

---
🤖 Generated by gitcode-code-review-repair`;
}

/**
 * Format reply for deleting specific lines
 */
function formatDeleteLinesReply(fix, comment) {
  return `感谢您的审阅意见。

**处理结果**:
${fix.fixDescription}

已删除以下行号的内容: ${fix.deleteLines.join(', ')}

如有任何疑问，请随时提出。

---
🤖 Generated by gitcode-code-review-repair`;
}

/**
 * Format reply for flawed review logic
 */
function formatLogicReply(fix, comment) {
  return `感谢您的审阅意见。

${fix.reason}

如有任何疑问，请随时提出。

---
🤖 Generated by gitcode-code-review-repair`;
}

/**
 * Apply fix to file
 */
async function applyFix(filePath, originalCode, fixedCode) {
  const fs = require('fs').promises;
  const content = await fs.readFile(filePath, 'utf-8');

  // Find and replace the original code
  const newContent = content.replace(originalCode, fixedCode);

  if (newContent === content) {
    throw new Error('Could not find the original code in the file. The code may have changed.');
  }

  await fs.writeFile(filePath, newContent, 'utf-8');
  console.log(`  ✓ Applied fix to ${filePath}`);
}

/**
 * Delete specific lines from a file
 * @param {string} filePath - Full path to file
 * @param {number[]} lineNumbers - Array of 1-indexed line numbers to delete
 * @param {string} workDir - Working directory for git operations
 */
async function deleteSpecificLines(filePath, lineNumbers, workDir) {
  const fs = require('fs').promises;

  // Read file content
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Convert 1-indexed line numbers to 0-indexed array indices
  // Sort in descending order to delete from end to start (preserves indices)
  const indicesToDelete = lineNumbers.map(n => n - 1).sort((a, b) => b - a);

  let deletedCount = 0;
  for (const index of indicesToDelete) {
    if (index >= 0 && index < lines.length) {
      lines.splice(index, 1);
      deletedCount++;
    } else {
      console.log(`  ⚠ Line number ${index + 1} is out of range (file has ${lines.length} lines)`);
    }
  }

  // Write back to file
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  console.log(`  ✓ Deleted ${deletedCount} line(s) from ${filePath}`);
}

/**
 * Revert file changes using git checkout
 */
async function revertFileChanges(filePath, workDir) {
  const { execSync } = require('child_process');

  // Get the relative path from workDir
  const path = require('path');
  const relativePath = path.relative(workDir, filePath);

  // Use git checkout to revert the file from HEAD (the base branch)
  // This restores the file to the state before any modifications
  execSync(`git checkout HEAD -- "${relativePath}"`, {
    encoding: 'utf-8',
    cwd: workDir
  });

  console.log(`  ✓ Reverted ${relativePath} to base branch state`);
}

/**
 * Commit fixes with amend
 */
async function commitFixes(workDir = process.cwd()) {
  const { execSync } = require('child_process');

  try {
    // Check if there are changes to commit
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: workDir });

    if (!status.trim()) {
      console.log('⚠ No changes to commit');
      return false;
    }

    // Add all changes
    execSync('git add -A', { encoding: 'utf-8', cwd: workDir });
    console.log('✓ Staged changes');

    // Amend the commit
    execSync('git commit --amend --no-edit', { encoding: 'utf-8', cwd: workDir });
    console.log('✓ Amended commit with fixes');

    return true;
  } catch (error) {
    console.error(`✗ Git operation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Print summary table
 */
function printSummary(results, prUrl) {
  console.log('\n' + '='.repeat(80));
  console.log('📋 修复汇总 / Fix Summary');
  console.log('='.repeat(80));

  if (results.length === 0) {
    console.log('\n✓ 所有检视意见已解决 / All review comments have been resolved');
    console.log('='.repeat(80));
    return;
  }

  console.log('\n| 状态 | 文件 | 检视意见 | 修复方案 | 链接 |');
  console.log('|------|------|----------|----------|------|');

  for (const result of results) {
    const status = result.hasFix ? '✅ 已修复' : '💬 已回复';
    const file = result.file.split('/').pop();
    const comment = result.commentBody.substring(0, 20) + '...';
    const fix = result.fixDescription || result.reason || '-';
    const link = result.url || '-';

    console.log(`| ${status} | ${file} | ${comment} | ${fix} | [查看](${link}) |`);
  }

  console.log('\n' + '='.repeat(80));
  console.log(`🔗 PR 链接 / PR Link: ${prUrl}`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Checkout PR to temporary directory
 */
async function checkoutPR(owner, repo, prNumber, config) {
  const os = require('os');
  const tmpDir = path.join(os.tmpdir(), `gitcode-repair-${owner}-${repo}-${prNumber}`);

  console.log(`\n📦 准备 PR 代码库 / Preparing PR repository...`);
  console.log(`  临时目录 / Temp dir: ${tmpDir}`);

  // Clean up any existing directory
  if (fs.existsSync(tmpDir)) {
    console.log('  清理现有目录 / Cleaning existing directory...');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Create temp directory
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Clone the main repo with LFS disabled
    console.log('  克隆仓库 / Cloning repository...');
    execSync(
      `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://gitcode.com/${owner}/${repo}.git ${tmpDir}`,
      { stdio: 'inherit', cwd: tmpDir }
    );

    // Fetch the base branch for diff comparison
    console.log('  获取基础分支 / Fetching base branch...');
    try {
      execSync('git fetch origin master:refs/remotes/origin/master', {
        stdio: 'pipe',
        cwd: tmpDir
      });
    } catch (e) {
      // master fetch failed, try main
      try {
        execSync('git fetch origin main:refs/remotes/origin/main', {
          stdio: 'pipe',
          cwd: tmpDir
        });
      } catch (e2) {
        console.log('  ⚠ Could not fetch base branch, diff may be limited');
      }
    }

    // Try to get PR branch info
    console.log('  获取 PR 分支 / Fetching PR branch...');

    // First, try to fetch from the original repository
    try {
      // Get PR info to find the source branch
      // For GitCode, PR branches are typically in format: author/branch
      // We'll try multiple approaches

      // Approach 1: Try fetching as a pull ref
      try {
        execSync(`git fetch origin pull/${prNumber}/head:pr-${prNumber}`, {
          stdio: 'pipe',
          cwd: tmpDir
        });
        execSync(`git checkout pr-${prNumber}`, { stdio: 'pipe', cwd: tmpDir });
        console.log(`  ✓ Checked out PR #${prNumber} (pull ref)`);
      } catch (e) {
        // Approach 2: Try to find the branch name from remote
        // Get PR metadata via API
        const https = require('https');
        const token = process.env.GITCODE_TOKEN || config.gitcode?.token || '';
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

        const prInfo = await new Promise((resolve, reject) => {
          https.get({
            hostname: 'api.gitcode.com',
            path: `/api/v5/repos/${owner}/${repo}/pulls/${prNumber}`,
            headers
          }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(e);
              }
            });
          }).on('error', reject);
        });

        if (prInfo.head && prInfo.head.ref) {
          const sourceBranch = prInfo.head.ref;
          const sourceRepo = prInfo.head.repo?.full_name || `${owner}/${repo}`; // Default to same repo

          console.log(`  → PR branch: ${sourceBranch} from ${sourceRepo}`);

          if (sourceRepo === `${owner}/${repo}`) {
            // PR is from the same repository
            execSync(`GIT_LFS_SKIP_SMUDGE=1 git fetch origin ${sourceBranch}`, {
              stdio: 'inherit',
              cwd: tmpDir
            });
            execSync(`git checkout ${sourceBranch}`, { stdio: 'inherit', cwd: tmpDir });
            console.log(`  ✓ Checked out branch: ${sourceBranch} from origin`);
          } else {
            // PR is from a fork
            execSync(`git remote add source https://gitcode.com/${sourceRepo}.git`, {
              stdio: 'pipe',
              cwd: tmpDir
            });
            execSync(`GIT_LFS_SKIP_SMUDGE=1 git fetch source ${sourceBranch}`, {
              stdio: 'inherit',
              cwd: tmpDir
            });
            execSync(`git checkout ${sourceBranch}`, { stdio: 'inherit', cwd: tmpDir });
            console.log(`  ✓ Checked out branch: ${sourceBranch} from ${sourceRepo}`);
          }
        } else {
          throw new Error('Could not determine PR branch');
        }
      }
    } catch (e) {
      console.log(`  ⚠ PR checkout warning: ${e.message}`);
      console.log('  继续使用 master 分支 / Continuing with master branch');
    }

    // Configure git user for commits in temp directory
    execSync('git config user.email "claude@anthropic.com"', {
      stdio: 'pipe',
      cwd: tmpDir
    });
    execSync('git config user.name "Claude Code"', {
      stdio: 'pipe',
      cwd: tmpDir
    });

    // Don't change working directory - use absolute paths instead
    tempPrDir = tmpDir;

    console.log('  ✓ PR 代码已准备好 / PR code ready\n');
    return tmpDir;
  } catch (error) {
    // Clean up on failure
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Cleanup temporary directory
 */
function cleanup() {
  if (tempPrDir && fs.existsSync(tempPrDir)) {
    console.log(`\n🧹 清理临时目录 / Cleaning temp dir: ${tempPrDir}`);
    fs.rmSync(tempPrDir, { recursive: true, force: true });
    tempPrDir = null;
  }

  // Change back to original directory if needed
  const originalDir = path.join(__dirname, '..', '..', '..');
  if (process.cwd() !== originalDir) {
    try {
      process.chdir(originalDir);
    } catch (e) {
      // Ignore
    }
  }
}

/**
 * Main repair workflow
 */
async function main() {
  try {
    console.log('\n🔧 GitCode PR Review Comment Repair\n');

    // Load configuration
    const config = loadConfig();

    // Validate config
    if (!config.gitcode?.token) {
      throw new Error('Missing gitcode.token in config.json');
    }
    if (!config.anthropic?.apiKey) {
      throw new Error('Missing anthropic.apiKey in config.json. Add it to config.json: { "anthropic": { "apiKey": "sk-ant-..." } }');
    }

    // Prompt for PR URL
    let prUrl = process.argv[2];
    if (!prUrl) {
      prUrl = await prompt('请输入 PR 链接 / Enter PR URL: ');
    }

    // Initialize API
    const api = new GitCodeAPIRepair(config);

    // Parse PR URL
    console.log('\n📋 解析 PR 链接 / Parsing PR URL...');
    const { owner, repo, prNumber } = api.parsePRUrl(prUrl);
    console.log(`  Owner: ${owner}`);
    console.log(`  Repo: ${repo}`);
    console.log(`  PR: ${prNumber}`);

    // Get review status
    console.log('\n📊 获取检视意见状态 / Getting review status...');
    const status = await api.getReviewStatus(prNumber);
    console.log(`  方法 / Method: ${status.method}`);
    console.log(`  已解决 / Resolved: ${status.resolved}`);
    console.log(`  总计 / Total: ${status.total}`);
    console.log(`  未解决 / Unresolved: ${status.unresolved}`);

    // Check if all resolved
    if (status.unresolved === 0) {
      console.log('\n✅ 所有检视意见已解决！任务完成。');
      console.log('    All review comments resolved! Task complete.\n');
      return;
    }

    // Get unresolved comments
    console.log('\n📝 获取未解决检视意见 / Fetching unresolved comments...');
    const comments = await api.getUnresolvedComments(prNumber);
    console.log(`  Found ${comments.length} unresolved comments`);

    if (comments.length === 0) {
      console.log('\n✅ 没有需要修复的检视意见');
      return;
    }

    // Get xauth_token for nested reply support
    console.log('\n🔑 获取嵌套回复所需认证 / Getting auth for nested replies...');
    let xauthToken = null;
    try {
      const xauthExtractorPath = path.join(__dirname, 'xauth-extractor.js');
      const { getXauthToken } = require(xauthExtractorPath);
      xauthToken = await getXauthToken();
      if (xauthToken) {
        console.log('  ✓ xauth_token ready for nested replies');
      } else {
        console.log('  ⚠ No xauth_token available, replies will be standalone');
      }
    } catch (error) {
      console.log(`  ⚠ xauth_token setup failed: ${error.message}`);
      console.log('  回复将使用公开API（非嵌套）/ Replies will use public API (not nested)');
    }

    // Checkout PR repository
    await checkoutPR(owner, repo, prNumber, config);

    // Get PR diff for analysis
    console.log('\n📄 获取PR改动信息 / Getting PR diff...');
    let prDiff = '';
    try {
      // Try to get diff from GitCode API first
      const https = require('https');
      const token = config.gitcode?.token || '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      prDiff = await new Promise((resolve, reject) => {
        https.get({
          hostname: 'api.gitcode.com',
          path: `/api/v5/repos/${owner}/${repo}/pulls/${prNumber}.diff`,
          headers
        }, (res) => {
          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(data);
            } else {
              reject(new Error(`API returned ${res.statusCode}`));
            }
          });
        }).on('error', reject);
      });

      // Limit diff size for LLM processing
      if (prDiff.length > 10000) {
        prDiff = prDiff.substring(0, 10000) + '\n... (diff truncated)';
      }
      console.log(`  ✓ 获取到改动信息 / Got diff (${prDiff.length} bytes)`);
    } catch (error) {
      console.log(`  ⚠ 无法从API获取diff: ${error.message}`);
      // Fallback to git diff
      try {
        const { execSync } = require('child_process');
        prDiff = execSync('git diff origin/master', { encoding: 'utf-8', cwd: tempPrDir });
        if (prDiff.length > 10000) {
          prDiff = prDiff.substring(0, 10000) + '\n... (diff truncated)';
        }
        console.log(`  ✓ 从git获取diff (${prDiff.length} bytes)`);
      } catch (e) {
        console.log(`  ⚠ 无法获取diff: ${e.message}`);
      }
    }

    // Process each comment
    console.log('\n🔨 处理检视意见 / Processing comments...\n');
    const results = [];
    const filesToFix = new Map(); // Track files that need fixes

    for (let i = 0; i < comments.length; i++) {
      const comment = comments[i];
      console.log(`[${i + 1}/${comments.length}] Processing ${comment.path}:${comment.line}`);

      try {
        // Get file context - use tempPrDir for absolute path
        const fileContent = await api.getFileContext(
          path.join(tempPrDir, comment.path),
          comment.line || 1,
          20
        );

        // Get specific file diff for this comment
        let fileDiff = '';
        if (prDiff) {
          const diffLines = prDiff.split('\n');
          let inTargetFile = false;
          for (const line of diffLines) {
            if (line.includes(`a/${comment.path}`) || line.includes(`b/${comment.path}`)) {
              inTargetFile = true;
            }
            if (inTargetFile) {
              fileDiff += line + '\n';
            }
            if (inTargetFile && line.startsWith('diff --git') && line !== diffLines[0]) {
              break;
            }
          }
        }

        // Step 1: Analyze comment with LLM and show plan
        console.log('\n📊 步骤 1/4: 分析审查意见 / Step 1/4: Analyzing review comment...');
        await api.analyzeCommentWithPlan({
          reviewComment: comment.body,
          filePath: comment.path,
          lineNumber: comment.line,
          prDiff: fileDiff || '（无法获取该文件的改动信息）'
        });

        // Step 2: Generate multiple solutions using LLM
        console.log('\n🔧 步骤 2/4: 生成多个解决方案 / Step 2/4: Generating multiple solutions...');
        const solutions = await generateMultipleSolutions(
          api,
          fileContent,
          comment.body,
          comment.path,
          comment.line,
          fileDiff
        );

        if (solutions.length === 0) {
          console.log('  ⚠️ 没有生成任何解决方案 / No solutions generated');
          results.push({
            file: comment.path,
            line: comment.line,
            commentBody: comment.body,
            hasFix: false,
            error: 'Failed to generate any solutions',
            url: comment.url
          });
          continue;
        }

        // Step 3: Select solution from multiple options
        console.log('\n📋 步骤 3/4: 选择解决方案 / Step 3/4: Selecting solution...');
        const fix = await selectSolution(solutions, comment.path);

        if (!fix) {
          console.log('  ⏭️  跳过此修改 / Skipped this change');
          results.push({
            file: comment.path,
            line: comment.line,
            commentBody: comment.body,
            hasFix: false,
            skipped: true,
            reason: 'User skipped all solutions',
            url: comment.url
          });
          continue;
        }

        // Step 3.5: Show detailed change preview and ask for final confirmation
        console.log('\n📋 步骤 3.5/4: 最终确认 / Step 3.5/4: Final confirmation...');
        const approved = await confirmChange(fix, comment.path);

        if (!approved) {
          console.log('  ⏭️  跳过此修改 / Skipped this change');
          results.push({
            file: comment.path,
            line: comment.line,
            commentBody: comment.body,
            hasFix: false,
            skipped: true,
            reason: 'User rejected the change',
            url: comment.url
          });
          continue;
        }

        // Prepare reply
        let replyBody;
        if (fix.needsDeleteLines) {
          // Handle delete specific lines case
          console.log('\n⚠️ 需要删除特定行 / Needs to delete specific lines');
          console.log(`  文件 / File: ${fix.filePath}`);
          console.log(`  要删除的行 / Lines to delete: ${fix.deleteLines.join(', ')}`);
          console.log(`  说明 / Reason: ${fix.fixDescription}`);

          // Perform line deletion
          try {
            const fullPath = path.join(tempPrDir, fix.filePath);
            await deleteSpecificLines(fullPath, fix.deleteLines, tempPrDir);
            console.log(`  ✓ 已删除指定行 / Deleted specified lines from ${fix.filePath}`);
            filesToFix.set(comment.path, { linesDeleted: fix.deleteLines });
          } catch (deleteError) {
            console.error(`  ✗ 删除失败 / Delete failed: ${deleteError.message}`);
          }

          replyBody = formatDeleteLinesReply(fix, comment);
        } else if (fix.needsRevertFile) {
          // Handle revert entire file case
          console.log('\n⚠️ 需要回退整个文件 / Needs to revert entire file');
          console.log(`  文件 / File: ${fix.filePath}`);
          console.log(`  说明 / Reason: ${fix.fixDescription}`);

          // Perform revert
          try {
            const fullPath = path.join(tempPrDir, fix.filePath);
            await revertFileChanges(fullPath, tempPrDir);
            console.log(`  ✓ 已回退文件修改 / File reverted: ${fix.filePath}`);
            filesToFix.set(comment.path, { reverted: true });
          } catch (revertError) {
            console.error(`  ✗ 回退失败 / Revert failed: ${revertError.message}`);
          }

          replyBody = formatRevertReply(fix, comment);
        } else if (fix.hasFix) {
          replyBody = formatFixReply(fix, comment, comment.path);
          filesToFix.set(comment.path, { originalCode: fix.originalCode, fixedCode: fix.fixedCode });
        } else {
          replyBody = formatLogicReply(fix, comment);
        }

        // Step 3: Reply to comment (prefer nested reply when available)
        console.log('\n💬 步骤 4/4: 回复检视意见 / Step 4/4: Replying to comment...');
        const replyResult = await api.replyToComment(prNumber, comment.id, replyBody, {
          discussion_id: comment.discussion_id,
          xauth_token: xauthToken
        });
        console.log(`  ✓ 回复已发送 / Reply sent to comment #${comment.id}`);

        results.push({
          file: comment.path,
          line: comment.line,
          commentBody: comment.body,
          hasFix: fix.hasFix,
          fixDescription: fix.fixDescription,
          reason: fix.reason,
          url: replyResult.html_url || comment.url
        });

      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        results.push({
          file: comment.path,
          line: comment.line,
          commentBody: comment.body,
          hasFix: false,
          error: error.message,
          url: comment.url
        });
      }
    }

    // Apply standard code fixes (delete/revert operations already applied above)
    const standardFixes = new Map();
    for (const [filePath, fix] of filesToFix.entries()) {
      // Only collect fixes with originalCode and fixedCode (standard code modifications)
      if (fix.originalCode && fix.fixedCode) {
        standardFixes.set(filePath, fix);
      }
    }

    if (standardFixes.size > 0) {
      console.log('\n📝 应用代码修复 / Applying code fixes...\n');

      for (const [filePath, fix] of standardFixes.entries()) {
        try {
          const fullPath = path.join(tempPrDir, filePath);
          await applyFix(fullPath, fix.originalCode, fix.fixedCode);
        } catch (error) {
          console.error(`  ✗ Failed to apply fix to ${filePath}: ${error.message}`);
        }
      }
    }

    // Commit all fixes (including delete/revert operations)
    if (filesToFix.size > 0) {
      console.log('\n📦 提交修复 / Committing fixes...');
      await commitFixes(tempPrDir);
    }

    // Print summary
    printSummary(results, `https://gitcode.com/${owner}/${repo}/pulls/${prNumber}`);

    console.log('✅ 任务完成！/ Task complete!\n');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  } finally {
    // Always cleanup temporary directory
    cleanup();
  }
}

// Run main function
if (require.main === module) {
  main();
}

module.exports = { main };

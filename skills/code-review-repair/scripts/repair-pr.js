#!/usr/bin/env node

/**
 * GitCode PR Review Comment Repair Script
 *
 * Usage:
 *   node scripts/repair-pr.js --collect <PR_URL>
 *   node scripts/repair-pr.js --apply <PR_URL> [--dry-run]
 *
 * This script is the scaffolding for the `code-review-repair` skill.
 * The LLM (Claude, running the skill) generates fixes between the two
 * stages — Claude reads `context.json`, uses Edit/Write on the
 * checkout, then writes `fixes.json` for this script to apply.
 *
 * --collect: fetch unresolved comments, checkout PR, write context.json, exit
 * --apply:   read fixes.json, apply to checkout, reply to comments, git commit --amend
 *
 * Configuration: `gitcode.token` in `config.json` or `GITCODE_TOKEN` env var.
 * No Anthropic API key needed — Claude IS the LLM in the skill flow.
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const libPath = path.join(__dirname, '..', 'lib');
const { GitCodeAPIRepair } = require(path.join(libPath, 'gitcode-api-repair.js'));

// Scratch dir for context.json/fixes.json AND the checkout (everything under project .tmp/)
function scratchDir(prNumber) {
  return path.join(process.cwd(), '.tmp', 'code-review-repair', `pr-${prNumber}`);
}

// Checkout lives inside the scratch dir so everything is co-located.
// Persistent across runs — skip clone if `checkout/.git` exists.
function checkoutDir(owner, repo, prNumber) {
  return path.join(scratchDir(prNumber), 'checkout');
}

/**
 * Load config from project root (gitcode token only — no anthropic)
 */
function loadConfig() {
  const configPaths = [
    path.join(process.cwd(), 'config.json'),
    path.join(process.cwd(), 'gitcode-review.config.json'),
    path.join(__dirname, '..', '..', '..', 'config.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      console.log(`✓ Loaded config from: ${configPath}`);
      return config;
    }
  }

  // Allow GITCODE_TOKEN env var without a config file
  if (process.env.GITCODE_TOKEN) {
    return { gitcode: { token: process.env.GITCODE_TOKEN } };
  }

  throw new Error(
    'No config found. Set GITCODE_TOKEN env var or create config.json with `gitcode.token`.'
  );
}

/**
 * Get PR metadata (source/target repo + branch) from PR API.
 * Returns { sourceRepo, sourceBranch, targetRepo, targetBranch } or null.
 */
async function getPRInfo(owner, repo, prNumber, config) {
  const https = require('https');
  const token = process.env.GITCODE_TOKEN || config.gitcode?.token || '';
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'api.gitcode.com',
      path: `/api/v5/repos/${owner}/${repo}/pulls/${prNumber}`,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const prInfo = JSON.parse(data);
          if (!prInfo.head || !prInfo.base) {
            reject(new Error(`PR API response missing head/base: ${data.substring(0, 200)}`));
            return;
          }
          resolve({
            sourceRepo: prInfo.head.repo?.full_name || `${owner}/${repo}`,
            sourceBranch: prInfo.head.ref,
            targetRepo: prInfo.base.repo?.full_name || `${owner}/${repo}`,
            targetBranch: prInfo.base.ref
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Checkout PR into a persistent cache directory.
 * PR-API-driven: fetch PR metadata first, then clone the source repo (gives
 * correct HEAD), and add the target repo as `base` remote for diffing.
 */
async function checkoutPR(owner, repo, prNumber, config) {
  const dir = checkoutDir(owner, repo, prNumber);

  console.log(`\n📦 准备 PR 代码库 / Preparing PR repository...`);
  console.log(`  缓存目录 / Cache dir: ${dir}`);

  // If checkout already exists and looks valid, fetch + checkout PR branch
  if (fs.existsSync(path.join(dir, '.git'))) {
    console.log('  ✓ 已存在检出目录 / Existing checkout found');
    try {
      const info = await getPRInfo(owner, repo, prNumber, config);
      // Fetch latest from source and target remotes
      execSync(`git fetch origin ${info.sourceBranch} 2>&1 || true`, { stdio: 'pipe', cwd: dir });
      if (info.sourceRepo !== info.targetRepo) {
        execSync(`git fetch base ${info.targetBranch} 2>&1 || true`, { stdio: 'pipe', cwd: dir });
      }
      // Checkout source branch (force-create local tracking branch)
      execSync(`git checkout -B ${info.sourceBranch} origin/${info.sourceBranch} 2>&1 || true`, {
        stdio: 'pipe', cwd: dir
      });
    } catch (e) {
      console.log(`  ⚠ Refresh failed: ${e.message}`);
    }
    return dir;
  }

  // Clean partial state if any
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });

  try {
    const info = await getPRInfo(owner, repo, prNumber, config);
    console.log(`  PR source: ${info.sourceRepo}:${info.sourceBranch}`);
    console.log(`  PR target: ${info.targetRepo}:${info.targetBranch}`);

    // Clone the source repo (HEAD ends up at source branch — correct PR head)
    console.log('  克隆源仓库 / Cloning source repo...');
    execSync(
      `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 https://gitcode.com/${info.sourceRepo}.git ${dir}`,
      { stdio: 'inherit', cwd: dir }
    );

    // Add target repo as `base` remote (for diffing against base branch)
    if (info.sourceRepo !== info.targetRepo) {
      console.log('  添加目标仓库为 base remote / Adding target as base remote...');
      execSync(`git remote add base https://gitcode.com/${info.targetRepo}.git`, {
        stdio: 'pipe', cwd: dir
      });
      execSync(`GIT_LFS_SKIP_SMUDGE=1 git fetch base ${info.targetBranch}`, {
        stdio: 'pipe', cwd: dir
      });
    }

    // Ensure local branch tracks source's branch
    execSync(`git checkout -B ${info.sourceBranch} origin/${info.sourceBranch} 2>&1 || true`, {
      stdio: 'pipe', cwd: dir
    });

    console.log(`  ✓ Checked out PR source: ${info.sourceBranch}`);

    // Configure git user for commits
    execSync('git config user.email "claude@anthropic.com"', { stdio: 'pipe', cwd: dir });
    execSync('git config user.name "Claude Code"', { stdio: 'pipe', cwd: dir });

    console.log('  ✓ PR 代码已准备好 / PR code ready\n');
    return dir;
  } catch (error) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    throw error;
  }
}

/**
 * Apply fix to file (string replace originalCode → fixedCode)
 */
async function applyFix(filePath, originalCode, fixedCode) {
  const fs = require('fs').promises;
  const content = await fs.readFile(filePath, 'utf-8');
  const newContent = content.replace(originalCode, fixedCode);
  if (newContent === content) {
    throw new Error('Could not find the original code in the file. The code may have changed.');
  }
  await fs.writeFile(filePath, newContent, 'utf-8');
  console.log(`  ✓ Applied fix to ${filePath}`);
}

/**
 * Delete specific lines from a file
 */
async function deleteSpecificLines(filePath, lineNumbers) {
  const fs = require('fs').promises;
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const indicesToDelete = lineNumbers.map(n => n - 1).sort((a, b) => b - a);
  let deletedCount = 0;
  for (const index of indicesToDelete) {
    if (index >= 0 && index < lines.length) {
      lines.splice(index, 1);
      deletedCount++;
    } else {
      console.log(`  ⚠ Line ${index + 1} out of range (file has ${lines.length} lines)`);
    }
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  console.log(`  ✓ Deleted ${deletedCount} line(s) from ${filePath}`);
}

/**
 * Revert file to HEAD state
 */
async function revertFileChanges(filePath, workDir) {
  const relativePath = path.relative(workDir, filePath);
  execSync(`git checkout HEAD -- "${relativePath}"`, { encoding: 'utf-8', cwd: workDir });
  console.log(`  ✓ Reverted ${relativePath} to HEAD state`);
}

/**
 * Commit fixes with amend
 */
async function commitFixes(workDir) {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: workDir });
    if (!status.trim()) {
      console.log('⚠ No changes to commit');
      return false;
    }
    execSync('git add -A', { encoding: 'utf-8', cwd: workDir });
    console.log('✓ Staged changes');
    execSync('git commit --amend --no-edit', { encoding: 'utf-8', cwd: workDir });
    console.log('✓ Amended commit with fixes');
    return true;
  } catch (error) {
    console.error(`✗ Git operation failed: ${error.message}`);
    throw error;
  }
}

/**
 * Write context.json (input contract for Claude)
 */
async function writeContext(contextPath, payload) {
  await fs.promises.mkdir(path.dirname(contextPath), { recursive: true });
  await fs.promises.writeFile(contextPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`\n✓ Wrote context: ${contextPath}`);
}

/**
 * Read fixes.json (output contract from Claude)
 */
function readFixes(fixesPath) {
  if (!fs.existsSync(fixesPath)) {
    throw new Error(`fixes.json not found at ${fixesPath}. Run the skill step 2 first (Claude generates fixes.json).`);
  }
  return JSON.parse(fs.readFileSync(fixesPath, 'utf-8'));
}

/**
 * Get PR diff via API or git diff fallback
 */
async function getPRDiff(owner, repo, prNumber, config, workDir) {
  // Primary path: GitCode PR diff API (correct endpoint: /pulls/N/diff, not .diff)
  try {
    const https = require('https');
    const token = config.gitcode?.token || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const diff = await new Promise((resolve, reject) => {
      https.get({
        hostname: 'api.gitcode.com',
        path: `/api/v5/repos/${owner}/${repo}/pulls/${prNumber}/diff`,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) resolve(data);
          else reject(new Error(`API returned ${res.statusCode}`));
        });
      }).on('error', reject);
    });
    if (diff && diff.length > 0) {
      return diff.length > 10000 ? diff.substring(0, 10000) + '\n... (diff truncated)' : diff;
    }
  } catch (error) {
    console.log(`  ⚠ API diff failed: ${error.message}, falling back to git diff`);
  }

  // Fallback: git diff between base branch and current HEAD (PR source branch)
  try {
    // Determine base remote + branch from remotes
    const remotes = execSync('git remote', { encoding: 'utf-8', cwd: workDir }).trim().split('\n');
    const hasBase = remotes.includes('base');
    const baseRemote = hasBase ? 'base' : 'origin';
    // Try master first, then main
    let baseRef = `${baseRemote}/master`;
    try {
      execSync(`git rev-parse --verify ${baseRef}`, { stdio: 'pipe', cwd: workDir });
    } catch (e) {
      baseRef = `${baseRemote}/main`;
    }
    let diff = execSync(`git diff ${baseRef}..HEAD`, { encoding: 'utf-8', cwd: workDir });
    if (diff.length > 10000) diff = diff.substring(0, 10000) + '\n... (diff truncated)';
    return diff;
  } catch (e) {
    console.log(`  ⚠ git diff also failed: ${e.message}`);
    return '';
  }
}

/**
 * Slice a per-file diff from the full PR diff
 */
function sliceFileDiff(prDiff, filePath) {
  if (!prDiff) return '';
  const diffLines = prDiff.split('\n');
  let inTargetFile = false;
  let fileDiff = '';
  for (const line of diffLines) {
    if (line.includes(`a/${filePath}`) || line.includes(`b/${filePath}`)) {
      inTargetFile = true;
    }
    if (inTargetFile) {
      fileDiff += line + '\n';
    }
    if (inTargetFile && line.startsWith('diff --git') && line !== diffLines[0]) {
      break;
    }
  }
  return fileDiff;
}

/**
 * --collect: fetch comments, checkout, write context.json
 */
async function runCollect(prUrl) {
  console.log('\n🔧 GitCode PR Repair --collect\n');

  const config = loadConfig();
  if (!config.gitcode?.token && !process.env.GITCODE_TOKEN) {
    throw new Error('Missing gitcode.token (config.json or GITCODE_TOKEN env)');
  }
  // Allow env override
  if (process.env.GITCODE_TOKEN && !config.gitcode?.token) {
    config.gitcode = config.gitcode || {};
    config.gitcode.token = process.env.GITCODE_TOKEN;
  }
  if (process.env.GITCODE_OWNER && !config.gitcode?.owner) {
    config.gitcode = config.gitcode || {};
    config.gitcode.owner = process.env.GITCODE_OWNER;
  }
  if (process.env.GITCODE_REPO && !config.gitcode?.repo) {
    config.gitcode = config.gitcode || {};
    config.gitcode.repo = process.env.GITCODE_REPO;
  }

  const api = new GitCodeAPIRepair(config);

  console.log('📋 解析 PR 链接 / Parsing PR URL...');
  const { owner, repo, prNumber } = api.parsePRUrl(prUrl);
  console.log(`  Owner: ${owner}, Repo: ${repo}, PR: ${prNumber}`);

  console.log('\n📊 获取检视意见状态 / Getting review status...');
  const status = await api.getReviewStatus(prNumber);
  console.log(`  已解决 / Resolved: ${status.resolved}, 总计 / Total: ${status.total}, 未解决 / Unresolved: ${status.unresolved}`);

  // Only short-circuit when the scrape definitively reports all-resolved (total > 0).
  // If the scrape failed (method='None'/'Error' or total===0), fall through to
  // getUnresolvedInlineComments — it uses a different DiffNote API and may still find comments.
  if (status.total > 0 && status.unresolved === 0) {
    console.log('\n✅ 所有检视意见已解决 / All review comments resolved');
    const ctx = { prUrl, owner, repo, prNumber, status, comments: [], prDiff: '', checkoutDir: null };
    await writeContext(path.join(scratchDir(prNumber), 'context.json'), ctx);
    return;
  }

  console.log('\n📝 获取未解决检视意见 / Fetching unresolved comments...');
  const comments = await api.getUnresolvedInlineComments(prNumber);
  console.log(`  Found ${comments.length} comments`);

  // Checkout PR
  const workDir = await checkoutPR(owner, repo, prNumber, config);

  // Get PR diff
  console.log('\n📄 获取 PR diff...');
  const prDiff = await getPRDiff(owner, repo, prNumber, config, workDir);
  console.log(`  ✓ diff size: ${prDiff.length} bytes`);

  // Enrich each comment with fileContent + fileDiff
  const enrichedComments = [];
  for (const comment of comments) {
    const absPath = path.join(workDir, comment.path);
    let fileContent = '';
    try {
      fileContent = await api.getFileContext(absPath, comment.line || 1, 20);
    } catch (e) {
      console.log(`  ⚠ Could not read ${comment.path}: ${e.message}`);
    }
    const fileDiff = sliceFileDiff(prDiff, comment.path);
    enrichedComments.push({
      id: comment.id,
      discussion_id: comment.discussion_id,
      path: comment.path,
      line: comment.line,
      body: comment.body,
      user: comment.user,
      url: comment.url,
      fileContent,
      fileDiff,
      absPath
    });
  }

  const context = {
    prUrl,
    owner,
    repo,
    prNumber,
    checkoutDir: workDir,
    status,
    prDiff,
    comments: enrichedComments
  };

  await writeContext(path.join(scratchDir(prNumber), 'context.json'), context);
  console.log(`\n✓ collect 完成。Claude 读取 context.json, 生成 fixes.json 后运行 --apply。`);
  console.log(`  Context: ${path.join(scratchDir(prNumber), 'context.json')}`);
}

/**
 * --apply: read fixes.json, apply to checkout, reply, commit --amend
 */
async function runApply(prUrl, options = {}) {
  console.log('\n🔧 GitCode PR Repair --apply\n');

  const config = loadConfig();
  if (process.env.GITCODE_TOKEN && !config.gitcode?.token) {
    config.gitcode = config.gitcode || {};
    config.gitcode.token = process.env.GITCODE_TOKEN;
  }

  const api = new GitCodeAPIRepair(config);
  const { owner, repo, prNumber } = api.parsePRUrl(prUrl);
  const workDir = checkoutDir(owner, repo, prNumber);

  if (!fs.existsSync(workDir)) {
    throw new Error(`Checkout dir not found: ${workDir}. Run --collect first.`);
  }
  console.log(`  Work dir: ${workDir}`);

  const fixesPath = path.join(scratchDir(prNumber), 'fixes.json');
  const { fixes } = readFixes(fixesPath);
  console.log(`  Loaded ${fixes.length} fix(es)`);

  // Get xauth_token for nested replies
  let xauthToken = null;
  if (!options.dryRun) {
    try {
      const xauthExtractorPath = path.join(__dirname, 'xauth-extractor.js');
      const { getXauthToken } = require(xauthExtractorPath);
      xauthToken = await getXauthToken();
      console.log(`  ${xauthToken ? '✓' : '⚠'} xauth_token ${xauthToken ? 'ready' : 'missing (replies will be standalone)'}`);
    } catch (error) {
      console.log(`  ⚠ xauth setup failed: ${error.message}`);
    }
  }

  const results = [];
  let anyChanges = false;

  for (let i = 0; i < fixes.length; i++) {
    const fix = fixes[i];
    console.log(`\n[${i + 1}/${fixes.length}] ${fix.filePath} (action: ${fix.action})`);

    try {
      const fullPath = path.join(workDir, fix.filePath);

      if (fix.action === 'patch') {
        await applyFix(fullPath, fix.originalCode, fix.fixedCode);
        anyChanges = true;
      } else if (fix.action === 'deleteLines') {
        await deleteSpecificLines(fullPath, fix.deleteLines);
        anyChanges = true;
      } else if (fix.action === 'revert') {
        await revertFileChanges(fullPath, workDir);
        anyChanges = true;
      } else if (fix.action === 'replyOnly') {
        console.log('  (reply only, no file change)');
      } else {
        console.log(`  ⚠ Unknown action: ${fix.action}, skipping`);
        continue;
      }

      if (!options.dryRun && fix.replyBody) {
        const replyResult = await api.replyToComment(prNumber, fix.commentId, fix.replyBody, {
          discussion_id: fix.discussion_id,
          xauth_token: xauthToken
        });
        console.log(`  ✓ Replied to comment #${fix.commentId}`);
        results.push({
          file: fix.filePath,
          action: fix.action,
          url: replyResult?.html_url || fix.url || ''
        });
      } else if (options.dryRun) {
        console.log('  (dry-run: skipped reply)');
        results.push({ file: fix.filePath, action: fix.action, url: '(dry-run)' });
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      results.push({ file: fix.filePath, action: fix.action, error: error.message });
    }
  }

  // Commit with amend
  if (anyChanges && !options.dryRun) {
    console.log('\n📦 提交修复 / Committing...');
    await commitFixes(workDir);
  } else if (options.dryRun) {
    console.log('\n(dry-run: skipped git commit --amend)');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 修复汇总 / Fix Summary');
  console.log('='.repeat(60));
  console.log(`  Total fixes: ${results.length}`);
  console.log(`  Succeeded: ${results.filter(r => !r.error).length}`);
  console.log(`  Failed: ${results.filter(r => r.error).length}`);
  if (options.dryRun) console.log('  Mode: dry-run (no commit, no reply)');
  console.log(`  PR: https://gitcode.com/${owner}/${repo}/pulls/${prNumber}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main dispatcher
 */
async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const prUrl = args[1];
  const dryRun = args.includes('--dry-run');

  if (!mode || !prUrl || !prUrl.startsWith('http')) {
    console.log('Usage:');
    console.log('  node repair-pr.js --collect <PR_URL>');
    console.log('  node repair-pr.js --apply <PR_URL> [--dry-run]');
    process.exit(1);
  }

  try {
    if (mode === '--collect') {
      await runCollect(prUrl);
    } else if (mode === '--apply') {
      await runApply(prUrl, { dryRun });
    } else {
      console.error(`Unknown mode: ${mode}. Use --collect or --apply.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCollect, runApply, loadConfig, checkoutDir, scratchDir };

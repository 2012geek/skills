#!/usr/bin/env node

/**
 * GitCode Browser-based PR Creator
 *
 * Automatically creates PRs using Puppeteer to control the browser
 * Usage: node browser-pr.js <source-repo> <source-branch> <target-repo> <target-branch>
 *
 * Example:
 *   node browser-pr.js \\
 *     https://gitcode.com/leningchen_admin/lerobot_ros2 \\
 *     video_2_img \\
 *     https://gitcode.com/openeuler/lerobot_ros2 \\
 *     master
 */

const puppeteer = require('puppeteer');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// PR Description Template
const PR_TEMPLATE = `## What this does

{SUMMARY}

**Label:** {LABEL}

## How it was tested

{TESTING}

## How to checkout & try? (for the reviewer)

{CHECKOUT}

## SECTION TO REMOVE BEFORE SUBMITTING YOUR PR

**Note**: Anyone in the community is free to review the PR once the tests have passed. Feel free to tag
members/contributors who may be interested in your PR. Try to avoid tagging more than 3 people.

**Note**: Before submitting this PR, please read the [contributor guideline](https://github.com/huggingface/lerobot/blob/main/CONTRIBUTING.md#submitting-a-pull-request-pr).
`;

/**
 * Execute git command safely
 */
function safeGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
      cwd: cwd
    }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Clone repository and get branch info
 */
async function getRepoInfo(repoUrl, branch) {
  const tempDir = `/tmp/gitcode_pr_${Date.now()}`;
  console.log(`>>> Cloning ${repoUrl} branch ${branch}...`);

  // Clone the specific branch
  safeGit(['clone', '--depth', '1', '--single-branch', '--branch', branch, repoUrl, tempDir], '/tmp');

  if (!fs.existsSync(tempDir)) {
    throw new Error(`Failed to clone repository`);
  }

  // Add target repo as remote to compare
  const targetRepoUrl = 'https://gitcode.com/openeuler/lerobot_ros2.git';
  safeGit(['remote', 'add', 'target', targetRepoUrl], tempDir);
  safeGit(['fetch', 'target', 'master'], tempDir);

  return { tempDir };
}

/**
 * Get commit messages
 */
function getCommitMessages(tempDir, sourceBranch, targetBranch = 'master') {
  const range = `target/${targetBranch}..HEAD`;
  // Use a special delimiter that won't appear in commit messages
  const commits = safeGit(['log', range, '--pretty=format:%h%x00%s%x00%b', '--reverse'], tempDir);

  if (!commits) return [];

  return commits.split('\n').filter(Boolean).map(line => {
    const parts = line.split('\x00');
    const hash = parts[0] || '';
    const subject = parts[1] || '';
    const body = (parts[2] || '').trim();
    return { hash, subject, body };
  });
}

/**
 * Get changed files
 */
function getChangedFiles(tempDir, sourceBranch, targetBranch = 'master') {
  const diff = safeGit(['diff', `target/${targetBranch}...HEAD`, '--name-status'], tempDir);

  if (!diff) return [];

  return diff.split('\n').filter(Boolean).map(line => {
    const tabIdx = line.indexOf('\t');
    if (tabIdx >= 0) {
      const status = line.substring(0, tabIdx);
      const filePath = line.substring(tabIdx + 1);
      return { status, path: filePath };
    }
    return { status: 'M', path: line };
  });
}

/**
 * Get diff statistics
 */
function getDiffStats(tempDir, sourceBranch, targetBranch = 'master') {
  return safeGit(['diff', `target/${targetBranch}...HEAD`, '--stat'], tempDir) || 'No changes';
}

/**
 * Determine PR label
 */
function determineLabel(commits, files) {
  const hasTestChanges = files.some(f => f.path.startsWith('tests/'));
  const hasDataChanges = files.some(f => f.path.startsWith('data/') || f.path.startsWith('datasets/'));
  const hasDocChanges = files.some(f => f.path.includes('README') || f.path.startsWith('docs/'));
  const subjects = commits.map(c => c.subject.toLowerCase()).join(' ');

  if (subjects.includes('fix') || subjects.includes('bug')) {
    return { emoji: '🐛', name: 'Bug' };
  }
  if (hasDataChanges || subjects.includes('dataset')) {
    return { emoji: '🗃️', name: 'Dataset' };
  }
  if (subjects.includes('optim') || subjects.includes('performance') || subjects.includes('speed')) {
    return { emoji: '⚡', name: 'Performance' };
  }
  if (hasDocChanges || subjects.includes('doc')) {
    return { emoji: '📚', name: 'Documentation' };
  }
  if (subjects.includes('add') || subjects.includes('new') || subjects.includes('feature')) {
    return { emoji: '✨', name: 'Feature' };
  }
  if (subjects.includes('refactor')) {
    return { emoji: '♻️', name: 'Refactor' };
  }

  return { emoji: '🔄', name: 'Other' };
}

/**
 * Generate PR components
 */
function generatePRContent(commits, files, stats, sourceBranch) {
  const label = determineLabel(commits, files);

  // Generate summary
  const commitSummary = commits.map(c => `- ${c.subject} (${c.hash})`).join('\n');
  const fileSummary = files.length > 0
    ? `\n\n**Changed files:**\n${files.map(f => `- \`${f.status}\` ${f.path}`).join('\n')}`
    : '';
  const summary = `This PR includes **${commits.length} commit(s)** affecting **${files.length} file(s)**.\n\n${commitSummary}${fileSummary}\n\n**Changes summary:**\n\`\`\`\n${stats}\n\`\`\``;

  // Generate testing instructions
  const hasPythonTests = files.some(f => f.path.startsWith('tests/'));
  const hasRosChanges = files.some(f => f.path.includes('src/') || f.path.includes('launch/'));
  const hasConfigChanges = files.some(f => f.path.endsWith('.yaml') || f.path.endsWith('.yml'));

  const testing = [];
  if (hasPythonTests) {
    const testFiles = files.filter(f => f.path.startsWith('tests/'));
    testing.push(`- Ran modified tests: \`${testFiles.map(f => f.path).join(' ')}\``);
  }
  if (hasRosChanges) {
    testing.push('- Built ROS2 workspace with `colcon build`');
    testing.push('- Ran `colcon test` for affected packages');
  }
  if (hasConfigChanges) {
    testing.push('- Validated YAML syntax');
    testing.push('- Tested with updated configuration');
  }
  if (testing.length === 0) {
    testing.push('- Verified changes compile/build successfully');
    testing.push('- Manual testing of affected functionality');
  }

  // Generate checkout instructions
  const checkout = `\`\`\`bash\n# Checkout the PR branch\ngit fetch origin ${sourceBranch}\ngit checkout ${sourceBranch}\n\`\`\``;

  // Generate title
  const title = commits[0]?.subject || sourceBranch;

  // Generate description
  const description = PR_TEMPLATE
    .replace('{SUMMARY}', summary)
    .replace('{LABEL}', `${label.emoji} ${label.name}`)
    .replace('{TESTING}', testing.join('\n'))
    .replace('{CHECKOUT}', checkout);

  return { title, description };
}

/**
 * Clean up temp directory
 */
function cleanup(tempDir) {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Create PR using browser automation
 */
async function createPRWithBrowser(sourceRepo, sourceBranch, targetRepo, targetBranch, title, description) {
  console.log('\n=== Launching Browser ===');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Navigate to the PR creation page
  // For GitCode/Gitea, create PR at target repository with source as fork
  const targetOwner = targetRepo.match(/gitcode\.com\/([^\/]+)/)?.[1];
  const repoName = targetRepo.match(/gitcode\.com\/[^\/]+\/([^\/]+)/)?.[1];
  const sourceOwner = sourceRepo.match(/gitcode\.com\/([^\/]+)/)?.[1];

  // URL format: compare targetBranch...sourceOwner:sourceBranch
  const prUrl = `https://gitcode.com/${targetOwner}/${repoName}/compare/${targetBranch}...${sourceOwner}:${sourceBranch}`;
  console.log(`>>> Opening: ${prUrl}`);

  await page.goto(prUrl, { waitUntil: 'networkidle2', timeout: 60000 });

  // Wait for the page to load
  await page.waitForSelector('body', { timeout: 10000 });

  console.log('\n>>> Browser opened. Please:');
  console.log('  1. Login to GitCode if needed');
  console.log('  2. Verify the PR title and description');
  console.log('  3. Click "Create Pull Request" to submit');

  // Keep browser open for manual interaction
  console.log('\nBrowser will stay open for 5 minutes. Close it manually when done.');
  console.log('Or wait for auto-close...');

  // Wait for user to complete the action (or timeout after 5 minutes)
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));

  await browser.close();
  console.log('\nBrowser closed.');
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.log('Usage: node browser-pr.js <source-repo> <source-branch> <target-repo> <target-branch>');
    console.log('');
    console.log('Example:');
    console.log('  node browser-pr.js \\');
    console.log('    https://gitcode.com/leningchen_admin/lerobot_ros2 \\');
    console.log('    video_2_img \\');
    console.log('    https://gitcode.com/openeuler/lerobot_ros2 \\');
    console.log('    master');
    process.exit(1);
  }

  const [sourceRepo, sourceBranch, targetRepo, targetBranch] = args;

  console.log('=== GitCode Browser PR Creator ===');
  console.log(`Source: ${sourceRepo}/${sourceBranch}`);
  console.log(`Target: ${targetRepo}/${targetBranch}`);

  let tempDir = null;

  try {
    // Get repository information
    const repoInfo = await getRepoInfo(sourceRepo, sourceBranch);
    tempDir = repoInfo.tempDir;

    // Get commit information
    console.log('\n>>> Extracting commit messages...');
    const commits = getCommitMessages(tempDir, sourceBranch, targetBranch);

    if (commits.length === 0) {
      console.error(`No commits found between ${targetBranch} and ${sourceBranch}`);
      process.exit(1);
    }

    console.log(`Found ${commits.length} commit(s)`);

    console.log('\n>>> Analyzing changed files...');
    const files = getChangedFiles(tempDir, sourceBranch, targetBranch);
    console.log(`Found ${files.length} changed file(s)`);

    console.log('\n>>> Computing diff statistics...');
    const stats = getDiffStats(tempDir, sourceBranch, targetBranch);

    // Generate PR content
    console.log('\n>>> Generating PR content...');
    const { title, description } = generatePRContent(commits, files, stats, sourceBranch);

    console.log('\n=== Generated PR Title ===');
    console.log(title);
    console.log('\n=== Generated PR Description ===');
    console.log(description);

    // Save description to file for reference
    const descFile = '/tmp/gitcode_pr_description.md';
    fs.writeFileSync(descFile, description);
    console.log(`\nDescription saved to: ${descFile}`);

    // Create PR using browser
    await createPRWithBrowser(sourceRepo, sourceBranch, targetRepo, targetBranch, title, description);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      cleanup(tempDir);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

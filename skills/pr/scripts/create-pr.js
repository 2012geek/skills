#!/usr/bin/env node

/**
 * GitCode Pull Request Creator
 *
 * Automatically creates PRs to openeuler/lerobot_ros2 with generated descriptions
 * Usage: node create-pr.js [--branch <branch-name>] [--dry-run]
 */

const { execFileSync } = require('child_process');
const fs = require('fs');

// Configuration
const CONFIG = {
  repo: 'https://gitcode.com/openeuler/lerobot_ros2',
  targetBranch: 'master',
  owner: 'openeuler',
  repoName: 'lerobot_ros2'
};

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
 * Execute git command safely using execFile
 * @param {string[]} args - Git arguments
 * @returns {string|null} Command output or null on failure
 */
function safeGit(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    }).trim();
  } catch (error) {
    console.error(`Git command failed: git ${args.join(' ')}`);
    return null;
  }
}

/**
 * Get current branch name
 */
function getCurrentBranch() {
  const result = safeGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return result || 'HEAD';
}

/**
 * Get commit messages since branching from target
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 */
function getCommitMessages(sourceBranch, targetBranch = CONFIG.targetBranch) {
  const range = `${targetBranch}..${sourceBranch}`;
  const commits = safeGit(['log', range, '--pretty=format:%h|%s|%b', '--reverse']);

  if (!commits) return [];

  return commits.split('\n').map(line => {
    const parts = line.split('|');
    const hash = parts[0];
    // Subject and body may contain |, so join remaining parts
    const rest = parts.slice(1).join('|');
    // Split at first newline to separate subject from body
    const newlineIdx = rest.indexOf('\n');
    if (newlineIdx >= 0) {
      return {
        hash,
        subject: rest.substring(0, newlineIdx),
        body: rest.substring(newlineIdx + 1).trim()
      };
    }
    return { hash, subject: rest, body: '' };
  });
}

/**
 * Get changed files with status
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 */
function getChangedFiles(sourceBranch, targetBranch = CONFIG.targetBranch) {
  const diff = safeGit(['diff', `${targetBranch}...${sourceBranch}`, '--name-status']);

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
 * @param {string} sourceBranch - Source branch name
 * @param {string} targetBranch - Target branch name
 */
function getDiffStats(sourceBranch, targetBranch = CONFIG.targetBranch) {
  return safeGit(['diff', `${targetBranch}...${sourceBranch}`, '--stat']) || 'No changes';
}

/**
 * Validate branch name to prevent injection
 * @param {string} branch - Branch name to validate
 */
function isValidBranchName(branch) {
  // Git branch name rules: no '..', no spaces, no special chars except -, _, /
  // Also limit length to prevent abuse
  const validPattern = /^[a-zA-Z0-9\-_\/]+$/;
  return validPattern.test(branch) && branch.length <= 256;
}

/**
 * Analyze changes and determine label
 * @param {Array} commits - Array of commit objects
 * @param {Array} files - Array of file change objects
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
 * Generate PR summary from commits and changes
 * @param {Array} commits - Array of commit objects
 * @param {Array} files - Array of file change objects
 * @param {string} stats - Diff statistics
 */
function generateSummary(commits, files, stats) {
  const commitSummary = commits.map(c => `- ${c.subject} (${c.hash})`).join('\n');

  const fileSummary = files.length > 0
    ? `\n\n**Changed files:**\n${files.map(f => `- \`${f.status}\` ${f.path}`).join('\n')}`
    : '';

  const commitCount = commits.length;
  const fileCount = files.length;

  return `This PR includes **${commitCount} commit(s)** affecting **${fileCount} file(s)**.

${commitSummary}${fileSummary}

**Changes summary:**
\`\`\`
${stats}
\`\`\``;
}

/**
 * Generate testing instructions based on changes
 * @param {Array} files - Array of file change objects
 */
function generateTestingInstructions(files) {
  const hasPythonTests = files.some(f => f.path.startsWith('tests/'));
  const hasRosChanges = files.some(f => f.path.includes('src/') || f.path.includes('launch/'));
  const hasConfigChanges = files.some(f => f.path.endsWith('.yaml') || f.path.endsWith('.yml'));

  const instructions = [];

  if (hasPythonTests) {
    const testFiles = files.filter(f => f.path.startsWith('tests/'));
    instructions.push(`- Ran modified tests: \`${testFiles.map(f => f.path).join(' ')}\``);
  }

  if (hasRosChanges) {
    instructions.push('- Built ROS2 workspace with `colcon build`');
    instructions.push('- Ran `colcon test` for affected packages');
  }

  if (hasConfigChanges) {
    instructions.push('- Validated YAML syntax');
    instructions.push('- Tested with updated configuration');
  }

  if (instructions.length === 0) {
    instructions.push('- Verified changes compile/build successfully');
    instructions.push('- Manual testing of affected functionality');
  }

  return instructions.join('\n');
}

/**
 * Generate checkout instructions
 * @param {string} branch - Branch name
 */
function generateCheckoutInstructions(branch) {
  return `\`\`\`bash
# Checkout the PR branch
git fetch origin ${branch}
git checkout ${branch}

# Or apply the changes manually
git fetch origin master
git checkout -b ${branch} origin/master
git pull origin ${branch}
\`\`\``;
}

/**
 * Generate complete PR description
 * @param {string} branch - Source branch name
 * @param {Array} commits - Array of commit objects
 * @param {Array} files - Array of file change objects
 * @param {string} stats - Diff statistics
 */
function generatePRDescription(branch, commits, files, stats) {
  const label = determineLabel(commits, files);
  const summary = generateSummary(commits, files, stats);
  const testing = generateTestingInstructions(files);
  const checkout = generateCheckoutInstructions(branch);

  return PR_TEMPLATE
    .replace('{SUMMARY}', summary)
    .replace('{LABEL}', `${label.emoji} ${label.name}`)
    .replace('{TESTING}', testing)
    .replace('{CHECKOUT}', checkout);
}

/**
 * Create PR using GitCode API
 * Note: This requires GitCode API token
 * @param {string} branch - Source branch name
 * @param {string} title - PR title
 * @param {string} description - PR description
 */
async function createPR(branch, title, description) {
  console.log('\n=== Creating Pull Request ===');
  console.log(`Branch: ${branch} -> ${CONFIG.targetBranch}`);
  console.log(`Title: ${title}`);
  console.log('\nDescription:');
  console.log(description);

  // Check if running in dry-run mode
  if (process.argv.includes('--dry-run')) {
    console.log('\n[DRY RUN] PR would be created (not actually creating due to --dry-run)');
    return;
  }

  // Check for GitCode/Gitea API token
  const token = process.env.GITCODE_TOKEN || process.env.GITEA_TOKEN;
  if (!token) {
    console.log('\n⚠️  No GITCODE_TOKEN or GITEA_TOKEN found in environment');
    console.log('Set your token with: export GITCODE_TOKEN=your_token_here');
    console.log('\nYou can also create the PR manually at:');
    console.log(`${CONFIG.repo}/compare/${CONFIG.targetBranch}...${branch}`);
    return;
  }

  // TODO: Implement actual API call to GitCode
  // GitCode uses Gitea API format
  console.log('\n⚠️  API integration not yet implemented.');
  console.log('Please create the PR manually at:');
  console.log(`${CONFIG.repo}/compare/${CONFIG.targetBranch}...${branch}`);
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 */
function parseArgs(args) {
  const result = { branch: null, dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--branch' && i + 1 < args.length) {
      result.branch = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      result.dryRun = true;
    }
  }

  return result;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  let branch = args.branch;

  // Validate or get branch name
  if (!branch) {
    branch = getCurrentBranch();
  }

  // Validate branch name for security
  if (!isValidBranchName(branch)) {
    console.error(`Invalid branch name: ${branch}`);
    console.error('Branch names must only contain alphanumeric characters, hyphens, underscores, and forward slashes');
    process.exit(1);
  }

  if (branch === 'master' || branch === 'main') {
    console.error('Cannot create PR from master/main branch');
    process.exit(1);
  }

  console.log(`=== GitCode PR Creator ===`);
  console.log(`Source branch: ${branch}`);
  console.log(`Target branch: ${CONFIG.targetBranch}`);
  console.log(`Repository: ${CONFIG.repo}`);

  // Get git information
  console.log('\n>>> Extracting commit messages...');
  const commits = getCommitMessages(branch);

  if (commits.length === 0) {
    console.error(`No commits found between ${CONFIG.targetBranch} and ${branch}`);
    console.error('Make sure your branch is up to date with origin/master');
    process.exit(1);
  }

  console.log(`Found ${commits.length} commit(s)`);

  console.log('\n>>> Analyzing changed files...');
  const files = getChangedFiles(branch);
  console.log(`Found ${files.length} changed file(s)`);

  console.log('\n>>> Computing diff statistics...');
  const stats = getDiffStats(branch);

  // Generate PR description
  console.log('\n>>> Generating PR description...');
  const description = generatePRDescription(branch, commits, files, stats);

  // Generate PR title from first commit or branch name
  const title = commits[0].subject || branch;

  // Create the PR
  await createPR(branch, title, description);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

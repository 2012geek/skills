#!/usr/bin/env node

/**
 * GitCode PR Description Applier
 *
 * Usage:
 *   node scripts/apply-pr-description.js <PR_URL_OR_NUMBER> [--dry-run]
 *
 * Stage 2 of the two-stage `pr` skill. Reads
 * `.tmp/pr-<N>/pr-description.json` (written by Claude after it generated
 * a description from `pr-context.json`) and calls GitCode's PATCH
 * `/pulls/<N>` endpoint to update the PR title and/or body.
 *
 * JSON contract (pr-description.json):
 *   {
 *     "prNumber": 4,
 *     "title": "new title or null to keep",        // optional
 *     "body": "new PR body markdown or null",      // optional
 *     "summary": "one-line summary for the CLI",   // optional, for logging
 *     "generatedAt": "2026-07-22T...",
 *     "model": "claude code (skill)"               // optional
 *   }
 *
 * No Anthropic API key needed — Claude IS the LLM in the skill flow.
 * Configuration: `GITCODE_TOKEN` env var or `gitcode.token` in
 * `gitcode-review.config.json` / `config.json` in project root.
 */

const path = require('path');
const fs = require('fs');

const libPath = path.join(__dirname, '..', '..', 'lib');
const { GitCodeAPI } = require(path.join(libPath, 'gitcode-sdk', 'gitcode-api.js'));

const collectModule = require(path.join(__dirname, 'collect-pr-context.js'));
const { resolveProjectRoot, scratchDir } = collectModule;
const { loadConfig, parsePR } = collectModule;

/**
 * Read pr-description.json from the scratch dir.
 */
function readDescription(prNumber) {
  const descPath = path.join(scratchDir(prNumber), 'pr-description.json');
  if (!fs.existsSync(descPath)) {
    throw new Error(
      `pr-description.json not found at ${descPath}. ` +
      `Run the skill step 2 first: Claude reads pr-context.json, generates a description, writes pr-description.json.`
    );
  }
  return JSON.parse(fs.readFileSync(descPath, 'utf-8'));
}

/**
 * Stage 2: apply the description to the PR via GitCode PATCH.
 */
async function runApply(prInput, options = {}) {
  console.log('\n🔧 GitCode PR Description Applier\n');

  const config = loadConfig();
  const api = new GitCodeAPI(config);

  const { owner, repo, prNumber } = parsePR(prInput, config.gitcode.owner, config.gitcode.repo);
  console.log(`  Owner: ${owner}, Repo: ${repo}, PR: ${prNumber}`);

  // Override config owner/repo from URL if URL was passed
  config.gitcode.owner = owner;
  config.gitcode.repo = repo;
  api.config = config.gitcode;

  const desc = readDescription(prNumber);

  if (desc.prNumber && desc.prNumber !== prNumber) {
    throw new Error(
      `pr-description.json prNumber=${desc.prNumber} does not match CLI PR=${prNumber}. ` +
      `Re-run collect-pr-context.js for PR ${prNumber} first.`
    );
  }

  const newTitle = desc.title != null ? desc.title : null;
  const newBody = desc.body != null ? desc.body : null;

  if (newTitle === null && newBody === null) {
    console.log('⚠ No title or body in pr-description.json — nothing to apply.');
    return;
  }

  // Preview
  console.log('\n📋 描述预览 / Description preview:');
  if (desc.summary) console.log(`  Summary: ${desc.summary}`);
  if (newTitle !== null) console.log(`  New title: ${newTitle}`);
  if (newBody !== null) {
    const preview = newBody.length > 200 ? newBody.substring(0, 200) + '... (truncated)' : newBody;
    console.log(`  New body (${newBody.length} chars):\n${'  '.repeat(1)}---\n${preview.split('\n').map(l => '    ' + l).join('\n')}\n  ---`);
  }

  if (options.dryRun) {
    console.log('\n(dry-run: skipped PATCH request)');
    console.log(`  PR: https://gitcode.com/${owner}/${repo}/pull/${prNumber}`);
    return;
  }

  const payload = {};
  if (newTitle !== null) payload.title = newTitle;
  if (newBody !== null) payload.body = newBody;

  console.log('\n🚀 更新 PR / Updating PR...');
  const result = await api.updatePullRequest(prNumber, payload);

  console.log(`\n✓ Updated PR: https://gitcode.com/${owner}/${repo}/pull/${prNumber}`);
  if (result && result.url) {
    console.log(`  API url: ${result.url}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const filtered = args.filter(a => a !== '--dry-run');

  const prInput = filtered[0];
  if (!prInput) {
    console.log('Usage:');
    console.log('  node apply-pr-description.js <PR_URL_OR_NUMBER> [--dry-run]');
    process.exit(1);
  }

  try {
    await runApply(prInput, { dryRun });
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runApply, readDescription };

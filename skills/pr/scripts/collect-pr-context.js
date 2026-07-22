#!/usr/bin/env node

/**
 * GitCode PR Context Collector
 *
 * Usage:
 *   node scripts/collect-pr-context.js <PR_URL_OR_NUMBER> [--max-file-bytes 20000]
 *
 * Stage 1 of the two-stage `pr` skill. Pulls PR metadata + commits + files
 * (with patches) + file contents and writes `.tmp/pr-<N>/pr-context.json`.
 * The LLM (Claude, running the skill) reads that JSON, generates a semantic
 * PR description from the real diff, and writes `pr-description.json` for
 * `apply-pr-description.js` to push back to GitCode.
 *
 * No Anthropic API key needed — Claude IS the LLM in the skill flow.
 * Configuration: `GITCODE_TOKEN` env var or `gitcode.token` in
 * `gitcode-review.config.json` / `config.json` in project root.
 */

const path = require('path');
const fs = require('fs');

// Resolve the SDK via the skill's local lib stub (skills/<skill>/lib/
// gitcode-api.js re-exports from ../../../lib/gitcode-sdk/). This matches
// the convention used by code-review-repair and survives plugin cache
// relocations.
const libPath = path.join(__dirname, '..', 'lib');
const { GitCodeAPI } = require(path.join(libPath, 'gitcode-api.js'));

/**
 * Resolve the project root directory (where `.tmp/` and config files should
 * land), independent of the caller's cwd. Mirrors repair-pr.js logic.
 *
 * Strategy (first match wins):
 *   1. Walk up from cwd looking for `gitcode-review.config.json`
 *      (project-specific file created by /gitcode-tools-setup).
 *   2. Walk up looking for `.git` (ad-hoc review before setup).
 *   3. If neither marker is found AND cwd is inside the plugin cache, fail.
 *   4. Otherwise return cwd (ad-hoc project root with no git).
 */
function resolveProjectRoot() {
  const STRONG_MARKER = 'gitcode-review.config.json';
  const WEAK_MARKER = '.git';
  const cwd = process.cwd();
  const root = path.parse(cwd).root;

  let cur = cwd;
  while (cur !== root) {
    if (fs.existsSync(path.join(cur, STRONG_MARKER))) return cur;
    cur = path.dirname(cur);
  }
  if (fs.existsSync(path.join(root, STRONG_MARKER))) return root;

  cur = cwd;
  while (cur !== root) {
    if (fs.existsSync(path.join(cur, WEAK_MARKER))) return cur;
    cur = path.dirname(cur);
  }
  if (fs.existsSync(path.join(root, WEAK_MARKER))) return root;

  if (isInsidePluginCache(cwd)) {
    throw new Error(
      `Could not resolve project root: no gitcode-review.config.json or .git ` +
      `found walking up from ${cwd}, and cwd is inside the plugin cache. ` +
      `Run this skill from your project root, or run /gitcode-tools-setup first.`
    );
  }

  return cwd;
}

function isInsidePluginCache(dir) {
  return dir.replace(/\\/g, '/').includes('/.claude/plugins/cache/');
}

function scratchDir(prNumber) {
  return path.join(resolveProjectRoot(), '.tmp', 'pr', `pr-${prNumber}`);
}

/**
 * Load config from project root. Precedence:
 *   1. GITCODE_TOKEN env var (highest)
 *   2. gitcode-review.config.json (gitcode.token / gitcode.owner / gitcode.repo)
 *   3. config.json (legacy)
 *   4. gitcode-review.config.json without token but with owner/repo + env GITCODE_TOKEN
 *
 * The `gitcode.baseUrl` field is optional (defaults to https://api.gitcode.com
 * via the SDK's own fallback when undefined — but we set it explicitly to
 * match code-review-repair behavior).
 */
function loadConfig() {
  const root = resolveProjectRoot();
  const configPaths = [
    path.join(root, 'gitcode-review.config.json'),
    path.join(root, 'config.json'),
  ];

  let fileConfig = null;
  let loadedFrom = null;
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        loadedFrom = configPath;
        break;
      } catch (e) {
        console.log(`⚠ Could not parse ${configPath}: ${e.message}`);
      }
    }
  }

  const config = fileConfig || {};
  if (loadedFrom) {
    console.log(`✓ Loaded config from: ${loadedFrom}`);
  }

  // Env var overrides / fills in missing token
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

  if (!config.gitcode?.token) {
    throw new Error(
      'Missing gitcode.token. Set GITCODE_TOKEN env var or add `gitcode.token` ' +
      'to gitcode-review.config.json in the project root.'
    );
  }

  // Default baseUrl
  if (!config.gitcode.baseUrl) {
    config.gitcode.baseUrl = 'https://api.gitcode.com';
  }

  return config;
}

/**
 * Parse PR URL or number into {owner, repo, prNumber}.
 * Accepts:
 *   - https://gitcode.com/<owner>/<repo>/pull/<N>
 *   - https://gitcode.com/<owner>/<repo>/pulls/<N>
 *   - <N> (uses owner/repo from config)
 */
function parsePR(input, configOwner, configRepo) {
  if (/^\d+$/.test(input.trim())) {
    if (!configOwner || !configRepo) {
      throw new Error(
        `PR number "${input}" given but owner/repo not in config. ` +
        `Either pass a full PR URL or set gitcode.owner/gitcode.repo in config.`
      );
    }
    return { owner: configOwner, repo: configRepo, prNumber: parseInt(input.trim(), 10) };
  }

  const match = input.match(/gitcode\.com\/([^\/]+)\/([^\/]+)\/pulls?\/(\d+)/);
  if (!match) {
    throw new Error(
      `Could not parse PR URL/number: "${input}". ` +
      `Expected https://gitcode.com/<owner>/<repo>/pull/<N> or a bare PR number.`
    );
  }
  return { owner: match[1], repo: match[2].replace(/\.git$/, ''), prNumber: parseInt(match[3], 10) };
}

/**
 * Fetch file content from the PR's source branch head. Used to give Claude
 * the full file context (not just the patch) for files that changed.
 *
 * Returns the decoded text content, or '' on any error (non-text file, 404,
 * binary, etc.). Truncates to maxBytes to keep context.json bounded.
 */
async function fetchFileContent(api, filePath, ref, maxBytes) {
  try {
    const raw = await api.getFileContent(filePath, ref);
    if (!raw) return '';
    return raw.length > maxBytes
      ? raw.substring(0, maxBytes) + `\n... (truncated at ${maxBytes} bytes)`
      : raw;
  } catch (e) {
    return '';
  }
}

/**
 * Stage 1: collect PR context, write pr-context.json.
 */
async function runCollect(prInput, options = {}) {
  console.log('\n🔧 GitCode PR Context Collector\n');

  const config = loadConfig();
  const api = new GitCodeAPI(config);

  const { owner, repo, prNumber } = parsePR(prInput, config.gitcode.owner, config.gitcode.repo);
  console.log(`  Owner: ${owner}, Repo: ${repo}, PR: ${prNumber}`);

  // Override config owner/repo from URL if URL was passed (URL is strongest signal)
  config.gitcode.owner = owner;
  config.gitcode.repo = repo;
  api.config = config.gitcode;

  console.log('\n📋 获取 PR 元数据 / Fetching PR metadata...');
  const prMeta = await api.getPullRequest(prNumber);
  console.log(`  Title: ${prMeta.title || '(none)'}`);
  console.log(`  State: ${prMeta.state || '?'}, Draft: ${prMeta.draft ? 'yes' : 'no'}`);
  console.log(`  Head: ${prMeta.head?.repo?.full_name || '?'}:${prMeta.head?.ref || '?'}`);
  console.log(`  Base: ${prMeta.base?.repo?.full_name || '?'}:${prMeta.base?.ref || '?'}`);

  console.log('\n📦 获取 PR 提交 / Fetching PR commits...');
  const commits = await api.getPRCommits(prNumber);
  console.log(`  Found ${commits.length} commit(s)`);
  const commitSummary = commits.map(c => ({
    sha: c.sha?.substring(0, 10),
    message: (c.commit?.message || c.commit?.subject || '').split('\n')[0],
    author: c.commit?.author?.name || c.author?.login || '?',
    date: c.commit?.author?.date || c.commit?.committer?.date || ''
  }));

  console.log('\n📂 获取 PR 文件改动 / Fetching PR files...');
  const files = await api.getPRFiles(prNumber);
  console.log(`  Found ${files.length} changed file(s)`);

  const headRef = prMeta.head?.sha || prMeta.head?.ref || 'HEAD';
  const maxFileBytes = options.maxFileBytes || 20000;

  console.log('\n📝 抓取文件内容 / Fetching file contents...');
  const enrichedFiles = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const patch = f.patch || '';
    // f.patch is a STRING in the v5 API response, not an object
    const patchText = typeof patch === 'string' ? patch : (patch?.diff || '');

    // Fetch full file content from source branch head (empty for deleted files)
    let content = '';
    if (f.status !== 'removed') {
      content = await fetchFileContent(api, f.filename, headRef, maxFileBytes);
    }

    enrichedFiles.push({
      filename: f.filename,
      status: f.status,           // added/modified/removed/renamed
      additions: f.additions,
      deletions: f.deletions,
      changes: f.changes,
      patch: patchText,
      content
    });

    process.stdout.write(`  [${i + 1}/${files.length}] ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})\n`);
  }

  const context = {
    prUrl: `https://gitcode.com/${owner}/${repo}/pull/${prNumber}`,
    owner,
    repo,
    prNumber,
    collectedAt: new Date().toISOString(),
    prMetadata: {
      title: prMeta.title || '',
      body: prMeta.body || '',
      state: prMeta.state || '',
      draft: !!prMeta.draft,
      labels: (prMeta.labels || []).map(l => l.name || l).filter(Boolean),
      headRepo: prMeta.head?.repo?.full_name || '',
      headBranch: prMeta.head?.ref || '',
      headSha: prMeta.head?.sha || '',
      baseRepo: prMeta.base?.repo?.full_name || '',
      baseBranch: prMeta.base?.ref || '',
      baseSha: prMeta.base?.sha || '',
      user: prMeta.user?.login || prMeta.user?.name || '',
      createdAt: prMeta.created_at || '',
      updatedAt: prMeta.updated_at || '',
      mergedAt: prMeta.merged_at || '',
      mergeable: prMeta.mergeable,
      changesCount: prMeta.changed_files || files.length,
      additionsCount: prMeta.additions,
      deletionsCount: prMeta.deletions
    },
    commits: commitSummary,
    files: enrichedFiles,
    stats: {
      fileCount: files.length,
      totalAdditions: files.reduce((s, f) => s + (f.additions || 0), 0),
      totalDeletions: files.reduce((s, f) => s + (f.deletions || 0), 0)
    }
  };

  const outDir = scratchDir(prNumber);
  const ctxPath = path.join(outDir, 'pr-context.json');
  await fs.promises.mkdir(outDir, { recursive: true });
  await fs.promises.writeFile(ctxPath, JSON.stringify(context, null, 2), 'utf-8');

  console.log(`\n✓ Wrote context: ${ctxPath}`);
  console.log(`  PR: ${context.prUrl}`);
  console.log(`  Files: ${context.stats.fileCount} (+${context.stats.totalAdditions}/-${context.stats.totalDeletions})`);
  console.log(`  Commits: ${context.commits.length}`);
  console.log(`\n下一步 / Next step:`);
  console.log(`  Claude reads ${ctxPath}, generates a description from the real diff,`);
  console.log(`  writes ${path.join(outDir, 'pr-description.json')}, then run:`);
  console.log(`  node ${path.basename(__filename).replace('.js', '')} --apply ${prNumber}  # (or use apply-pr-description.js)`);
}

/**
 * Main dispatcher. Currently only `--collect` mode (no arg flags) is
 * supported — apply is in apply-pr-description.js.
 */
async function main() {
  const args = process.argv.slice(2);

  let maxFileBytes = 20000;
  const filtered = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max-file-bytes' && i + 1 < args.length) {
      maxFileBytes = parseInt(args[i + 1], 10);
      i++;
    } else {
      filtered.push(args[i]);
    }
  }

  const prInput = filtered[0];
  if (!prInput) {
    console.log('Usage:');
    console.log('  node collect-pr-context.js <PR_URL_OR_NUMBER> [--max-file-bytes 20000]');
    process.exit(1);
  }

  try {
    await runCollect(prInput, { maxFileBytes });
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { runCollect, parsePR, resolveProjectRoot, scratchDir, loadConfig };

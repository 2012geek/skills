const path = require('path');
const fs = require('fs');

/**
 * Resolve the project root directory (where `.tmp/` and config files should
 * land), independent of the caller's cwd.
 *
 * Strategy (first match wins):
 *   1. Walk up from `process.cwd()` looking for `gitcode-review.config.json`
 *      (the strongest signal — a project-specific file created by
 *      /gitcode-tools-setup). Handles the normal case where the user
 *      invokes the skill from the project root or a subdir.
 *   2. Walk up looking for `.git`. Handles projects without a
 *      gitcode-review.config.json (e.g. ad-hoc review before setup).
 *   3. If neither marker is found AND cwd is inside the plugin cache, fail
 *      loudly. This happens when Claude (or a user) `cd`'d into the plugin
 *      dir for dep install and forgot to `cd` back. Better to fail than to
 *      silently pollute the plugin cache with scratch files.
 *   4. Otherwise return `process.cwd()` — the caller really is in an ad-hoc
 *      project root with no git, and that's fine.
 *
 * Shared by `pr`, `code-review-repair`, and `bot` skills so they all agree
 * on where the project root is.
 */
function resolveProjectRoot() {
  const STRONG_MARKER = 'gitcode-review.config.json';
  const WEAK_MARKER = '.git';
  const cwd = process.cwd();
  const root = path.parse(cwd).root;

  // 1. Strong marker first.
  let cur = cwd;
  while (cur !== root) {
    if (fs.existsSync(path.join(cur, STRONG_MARKER))) return cur;
    cur = path.dirname(cur);
  }
  if (fs.existsSync(path.join(root, STRONG_MARKER))) return root;

  // 2. Weak marker (.git).
  cur = cwd;
  while (cur !== root) {
    if (fs.existsSync(path.join(cur, WEAK_MARKER))) return cur;
    cur = path.dirname(cur);
  }
  if (fs.existsSync(path.join(root, WEAK_MARKER))) return root;

  // 3. No marker found — if cwd is inside the plugin cache, refuse.
  if (isInsidePluginCache(cwd)) {
    throw new Error(
      `Could not resolve project root: no gitcode-review.config.json or .git ` +
      `found walking up from ${cwd}, and cwd is inside the plugin cache. ` +
      `Run this skill from your project root (the dir containing ` +
      `gitcode-review.config.json), or run /gitcode-tools-setup first.`
    );
  }

  // 4. Ad-hoc: trust cwd.
  return cwd;
}

/**
 * True if the given directory is inside the gitcode-tools plugin cache.
 * Used to reject the "no marker found" case when cwd is polluted.
 */
function isInsidePluginCache(dir) {
  const norm = dir.replace(/\\/g, '/');
  return norm.includes('/.claude/plugins/cache/');
}

module.exports = { resolveProjectRoot, isInsidePluginCache };

#!/usr/bin/env node
/**
 * Validate context.json shape produced by --collect.
 * Run: node skills/code-review-repair/tests/test-context-shape.js
 */
const assert = require('assert');
const path = require('path');

const ctx = {
  prUrl: 'https://gitcode.com/openeuler/vla-factory/pull/4',
  owner: 'openeuler',
  repo: 'vla-factory',
  prNumber: 4,
  checkoutDir: '/home/nice/.cache/gitcode-repair/openeuler-vla-factory-4',
  status: { resolved: 0, total: 2, unresolved: 2, method: 'scrape' },
  prDiff: 'diff --git a/foo.py b/foo.py\n',
  comments: [{
    id: 123456,
    discussion_id: 'abc-uuid',
    path: 'foo.py',
    line: 87,
    body: 'reviewer text',
    user: 'reviewer',
    url: 'https://gitcode.com/.../pull/4#discussion-abc-uuid',
    fileContent: 'line 87 context\n',
    fileDiff: 'diff --git a/foo.py\n',
    absPath: '/home/nice/.cache/gitcode-repair/openeuler-vla-factory-4/foo.py'
  }]
};

assert.strictEqual(typeof ctx.prUrl, 'string');
assert.ok(ctx.prUrl.startsWith('http'));
assert.strictEqual(typeof ctx.owner, 'string');
assert.strictEqual(typeof ctx.repo, 'string');
assert.strictEqual(typeof ctx.prNumber, 'number');
assert.strictEqual(typeof ctx.checkoutDir, 'string');
assert.ok(ctx.checkoutDir.length > 0);

assert(ctx.status);
assert.strictEqual(typeof ctx.status.resolved, 'number');
assert.strictEqual(typeof ctx.status.total, 'number');
assert.strictEqual(typeof ctx.status.unresolved, 'number');
assert.strictEqual(ctx.status.unresolved, ctx.status.total - ctx.status.resolved);

assert(Array.isArray(ctx.comments));
for (const c of ctx.comments) {
  assert.strictEqual(typeof c.id, 'number');
  assert.strictEqual(typeof c.path, 'string');
  assert.strictEqual(typeof c.body, 'string');
  assert.strictEqual(typeof c.fileContent, 'string');
  assert.strictEqual(typeof c.fileDiff, 'string');
  assert.strictEqual(typeof c.absPath, 'string');
  assert.ok(c.absPath.startsWith('/'), 'absPath should be absolute');
}

console.log('✓ test-context-shape passed');

#!/usr/bin/env node
/**
 * Validate _parseInlineComments parses the comments_by_line response shape.
 * Run: node skills/code-review-repair/tests/test-get-inline-comments.js
 *
 * Fixture is a real captured response from PR #4's diffs page — 1 file
 * entry with 2 unresolved DiffNote notes (lines 6 and 125 of SKILL.md).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { GitCodeAPI } = require('../../../lib/gitcode-sdk/gitcode-api.js');

const fixturePath = path.join(__dirname, 'fixtures', 'comments_by_line.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

// Instantiate SDK — only need _parseInlineComments (no network calls)
const api = new GitCodeAPI({
  gitcode: { owner: 'openeuler', repo: 'vla-factory', token: 'fake' }
});

const notes = api._parseInlineComments(fixture);

assert.strictEqual(Array.isArray(notes), true, 'result should be an array');
assert.strictEqual(notes.length, 2, `expected 2 notes, got ${notes.length}`);

// Verify normalized shape
for (const note of notes) {
  assert.strictEqual(typeof note.id, 'number', `note.id should be number, got ${typeof note.id}`);
  assert.strictEqual(typeof note.discussion_id, 'string', 'discussion_id should be string');
  assert.strictEqual(typeof note.path, 'string', 'path should be string');
  assert.ok(note.path.length > 0, 'path should be non-empty');
  assert.strictEqual(typeof note.body, 'string', 'body should be string');
  assert.strictEqual(typeof note.user, 'string', 'user should be string');
  assert.strictEqual(typeof note.resolved, 'boolean', 'resolved should be boolean');
}

// Spot-check expected values from PR #4
assert.strictEqual(notes[0].path, '.claude/skills/install-gitcode-review/SKILL.md');
assert.strictEqual(notes[0].line, 6);
assert.strictEqual(notes[0].resolved, false, 'note 0 should be unresolved');
assert.strictEqual(notes[0].user, 'leningchen_admin');

assert.strictEqual(notes[1].line, 125);
assert.strictEqual(notes[1].resolved, false, 'note 1 should be unresolved');

// getUnresolvedInlineComments wrapper filters by resolved flag
// (can't call it here without puppeteer — but the filter is trivial,
// we verify the parser shape and trust the wrapper)

// Empty / invalid input
assert.strictEqual(api._parseInlineComments(null).length, 0);
assert.strictEqual(api._parseInlineComments([]).length, 0);
assert.strictEqual(api._parseInlineComments({}).length, 0);

console.log('✓ test-get-inline-comments passed');

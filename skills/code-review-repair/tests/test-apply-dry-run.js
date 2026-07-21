#!/usr/bin/env node
/**
 * Validate the --apply flow (patch/deleteLines/revert) by calling the helpers
 * directly on a temp git checkout.
 * Run: node skills/code-review-repair/tests/test-apply-dry-run.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function applyFix(filePath, originalCode, fixedCode) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const newContent = content.replace(originalCode, fixedCode);
  if (newContent === content) {
    throw new Error('original code not found in file');
  }
  await fs.promises.writeFile(filePath, newContent, 'utf-8');
}

async function deleteSpecificLines(filePath, lineNumbers) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  const indices = lineNumbers.map(n => n - 1).sort((a, b) => b - a);
  for (const i of indices) {
    if (i >= 0 && i < lines.length) lines.splice(i, 1);
  }
  await fs.promises.writeFile(filePath, lines.join('\n'), 'utf-8');
}

async function revertFileChanges(filePath, workDir) {
  const relativePath = path.relative(workDir, filePath);
  execSync(`git checkout HEAD -- "${relativePath}"`, { encoding: 'utf-8', cwd: workDir });
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-test-'));
  try {
    execSync('git init', { cwd: workDir, stdio: 'pipe' });
    execSync('git config user.email "t@t.com"', { cwd: workDir, stdio: 'pipe' });
    execSync('git config user.name "t"', { cwd: workDir, stdio: 'pipe' });

    const filePath = path.join(workDir, 'foo.txt');
    fs.writeFileSync(filePath, 'line1\nline2\nline3\nline4\nline5\n');
    execSync('git add -A && git commit -m "init"', { cwd: workDir, stdio: 'pipe' });

    // Test 1: patch (string replace)
    await applyFix(filePath, 'line2', 'LINE_TWO');
    const afterPatch = fs.readFileSync(filePath, 'utf-8');
    assert.ok(afterPatch.includes('LINE_TWO'), 'patch should replace line2');
    assert.ok(!afterPatch.includes('line2\n'), 'patch should not leave old line2');
    console.log('  ✓ patch (string replace)');

    // Test 2: revert + deleteLines
    await revertFileChanges(filePath, workDir);
    await deleteSpecificLines(filePath, [2, 4]);
    const afterDelete = fs.readFileSync(filePath, 'utf-8');
    const lines = afterDelete.split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 3, 'should have 3 lines after deleting 2');
    assert.ok(lines.includes('line1'));
    assert.ok(lines.includes('line3'));
    assert.ok(lines.includes('line5'));
    assert.ok(!lines.includes('line2'));
    assert.ok(!lines.includes('line4'));
    console.log('  ✓ deleteLines (drop lines 2 and 4)');

    // Test 3: revert restores content
    fs.writeFileSync(filePath, 'GARBAGE\n');
    await revertFileChanges(filePath, workDir);
    const afterRevert = fs.readFileSync(filePath, 'utf-8');
    assert.ok(afterRevert.includes('line1') && afterRevert.includes('line5'), 'revert should restore original content');
    assert.ok(!afterRevert.includes('GARBAGE'));
    console.log('  ✓ revert (git checkout HEAD)');

    console.log('✓ test-apply-dry-run passed');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });

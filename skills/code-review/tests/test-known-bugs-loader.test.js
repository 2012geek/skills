const path = require('path');
const { loadKnownBugsIndex, loadKnownBugFile, filterRelevance } = require('../lib/known-bugs-loader');

const KB_DIR = path.join(__dirname, '..', 'known-bugs');

describe('known-bugs loader', () => {
  test('loadKnownBugsIndex returns parsed entries from INDEX.md', () => {
    const entries = loadKnownBugsIndex(KB_DIR);
    expect(entries.length).toBeGreaterThan(0);
    const assertEntry = entries.find(e => e.file === 'assert-vs-raise.md');
    expect(assertEntry).toBeDefined();
    expect(assertEntry.description).toMatch(/assert.*ValueError/i);
    expect(assertEntry.name).toBe('assert-vs-raise');
  });

  test('loadKnownBugFile returns full content for a known file', () => {
    const content = loadKnownBugFile(KB_DIR, 'assert-vs-raise.md');
    expect(content).toMatch(/# assert → ValueError migration/);
    expect(content).toMatch(/## Detection pattern/);
  });

  test('loadKnownBugFile throws for missing file', () => {
    expect(() => loadKnownBugFile(KB_DIR, 'nonexistent.md')).toThrow(/not found/);
  });

  test('filterRelevant returns only entries marked relevant', () => {
    const relevance = [
      { file: 'assert-vs-raise.md', relevant: true, reason: 'PR migrates assert' },
      { file: 'gitcode-api-position-bug.md', relevant: false, reason: 'PR does not touch GitCode API' },
    ];
    const relevant = filterRelevance(relevance);
    expect(relevant).toEqual([{ file: 'assert-vs-raise.md', relevant: true, reason: 'PR migrates assert' }]);
  });

  test('loadKnownBugsIndex handles empty INDEX.md gracefully', () => {
    const tmpDir = path.join(__dirname, 'fixtures', 'empty-kb-tmp');
    const fs = require('fs');
    fs.mkdirSync(path.join(tmpDir), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'INDEX.md'), '# known-bugs index\n\nNo entries yet.\n');
    expect(loadKnownBugsIndex(tmpDir)).toEqual([]);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

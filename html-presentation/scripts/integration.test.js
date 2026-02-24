/**
 * Integration Test for Intelligent Slide Layout Auto-Fixer
 *
 * End-to-end test of the full pipeline:
 * 1. Parse slides
 * 2. Analyze slides
 * 3. Transform with CSS
 * 4. Reconstruct markdown
 * 5. Create backup
 * 6. Write fixed file
 * 7. Generate report
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { processSlides } = require('./fix-layouts');
const { createBackup, restoreBackup } = require('./lib/backup-manager');

describe('Layout Fixer Integration Tests', () => {
  let tempDir;
  let testFilePath;
  let originalContent;

  beforeAll(async () => {
    // Create temporary directory
    tempDir = path.join(os.tmpdir(), `integration-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  beforeEach(async () => {
    // Create test file with various slide types
    originalContent = `---
layout: center
class: text-center
---

# Presentation Title

Subtitle here

---

## Two Column Layout

<div class="grid grid-cols-2 gap-4">
<div>

### Left Column

Content here

</div>
<div>

### Right Column

Content here

</div>
</div>

---

## Code Slide

\`\`\`javascript
function example() {
  console.log("Hello");
}
\`\`\`

\`\`\`javascript
function another() {
  return "World";
}
\`\`\`

---

## Simple Slide

Regular content here

- List item 1
- List item 2
- List item 3

---

## Image Slide

<img src="test1.png" />
<img src="test2.png" />

`;

    testFilePath = path.join(tempDir, 'test-slides.md');
    await fs.writeFile(testFilePath, originalContent, 'utf8');
  });

  afterEach(async () => {
    // Clean up test file and backups
    try {
      const files = await fs.readdir(tempDir);
      for (const file of files) {
        await fs.unlink(path.join(tempDir, file));
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  test('should process full pipeline successfully', async () => {
    // Process slides (dry run to avoid modifying original yet)
    const report = await processSlides(testFilePath, { dryRun: true, verbose: false });

    // Verify report structure
    expect(report).toBeDefined();
    expect(report.summary).toBeDefined();
    expect(report.summary.totalSlides).toBe(5);
    expect(report.summary.cssInjected).toBe(true);
    expect(report.changes).toHaveLength(5);

    // Verify changes (first slide with H1 is title)
    expect(report.changes[0].type).toBe('title');
    expect(report.changes[0].layout).toBe('center');
    // Second slide has grid but no grid-template-columns, so it's simple
    expect(report.changes[1].type).toBe('simple');
    expect(report.changes[2].type).toBe('code');
  });

  test('should create backup and modify file', async () => {
    // Get original file content
    const beforeContent = await fs.readFile(testFilePath, 'utf8');

    // Process slides (not dry run)
    const report = await processSlides(testFilePath, { dryRun: false, verbose: false });

    // Read modified file
    const afterContent = await fs.readFile(testFilePath, 'utf8');

    // Content should be different (CSS injected)
    expect(afterContent).not.toBe(beforeContent);

    // Should contain CSS as <style> block in content (not in frontmatter)
    expect(afterContent).toMatch(/<style>/);
    expect(afterContent).toContain('.slidev-layout');

    // Should have backup file
    const dir = path.dirname(testFilePath);
    const files = await fs.readdir(dir);
    const backups = files.filter(f => f.includes('.backup-'));
    expect(backups.length).toBe(1);
  });

  test('should generate report file', async () => {
    await processSlides(testFilePath, { dryRun: true, verbose: false });

    // Check report file exists
    const reportPath = `${testFilePath}.layout-fix-report.json`;
    const reportExists = await fs.access(reportPath).then(() => true).catch(() => false);
    expect(reportExists).toBe(true);

    // Read and verify report
    const reportContent = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportContent);

    expect(report.summary).toBeDefined();
    expect(report.changes).toBeDefined();
    expect(report.timestamp).toBeDefined();
  });

  test('should inject CSS into first slide', async () => {
    await processSlides(testFilePath, { dryRun: false, verbose: false });

    const content = await fs.readFile(testFilePath, 'utf8');

    // CSS should be injected as <style> block in content (not in frontmatter)
    expect(content).toMatch(/<style>/);

    // Should contain key CSS rules
    expect(content).toContain('--slide-max-width');
    expect(content).toContain('max-width: var(--slide-max-width)');
    expect(content).toContain('overflow-wrap: break-word');
  });

  test('should preserve slide structure', async () => {
    await processSlides(testFilePath, { dryRun: false, verbose: false });

    const content = await fs.readFile(testFilePath, 'utf8');

    // Should still have slide separators (5 slides = 4 separators, but frontmatter has --- too)
    const separatorCount = (content.match(/\n---\n/g) || []).length;
    expect(separatorCount).toBeGreaterThanOrEqual(4);

    // Should preserve frontmatter
    expect(content).toContain('layout: center');
    expect(content).toContain('class: text-center');

    // Should preserve content
    expect(content).toContain('Presentation Title');
    expect(content).toContain('Two Column Layout');
    expect(content).toContain('function example()');
  });

  test('should handle backup and restore cycle', async () => {
    const originalContent = await fs.readFile(testFilePath, 'utf8');

    // Create backup
    const backupPath = await createBackup(testFilePath);

    // Modify file
    await fs.writeFile(testFilePath, 'Modified content', 'utf8');

    let modifiedContent = await fs.readFile(testFilePath, 'utf8');
    expect(modifiedContent).toBe('Modified content');

    // Restore from backup
    await restoreBackup(backupPath, testFilePath);

    const restoredContent = await fs.readFile(testFilePath, 'utf8');
    expect(restoredContent).toBe(originalContent);
  });

  test('should detect different slide types correctly', async () => {
    const report = await processSlides(testFilePath, { dryRun: true, verbose: false });

    const types = report.changes.map(c => c.type);

    // First slide: title (H1 only, minimal content)
    expect(types[0]).toBe('title');

    // Second slide: simple (has grid-cols-2 but not grid-template-columns)
    expect(types[1]).toBe('simple');

    // Third slide: code (multiple code blocks)
    expect(types[2]).toBe('code');

    // Fourth slide: simple (default)
    expect(types[3]).toBe('simple');

    // Fifth slide: image (multiple images)
    expect(types[4]).toBe('image');
  });

  test('should handle file with no frontmatter', async () => {
    const simpleContent = `# Simple Slide

Content here

---

# Another Slide

More content

`;

    await fs.writeFile(testFilePath, simpleContent, 'utf8');

    const report = await processSlides(testFilePath, { dryRun: true, verbose: false });

    expect(report.summary.totalSlides).toBe(2);
    expect(report.changes).toHaveLength(2);
  });

  test('should handle file with single slide', async () => {
    const singleSlide = `---
layout: center
---

# Only Slide

Content`;

    await fs.writeFile(testFilePath, singleSlide, 'utf8');

    const report = await processSlides(testFilePath, { dryRun: true, verbose: false });

    expect(report.summary.totalSlides).toBe(1);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0].type).toBe('title');
  });

  test('should preserve special characters in content', async () => {
    const specialContent = `---
layout: center
---

# Special Characters

> Quotes: "double" and 'single'
> Code: \`backticks\`
> Chinese: 你好世界
> Emoji: 🎉

\`\`\`javascript
const test = "special";
console.log(\`Template \${literal}\`);
\`\`\`

`;

    await fs.writeFile(testFilePath, specialContent, 'utf8');

    await processSlides(testFilePath, { dryRun: false, verbose: false });

    const result = await fs.readFile(testFilePath, 'utf8');

    expect(result).toContain('"double"');
    expect(result).toContain("'single'");
    expect(result).toContain('`backticks`');
    expect(result).toContain('你好世界');
    expect(result).toContain('🎉');
    expect(result).toContain('const test = "special"');
  });

  test('should create timestamped report', async () => {
    const before = Date.now();
    await processSlides(testFilePath, { dryRun: true, verbose: false });
    const after = Date.now();

    const reportPath = `${testFilePath}.layout-fix-report.json`;
    const reportContent = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportContent);

    const reportTime = new Date(report.timestamp).getTime();
    expect(reportTime).toBeGreaterThanOrEqual(before);
    expect(reportTime).toBeLessThanOrEqual(after);
  });
});

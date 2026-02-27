const { SlideGenerator } = require('../../core/slide-generator');
const fs = require('fs').promises;

describe('SlideGenerator V2', () => {
  afterEach(async () => {
    // Clean up test files
    try {
      await fs.unlink('/tmp/test-content.md');
    } catch (e) {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink('/tmp/test-content.slides.md');
    } catch (e) {
      // Ignore if file doesn't exist
    }
    try {
      await fs.unlink('/tmp/test-code.md');
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink('/tmp/test-code.slides.md');
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink('/tmp/test-lists.md');
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink('/tmp/test-lists.slides.md');
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink('/tmp/test-frontmatter.md');
    } catch (e) {
      // Ignore
    }
    try {
      await fs.unlink('/tmp/test-frontmatter.slides.md');
    } catch (e) {
      // Ignore
    }
  });

  test('should preserve content in generated slides', async () => {
    const generator = new SlideGenerator();
    const testPath = '/tmp/test-content.md';

    await fs.writeFile(testPath, '# Title\n\n## Slide 1\n\nSome content here\n\nMore text\n\n## Slide 2\n\nCode example\n```js\nconst x = 1;\n```\n');

    const result = await generator.generate(testPath, { output: '/tmp/test-content.slides.md' });

    expect(result.success).toBe(true);

    const output = await fs.readFile('/tmp/test-content.slides.md', 'utf-8');
    expect(output).toContain('Some content here');
    expect(output).toContain('More text');
    expect(output).toContain('const x = 1;');
  });

  test('should handle markdown with code blocks', async () => {
    const generator = new SlideGenerator();
    const testPath = '/tmp/test-code.md';

    await fs.writeFile(testPath, '# Presentation\n\n## Code Demo\n\n```javascript\nfunction hello() {\n  console.log("Hello, World!");\n}\n```\n\nThis is a function.\n');

    const result = await generator.generate(testPath, { output: '/tmp/test-code.slides.md' });

    expect(result.success).toBe(true);

    const output = await fs.readFile('/tmp/test-code.slides.md', 'utf-8');
    expect(output).toContain('function hello()');
    expect(output).toContain('console.log');
    expect(output).toContain('This is a function');
  });

  test('should handle markdown with lists', async () => {
    const generator = new SlideGenerator();
    const testPath = '/tmp/test-lists.md';

    await fs.writeFile(testPath, '# Title\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Summary\n\nBullet points work!\n');

    const result = await generator.generate(testPath, { output: '/tmp/test-lists.slides.md' });

    expect(result.success).toBe(true);

    const output = await fs.readFile('/tmp/test-lists.slides.md', 'utf-8');
    expect(output).toContain('Feature 1');
    expect(output).toContain('Feature 2');
    expect(output).toContain('Feature 3');
    expect(output).toContain('Bullet points work');
  });

  test('should generate valid Slidev frontmatter', async () => {
    const generator = new SlideGenerator({ theme: 'seriph', title: 'Test Presentation', author: 'Test Author' });
    const testPath = '/tmp/test-frontmatter.md';

    await fs.writeFile(testPath, '# Title\n\n## Slide\n\nContent here\n');

    const result = await generator.generate(testPath, { output: '/tmp/test-frontmatter.slides.md' });

    expect(result.success).toBe(true);

    const output = await fs.readFile('/tmp/test-frontmatter.slides.md', 'utf-8');
    expect(output).toContain('theme: seriph');
    expect(output).toContain('title: Test Presentation');
    expect(output).toContain('author: Test Author');
    expect(output).toContain('highlighter: shiki');
    expect(output).toContain('transition: slide-left');
  });
});

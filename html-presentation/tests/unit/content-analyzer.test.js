const { ContentAnalyzer } = require('../../lib/content-analyzer');
const fs = require('fs');
const path = require('path');

describe('ContentAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new ContentAnalyzer();
  });

  describe('analyze', () => {
    test('should analyze markdown file and return structure', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/simple.md');
      const result = await analyzer.analyze(fixturePath);

      expect(result).toHaveProperty('structure');
      expect(result).toHaveProperty('contentTypes');
      expect(result).toHaveProperty('metrics');
      expect(result).toHaveProperty('recommendations');
    });

    test('should extract heading hierarchy', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/simple.md');
      const result = await analyzer.analyze(fixturePath);

      expect(result.structure.sections).toBeDefined();
      expect(Array.isArray(result.structure.sections)).toBe(true);
    });
  });

  describe('classifyContent', () => {
    test('should classify code-heavy content', () => {
      const section = {
        content: '```javascript\nconsole.log("hello");\n```',
        raw: '```javascript\nconsole.log("hello");\n```'
      };

      const type = analyzer.classifyContent(section);
      expect(type).toHaveProperty('code', expect.any(Number));
      expect(type.code).toBeGreaterThan(0.5);
    });

    test('should classify image-heavy content', () => {
      const section = {
        content: '![Image 1](test.png)\n![Image 2](test.png)',
        raw: '![Image 1](test.png)\n![Image 2](test.png)'
      };

      const type = analyzer.classifyContent(section);
      expect(type).toHaveProperty('image', expect.any(Number));
    });
  });

  describe('calculateMetrics', () => {
    test('should calculate word count', () => {
      const content = 'This is a test with some words';
      const metrics = analyzer.calculateMetrics(content);

      expect(metrics.wordCount).toBe(7);
    });

    test('should count code blocks', () => {
      const content = '```js\ntest\n```\n```py\ntest\n```';
      const metrics = analyzer.calculateMetrics(content);

      expect(metrics.codeBlockCount).toBe(2);
    });

    test('should count images', () => {
      const content = '![img1](test.png) ![img2](test.jpg)';
      const metrics = analyzer.calculateMetrics(content);

      expect(metrics.imageCount).toBe(2);
    });
  });

  describe('detectHierarchy', () => {
    test('should detect heading levels', () => {
      const markdown = '# H1\n## H2\n### H3\n#### H4';
      const structure = analyzer.detectHierarchy(markdown);

      expect(structure.maxLevel).toBe(4);
      expect(structure.headings).toHaveLength(4);
    });

    test('should group content by sections', () => {
      const markdown = '# Section 1\nContent 1\n## Section 2\nContent 2';
      const structure = analyzer.detectHierarchy(markdown);

      expect(structure.sections).toBeDefined();
      expect(structure.sections.length).toBeGreaterThan(0);
    });
  });
});

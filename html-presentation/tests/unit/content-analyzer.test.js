const { ContentAnalyzer } = require('../../core/content-analyzer');

describe('ContentAnalyzer', () => {
  test('should parse simple markdown with one slide', async () => {
    const analyzer = new ContentAnalyzer();
    const markdown = '# Title\n\nContent here';
    const result = await analyzer.analyze(markdown);

    expect(result.totalSlides).toBe(1);
    expect(result.sections).toHaveLength(1);
  });

  test('should calculate code ratio correctly', () => {
    const analyzer = new ContentAnalyzer();
    const markdown = 'Text\n```js\nconst x = 1;\n```\nMore text';
    const result = analyzer.analyzeSlide(markdown);

    // Text: "Text" (4) + "More text" (9) = 13 chars
    // Code: "const x = 1;" (11) chars
    // Total: 24 chars
    // Code ratio: 11/24 ≈ 0.46, Text ratio: 13/24 ≈ 0.54
    expect(result.codeRatio).toBeCloseTo(0.46, 1);
    expect(result.textRatio).toBeCloseTo(0.54, 1);
  });

  test('should detect images in markdown', () => {
    const analyzer = new ContentAnalyzer();
    const markdown = '![alt](image.png)\n![](another.jpg)';
    const result = analyzer.analyzeSlide(markdown);

    expect(result.images).toHaveLength(2);
    expect(result.hasImages).toBe(true);
  });

  test('should identify tables', () => {
    const analyzer = new ContentAnalyzer();
    const markdown = '| a | b |\n|---|---|\n| 1 | 2 |';
    const result = analyzer.analyzeSlide(markdown);

    expect(result.hasTables).toBe(true);
  });

  test('should throw error for null input', () => {
    const analyzer = new ContentAnalyzer();
    expect(() => analyzer.analyzeSlide(null)).toThrow('Markdown must be a non-empty string');
  });

  test('should throw error for undefined input', () => {
    const analyzer = new ContentAnalyzer();
    expect(() => analyzer.analyzeSlide(undefined)).toThrow('Markdown must be a non-empty string');
  });

  test('should throw error for non-string input', () => {
    const analyzer = new ContentAnalyzer();
    expect(() => analyzer.analyzeSlide(123)).toThrow('Markdown must be a non-empty string');
  });
});

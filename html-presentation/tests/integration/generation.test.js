const { SlideGenerator } = require('../../lib');
const path = require('path');

describe('Presentation Generation Integration', () => {
  let generator;

  beforeEach(() => {
    generator = new SlideGenerator();
  });

  test('should generate complete presentation from markdown', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/simple.md');
    const result = await generator.generate(fixturePath, {
      theme: 'seriph',
      title: 'Integration Test'
    });

    expect(result.frontmatter).toBeDefined();
    expect(result.slides).toBeDefined();
    expect(result.slides.length).toBeGreaterThan(0);
  });

  test('should generate valid Slidev markdown', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/with-code.md');
    const presentation = await generator.generate(fixturePath);
    const markdown = generator.renderToMarkdown(presentation);

    expect(markdown).toContain('---');
    expect(markdown).toContain('theme:');
    expect(markdown).toContain('#');
  });

  test('should handle mixed content correctly', async () => {
    const fixturePath = path.join(__dirname, '../fixtures/mixed-content.md');
    const result = await generator.generate(fixturePath);

    expect(result.slides.length).toBeGreaterThan(0);

    const slidesWithLayouts = result.slides.filter(s => s.layout && s.layout !== 'default');
    expect(slidesWithLayouts.length).toBeGreaterThan(0);
  });
});

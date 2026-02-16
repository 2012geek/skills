const { SlideGenerator } = require('../../lib/slide-generator');
const path = require('path');

describe('SlideGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new SlideGenerator();
  });

  describe('generate', () => {
    test('should generate Slidev markdown from analysis', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/simple.md');
      const result = await generator.generate(fixturePath, {
        theme: 'seriph',
        title: 'Test Presentation'
      });

      expect(result).toHaveProperty('frontmatter');
      expect(result).toHaveProperty('slides');
      expect(result.slides.length).toBeGreaterThan(0);
    });

    test('should include layout directives in slides', async () => {
      const fixturePath = path.join(__dirname, '../fixtures/with-code.md');
      const result = await generator.generate(fixturePath, {
        theme: 'seriph'
      });

      const hasLayout = result.slides.some(slide =>
        slide.layout && slide.layout !== 'default'
      );
      expect(hasLayout).toBe(true);
    });
  });

  describe('generateFrontmatter', () => {
    test('should generate valid frontmatter', () => {
      const frontmatter = generator.generateFrontmatter({
        theme: 'seriph',
        title: 'Test Title',
        author: 'Test Author'
      });

      expect(frontmatter).toContain('theme: seriph');
      expect(frontmatter).toContain('title: Test Title');
      expect(frontmatter).toContain('author: Test Author');
    });

    test('should include theme-specific config', () => {
      const frontmatter = generator.generateFrontmatter({
        theme: 'dracula'
      });

      expect(frontmatter).toContain('lineNumbers: true');
    });
  });

  describe('splitIntoSlides', () => {
    test('should split content into slide-sized chunks', () => {
      const sections = [
        { title: 'Section 1', content: 'Content 1', level: 1 },
        { title: 'Section 2', content: 'Content 2', level: 2 },
        { title: 'Section 3', content: 'Content 3', level: 2 }
      ];

      const slides = generator.splitIntoSlides(sections);

      expect(Array.isArray(slides)).toBe(true);
      expect(slides.length).toBeGreaterThan(0);
    });

    test('should handle empty sections', () => {
      const slides = generator.splitIntoSlides([]);

      expect(slides).toEqual([]);
    });
  });
});

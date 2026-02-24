const { transformSlides } = require('../layout-transformer');
const { generateSmartCSS } = require('../css-generator');

// Mock the css-generator module
jest.mock('../css-generator');

describe('Layout Transformer', () => {
  beforeEach(() => {
    // Clear mock before each test
    jest.clearAllMocks();
  });

  describe('Basic transformation', () => {
    test('should transform an array of slides', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title'
        },
        {
          index: 1,
          frontmatter: {},
          content: '## Content'
        }
      ];

      generateSmartCSS.mockReturnValue('/* Generated CSS */');

      const result = transformSlides(slides);

      expect(result).toHaveLength(2);
      expect(result[0].index).toBe(0);
      expect(result[1].index).toBe(1);
    });

    test('should handle empty array', () => {
      const result = transformSlides([]);

      expect(result).toEqual([]);
    });
  });

  describe('CSS injection', () => {
    test('should inject CSS into first slide content as style block', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title'
        },
        {
          index: 1,
          frontmatter: {},
          content: '## Content'
        }
      ];

      const mockCSS = '/* Generated CSS */';
      generateSmartCSS.mockReturnValue(mockCSS);

      const result = transformSlides(slides);

      expect(result[0].content).toContain('<style>');
      expect(result[0].content).toContain(mockCSS);
      expect(result[0].content).toContain('</style>');
      expect(result[0].content).toContain('# Title');
    });

    test('should not inject CSS into subsequent slides', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title'
        },
        {
          index: 1,
          frontmatter: {},
          content: '## Content'
        }
      ];

      generateSmartCSS.mockReturnValue('/* Generated CSS */');

      const result = transformSlides(slides);

      expect(result[1].content).toBe('## Content');
      expect(result[1].content).not.toContain('<style>');
    });

    test('should inject CSS as style block at beginning of content', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title\n\nSubtitle'
        }
      ];

      const mockCSS = '/* Generated CSS */';
      generateSmartCSS.mockReturnValue(mockCSS);

      const result = transformSlides(slides);

      expect(result[0].content).toMatch(/^<style>\n\/\* Generated CSS \*\/\n<\/style>\n\n# Title\n\nSubtitle$/);
    });
  });

  describe('Frontmatter preservation', () => {
    test('should preserve existing frontmatter without modification', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center',
            transition: 'slide-left'
          },
          content: '# Title'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].frontmatter).toHaveProperty('layout', 'center');
      expect(result[0].frontmatter).toHaveProperty('transition', 'slide-left');
      expect(result[0].frontmatter).not.toHaveProperty('style');
    });

    test('should not modify frontmatter when injecting CSS', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].frontmatter).not.toHaveProperty('style');
    });

    test('should preserve rawFrontmatter when injecting CSS', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center'
          },
          content: '# Title',
          rawFrontmatter: '---\nlayout: center\n---'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0]).toHaveProperty('rawFrontmatter', '---\nlayout: center\n---');
    });
  });

  describe('Layout application', () => {
    test('should use default layout when no layout specified', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      transformSlides(slides);

      expect(generateSmartCSS).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'default'
      }));
    });

    test('should preserve custom layout from frontmatter', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center'
          },
          content: '# Title'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      transformSlides(slides);

      expect(generateSmartCSS).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'center'
      }));
    });

    test('should handle two-col layout', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'two-col'
          },
          content: '## Comparison'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      transformSlides(slides);

      expect(generateSmartCSS).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'two-col'
      }));
    });
  });

  describe('CSS generator integration', () => {
    test('should pass slides array to analyze for layout', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title',
          layout: 'center'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      transformSlides(slides);

      expect(generateSmartCSS).toHaveBeenCalled();
    });

    test('should use slide analysis when no frontmatter layout', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title',
          layout: 'center'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      transformSlides(slides);

      expect(generateSmartCSS).toHaveBeenCalledWith(expect.objectContaining({
        layout: 'center'
      }));
    });
  });

  describe('Content preservation', () => {
    test('should preserve original content in first slide (plus CSS)', () => {
      const originalContent = '# Title\n\nThis is content';
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: originalContent
        }
      ];

      const mockCSS = '/* CSS */';
      generateSmartCSS.mockReturnValue(mockCSS);

      const result = transformSlides(slides);

      expect(result[0].content).toContain(originalContent);
    });

    test('should preserve content in all slides', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# First Slide'
        },
        {
          index: 1,
          frontmatter: {},
          content: '## Second Slide'
        },
        {
          index: 2,
          frontmatter: {},
          content: '### Third Slide'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].content).toContain('First Slide');
      expect(result[1].content).toContain('Second Slide');
      expect(result[2].content).toContain('Third Slide');
    });
  });

  describe('Index preservation', () => {
    test('should preserve slide indices', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '# Slide 0' },
        { index: 1, frontmatter: {}, content: '# Slide 1' },
        { index: 2, frontmatter: {}, content: '# Slide 2' }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].index).toBe(0);
      expect(result[1].index).toBe(1);
      expect(result[2].index).toBe(2);
    });
  });

  describe('Edge cases', () => {
    test('should handle single slide', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '# Only Slide' }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result).toHaveLength(1);
      expect(result[0].content).toContain('<style>');
      expect(result[0].content).toContain('/* CSS */');
      expect(result[0].content).toContain('</style>');
    });

    test('should handle slides with complex frontmatter', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center',
            transition: 'slide-left',
            theme: 'seriph',
            background: 'https://example.com/bg.png'
          },
          content: '# Complex Slide'
        }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].frontmatter).toHaveProperty('layout', 'center');
      expect(result[0].frontmatter).toHaveProperty('transition', 'slide-left');
      expect(result[0].frontmatter).toHaveProperty('theme', 'seriph');
      expect(result[0].frontmatter).toHaveProperty('background', 'https://example.com/bg.png');
      expect(result[0].frontmatter).not.toHaveProperty('style');
      expect(result[0].content).toContain('<style>');
      expect(result[0].content).toContain('/* CSS */');
    });

    test('should handle slide with no content', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '' }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].content).toContain('<style>');
      expect(result[0].content).toContain('/* CSS */');
      expect(result[0].content).toContain('</style>');
    });

    test('should handle slide with only whitespace content', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '   \n\n  ' }
      ];

      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(slides);

      expect(result[0].content).toContain('<style>');
      expect(result[0].content).toContain('/* CSS */');
      expect(result[0].content).toContain('</style>');
      expect(result[0].content).toContain('   \n\n  ');
    });
  });

  describe('Error handling', () => {
    test('should handle null slides gracefully', () => {
      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(null);

      expect(result).toEqual([]);
    });

    test('should handle undefined slides gracefully', () => {
      generateSmartCSS.mockReturnValue('/* CSS */');

      const result = transformSlides(undefined);

      expect(result).toEqual([]);
    });
  });
});

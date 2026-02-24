const { reconstructMarkdown } = require('../markdown-reconstructor');

describe('Markdown Reconstructor', () => {
  describe('Basic reconstruction', () => {
    test('should reconstruct single slide without frontmatter', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# Title Slide'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toBe('# Title Slide');
    });

    test('should reconstruct single slide with frontmatter', () => {
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

      const result = reconstructMarkdown(slides);

      expect(result).toContain('---');
      expect(result).toContain('layout: center');
      expect(result).toContain('transition: slide-left');
      expect(result).toContain('# Title');
    });

    test('should reconstruct multiple slides', () => {
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
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('# First Slide');
      expect(result).toContain('---');
      expect(result).toContain('## Second Slide');
    });
  });

  describe('Frontmatter formatting', () => {
    test('should format frontmatter with proper delimiters', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toMatch(/^---\nlayout: center\n---\n\n# Title$/);
    });

    test('should handle multiple frontmatter properties', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'default',
            transition: 'fade',
            theme: 'seriph',
            class: 'lead'
          },
          content: '## Content'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('layout: default');
      expect(result).toContain('transition: fade');
      expect(result).toContain('theme: seriph');
      expect(result).toContain('class: lead');
    });

    test('should skip frontmatter section if empty', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '# No Frontmatter'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).not.toContain('---');
      expect(result).toBe('# No Frontmatter');
    });
  });

  describe('Multi-line YAML values', () => {
    test('should handle multi-line values in frontmatter', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            description: 'This is a long description\nthat spans multiple lines\nfor testing purposes'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('description: |');
      expect(result).toContain('This is a long description');
      expect(result).toContain('that spans multiple lines');
    });

    test('should handle mixed single and multi-line values', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center',
            description: 'Line 1\nLine 2\nLine 3',
            transition: 'slide-left'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('layout: center');
      expect(result).toContain('description: |');
      expect(result).toContain('transition: slide-left');
    });
  });

  describe('Slide separator formatting', () => {
    test('should use --- as separator', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '# Slide 1' },
        { index: 1, frontmatter: {}, content: '# Slide 2' }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('# Slide 1\n---\n# Slide 2');
    });

    test('should separate multiple slides correctly', () => {
      const slides = [
        { index: 0, frontmatter: {}, content: '# Slide 1' },
        { index: 1, frontmatter: {}, content: '## Slide 2' },
        { index: 2, frontmatter: {}, content: '### Slide 3' }
      ];

      const result = reconstructMarkdown(slides);
      const parts = result.split('\n---\n');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toContain('Slide 1');
      expect(parts[1]).toContain('Slide 2');
      expect(parts[2]).toContain('Slide 3');
    });
  });

  describe('Content preservation', () => {
    test('should preserve complex markdown content', () => {
      const content = `# Title

## Subtitle

- List item 1
- List item 2

\`\`\`javascript
function test() {
  return true;
}
\`\`\`

<img src="test.png"/>`;

      const slides = [{ index: 0, frontmatter: {}, content }];

      const result = reconstructMarkdown(slides);

      expect(result).toBe(content);
    });

    test('should preserve HTML in content', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '<div class="custom">HTML Content</div>'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('<div class="custom">');
      expect(result).toContain('HTML Content');
    });

    test('should preserve inline code', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: 'Use `inline code` for emphasis'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('`inline code`');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty slides array', () => {
      const result = reconstructMarkdown([]);

      expect(result).toBe('');
    });

    test('should handle slide with empty content', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: ''
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toBe('');
    });

    test('should handle slide with whitespace-only content', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: '   \n\n  '
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toBe('   \n\n  ');
    });

    test('should handle slide with style blocks', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {},
          content: `<style>
body { color: red; }
</style>

# Title`
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('<style>');
      expect(result).toContain('body { color: red; }');
      expect(result).toContain('# Title');
    });
  });

  describe('Special characters in frontmatter', () => {
    test('should handle colons in frontmatter values', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            url: 'https://example.com:8080'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('url: https://example.com:8080');
    });

    test('should handle special YAML characters', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            title: 'Title with "quotes"',
            description: 'Text with [brackets] and {braces}'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('Title with "quotes"');
      expect(result).toContain('[brackets]');
      expect(result).toContain('{braces}');
    });
  });

  describe('Index handling', () => {
    test('should ignore slide index in reconstruction', () => {
      const slides = [
        { index: 5, frontmatter: {}, content: '# First' },
        { index: 10, frontmatter: {}, content: '# Second' }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).not.toContain('5');
      expect(result).not.toContain('10');
      expect(result).toContain('# First');
      expect(result).toContain('# Second');
    });
  });

  describe('YAML value formatting', () => {
    test('should format boolean values correctly', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            enable: true,
            disable: false
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('enable: true');
      expect(result).toContain('disable: false');
    });

    test('should format numeric values correctly', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            count: 42,
            ratio: 3.14
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('count: 42');
      expect(result).toContain('ratio: 3.14');
    });
  });

  describe('Real-world scenarios', () => {
    test('should reconstruct complete presentation', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center',
            theme: 'seriph'
          },
          content: '# Presentation Title\n\nSubtitle here'
        },
        {
          index: 1,
          frontmatter: {},
          content: '## First Section\n\nContent here'
        },
        {
          index: 2,
          frontmatter: {
            layout: 'two-col'
          },
          content: '## Comparison\n\nColumn 1\n\nColumn 2'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('---');
      expect(result).toContain('layout: center');
      expect(result).toContain('theme: seriph');
      expect(result).toContain('Presentation Title');
      expect(result).toContain('First Section');
      expect(result).toContain('layout: two-col');
      expect(result).toContain('Comparison');

      // Verify structure
      expect(result).toMatch(/^---/); // First slide has frontmatter
      expect(result).toContain('---\n## First Section');
      expect(result).toContain('## Comparison');
    });
  });

  describe('rawFrontmatter preservation', () => {
    test('should prioritize rawFrontmatter over parsed frontmatter object', () => {
      const slides = [
        {
          index: 0,
          rawFrontmatter: 'layout: center\ntransition: slide-left\nenabled: true\nconfig:\n  nested: value',
          frontmatter: {
            // This is the parsed version which may lose type info
            layout: 'center',
            enabled: 'true', // String instead of boolean
            config: '[object Object]' // Flattened object
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      // Should use rawFrontmatter, not the parsed frontmatter
      expect(result).toContain('layout: center');
      expect(result).toContain('transition: slide-left');
      expect(result).toContain('enabled: true'); // From rawFrontmatter
      expect(result).toContain('config:\n  nested: value'); // Nested structure preserved
      expect(result).not.toContain('[object Object]'); // Should not use parsed version
    });

    test('should fall back to parsed frontmatter when rawFrontmatter is missing', () => {
      const slides = [
        {
          index: 0,
          frontmatter: {
            layout: 'center',
            enabled: false,
            count: 42
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      expect(result).toContain('layout: center');
      expect(result).toContain('enabled: false');
      expect(result).toContain('count: 42');
    });

    test('should preserve complex YAML types in rawFrontmatter', () => {
      const slides = [
        {
          index: 0,
          rawFrontmatter: 'bool1: true\nbool2: false\nnumber: 3.14\nstring: "quoted value"\narray:\n  - item1\n  - item2',
          frontmatter: {
            // Parsed version loses type information
            bool1: 'true',
            bool2: 'false',
            number: '3.14',
            string: 'quoted value',
            array: 'item1, item2'
          },
          content: '# Title'
        }
      ];

      const result = reconstructMarkdown(slides);

      // Should preserve original YAML types from rawFrontmatter
      expect(result).toContain('bool1: true');
      expect(result).toContain('bool2: false');
      expect(result).toContain('number: 3.14');
      expect(result).toContain('array:\n  - item1\n  - item2');
    });
  });
});

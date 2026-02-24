const { parseSlides } = require('../slide-parser');

describe('Slide Parser', () => {
  test('should split markdown into slide objects', () => {
    const markdown = `---
frontmatter: value
---

# Slide 1

Content 1

---
# Slide 2

Content 2`;

    const slides = parseSlides(markdown);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      index: 0,
      frontmatter: { frontmatter: 'value' },
      content: expect.stringContaining('# Slide 1')
    });
    expect(slides[1]).toMatchObject({
      index: 1,
      frontmatter: {},
      content: expect.stringContaining('# Slide 2')
    });
  });

  test('should handle slide without frontmatter', () => {
    const markdown = `# Simple Slide

Content`;

    const slides = parseSlides(markdown);
    expect(slides).toHaveLength(1);
    expect(slides[0].frontmatter).toEqual({});
  });

  test('should preserve frontmatter fields', () => {
    const markdown = `---
layout: center
class: text-center
---

# Title`;

    const slides = parseSlides(markdown);
    expect(slides[0].frontmatter).toEqual({
      layout: 'center',
      class: 'text-center'
    });
  });
});

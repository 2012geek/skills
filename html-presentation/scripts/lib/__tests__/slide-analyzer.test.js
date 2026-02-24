const { analyzeSlide } = require('../slide-analyzer');

describe('Slide Type Analyzer', () => {
  test('should detect title slide', () => {
    const slide = {
      index: 0,
      frontmatter: {},
      content: `# Presentation Title

Subtitle`
    };

    const result = analyzeSlide(slide);

    expect(result.type).toBe('title');
    expect(result.layout).toBe('center');
  });

  test('should detect image-heavy slide', () => {
    const slide = {
      index: 1,
      frontmatter: {},
      content: `## Image Gallery

<img src="image1.png"/>
<img src="image2.png"/>
<img src="image3.png"/>`
    };

    const result = analyzeSlide(slide);

    expect(result.type).toBe('image');
    expect(result.imageHeavy).toBe(true);
  });

  test('should detect two-column layout', () => {
    const slide = {
      index: 2,
      frontmatter: {},
      content: `## Comparison

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">

<div class="card">Option A</div>
<div class="card">Option B</div>

</div>`
    };

    const result = analyzeSlide(slide);

    expect(result.type).toBe('two-col');
  });

  test('should detect code-heavy slide', () => {
    const slide = {
      index: 3,
      frontmatter: {},
      content: `## Code Examples

\`\`\`javascript
function example1() {
  return true;
}
\`\`\`

\`\`\`python
def example2():
  return False
\`\`\``
    };

    const result = analyzeSlide(slide);

    expect(result.type).toBe('code');
    expect(result.codeHeavy).toBe(true);
  });

  test('should detect content slide', () => {
    const slide = {
      index: 4,
      frontmatter: {},
      content: `## Section One

Content here

## Section Two

More content`
    };

    const result = analyzeSlide(slide);

    expect(result.type).toBe('content');
  });
});

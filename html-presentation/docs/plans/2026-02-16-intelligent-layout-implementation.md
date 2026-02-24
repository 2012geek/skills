# Intelligent Slide Layout Auto-Fixer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an automated LLM-powered system that analyzes slide content, applies optimal layouts per slide, and generates responsive CSS to fix all overflow issues without manual editing.

**Architecture:** A Node.js script that parses markdown slides, detects slide types (title/content/image/code), applies optimal layouts, injects smart multi-layer CSS constraints, creates backups, and generates transformation reports.

**Tech Stack:** Node.js, JavaScript (ES6+), RegExp, FS operations, CLI argument parsing

---

## Task 1: Create Slide Parser Module

**Files:**
- Create: `scripts/lib/slide-parser.js`
- Test: `scripts/lib/__tests__/slide-parser.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/slide-parser.test.js
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
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/slide-parser.test.js 2>&1 || true`
Expected: Error "Cannot find module '../slide-parser'" or similar

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/slide-parser.js

/**
 * Parse markdown slides into an array of slide objects
 * @param {string} markdown - The full markdown content
 * @returns {Array} Array of slide objects with index, frontmatter, content
 */
function parseSlides(markdown) {
  const slides = [];
  const SLIDE_SEPARATOR = /^---$/gm;
  const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---$/;

  // Split by slide separator
  const parts = markdown.split(SLIDE_SEPARATOR).filter(part => part.trim());

  parts.forEach((part, index) => {
    const slide = {
      index,
      frontmatter: {},
      content: part.trim()
    };

    // Extract frontmatter if present
    const frontmatterMatch = part.match(FRONTMATTER_REGEX);
    if (frontmatterMatch) {
      // Parse YAML frontmatter (simplified - doesn't handle all YAML cases)
      const frontmatterText = frontmatterMatch[1];
      slide.frontmatter = parseSimpleYaml(frontmatterText);
      slide.content = part.replace(FRONTMATTER_REGEX, '').trim();
    }

    slides.push(slide);
  });

  return slides;
}

/**
 * Simple YAML parser for frontmatter
 * Handles key: value pairs (not full YAML spec)
 * @param {string} yaml - YAML string
 * @returns {Object} Parsed object
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');

  lines.forEach(line => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      result[key.trim()] = value.trim();
    }
  });

  return result;
}

module.exports = { parseSlides };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { parseSlides } = require('./scripts/lib/slide-parser');

const test1 = \`---
frontmatter: value
---

# Slide 1

Content 1

---
# Slide 2

Content 2\`;

const slides = parseSlides(test1);
console.log('Slides parsed:', slides.length);
console.log('Slide 0 frontmatter:', JSON.stringify(slides[0].frontmatter));
console.log('Slide 1 has content:', slides[1].content.includes('# Slide 2'));

if (slides.length === 2 &&
    slides[0].frontmatter.frontmatter === 'value' &&
    slides[1].content.includes('# Slide 2')) {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/slide-parser.js
git commit -m "feat: add slide parser module

- Parse markdown into slide objects
- Extract frontmatter with simple YAML parser
- Preserve slide index and content
- Handle slides with/without frontmatter

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Create Slide Type Analyzer

**Files:**
- Create: `scripts/lib/slide-analyzer.js`
- Test: `scripts/lib/__tests__/slide-analyzer.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/slide-analyzer.test.js
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
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/slide-analyzer.test.js 2>&1 || true`
Expected: Error "Cannot find module '../slide-analyzer'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/slide-analyzer.js

/**
 * Analyze slide content and determine optimal layout
 * @param {Object} slide - Slide object with index, frontmatter, content
 * @returns {Object} Analysis result with type, layout, and flags
 */
function analyzeSlide(slide) {
  const { content, frontmatter } = slide;

  // Calculate metrics
  const metrics = {
    hasH1: /^#\s/.test(content),
    h2Count: (content.match(/^##\s/gm) || []).length,
    hasCode: /```/.test(content),
    codeBlockCount: (content.match(/```/g) || []).length / 2,
    hasImages: content.includes('<img'),
    imageCount: (content.match(/<img/g) || []).length,
    hasGrid: content.includes('grid-template-columns'),
    hasCards: content.includes('case-card') || content.includes('comparison-card') || content.includes('class="card"'),
    lineCount: content.split('\n').length,
    hasVClick: content.includes('<v-click'),
    hasLists: /^\s*[-*+]\s/m.test(content)
  };

  // Decision tree for slide type

  // Title slide: H1 only, minimal content, no code
  if (metrics.hasH1 && !metrics.h2Count && !metrics.hasCode && metrics.lineCount < 20) {
    return {
      type: 'title',
      layout: 'center',
      reason: 'H1 only, minimal content'
    };
  }

  // Image-heavy: multiple images
  if (metrics.imageCount >= 2 && metrics.lineCount < 40) {
    return {
      type: 'image',
      layout: 'default',
      imageHeavy: true,
      reason: `${metrics.imageCount} images, content-light`
    };
  }

  // Two-column: has grid or cards
  if (metrics.hasGrid || metrics.hasCards) {
    return {
      type: 'two-col',
      layout: 'default',
      reason: 'Grid/card layout detected'
    };
  }

  // Code-heavy: multiple code blocks
  if (metrics.codeBlockCount >= 2) {
    return {
      type: 'code',
      layout: 'default',
      codeHeavy: true,
      reason: `${metrics.codeBlockCount} code blocks`
    };
  }

  // Content slide: multiple H2s
  if (metrics.h2Count >= 2) {
    return {
      type: 'content',
      layout: 'default',
      reason: `${metrics.h2Count} sections`
    };
  }

  // Simple slide: fallback
  return {
    type: 'simple',
    layout: 'default',
    reason: 'Default layout'
  };
}

module.exports = { analyzeSlide };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { analyzeSlide } = require('./scripts/lib/slide-analyzer');

const titleSlide = { index: 0, frontmatter: {}, content: '# Title\n\nSubtitle' };
const imageSlide = { index: 1, frontmatter: {}, content: '## Images\n<img src=\"1\"/>\n<img src=\"2\"/>' };
const codeSlide = { index: 2, frontmatter: {}, content: '## Code\n\n\`\`\`js\nx\`\`\`\n\n\`\`\`py\ny\`\`\`' };

const r1 = analyzeSlide(titleSlide);
const r2 = analyzeSlide(imageSlide);
const r3 = analyzeSlide(codeSlide);

if (r1.type === 'title' && r1.layout === 'center' &&
    r2.type === 'image' && r2.imageHeavy === true &&
    r3.type === 'code' && r3.codeHeavy === true) {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  console.log('r1:', r1);
  console.log('r2:', r2);
  console.log('r3:', r3);
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/slide-analyzer.js
git commit -m "feat: add slide type analyzer

- Detect slide types: title, content, image, code, two-col
- Analyze content metrics (H1/H2 count, images, code blocks)
- Return optimal layout based on content characteristics
- Support detection of grid/card layouts

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Smart CSS Generator

**Files:**
- Create: `scripts/lib/css-generator.js`
- Test: `scripts/lib/__tests__/css-generator.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/css-generator.test.js
const { generateSmartCSS } = require('../css-generator');

describe('Smart CSS Generator', () => {
  test('should generate multi-layer overflow protection CSS', () => {
    const css = generateSmartCSS();

    // Layer 1: Variables
    expect(css).toContain('--content-max-width');
    expect(css).toContain('--text-max-width');

    // Layer 2: Container constraints
    expect(css).toContain('.slidev-slide-content');
    expect(css).toContain('max-width: 95vw');

    // Layer 4: Text constraints
    expect(css).toContain('h1, h2, h3, h4, h5, h6');
    expect(css).toContain('overflow-wrap: break-word');

    // Layer 5: Code constraints
    expect(css).toContain('pre, code');
    expect(css).toContain('overflow-x: auto');

    // Layer 6: Image constraints
    expect(css).toContain('img');
    expect(css).toContain('object-fit: contain');
  });

  test('should include !important declarations', () => {
    const css = generateSmartCSS();

    // Count !important occurrences (should be many)
    const importantCount = (css.match(/!important/g) || []).length;
    expect(importantCount).toBeGreaterThan(10);
  });

  test('should be minified by default', () => {
    const css = generateSmartCSS();

    // Should not have excessive whitespace
    expect(css.split('\n').length).toBeLessThan(50);
  });

  test('should support pretty mode', () => {
    const css = generateSmartCSS({ pretty: true });

    // Should have more lines when pretty
    expect(css.split('\n').length).toBeGreaterThan(50);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/css-generator.test.js 2>&1 || true`
Expected: Error "Cannot find module '../css-generator'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/css-generator.js

/**
 * Generate smart responsive CSS for overflow protection
 * @param {Object} options - Generation options
 * @param {boolean} options.pretty - Pretty-print CSS (default: false)
 * @returns {string} CSS string
 */
function generateSmartCSS(options = {}) {
  const { pretty = false } = options;
  const nl = pretty ? '\n' : '';
  const indent = pretty ? '  ' : '';

  const css = `/* Intelligent Slide Layout - Auto-Generated CSS */
/* Generated: ${new Date().toISOString()} */${nl}
${indent}/* Layer 1: Viewport-based variables */${nl}
${indent}:root {${nl}
${indent}  --content-max-width: min(85vw, 1100px);${nl}
${indent}  --text-max-width: min(75vw, 900px);${nl}
${indent}  --code-max-width: min(90vw, 1000px);${nl}
${indent}}${nl}
${indent}/* Layer 2: Container constraints */${nl}
${indent}.slidev-slide-content {${nl}
${indent}  max-width: 95vw !important;${nl}
${indent}  overflow-x: hidden !important;${nl}
${indent}  box-sizing: border-box !important;${nl}
${indent}}${nl}
${indent}/* Layer 3: Universal element constraints */${nl}
${indent}.slidev-slide-content > * {${nl}
${indent}  max-width: var(--content-max-width);${nl}
${indent}  box-sizing: border-box !important;${nl}
${indent}}${nl}
${indent}/* Layer 4: Text-specific constraints */${nl}
${indent}h1, h2, h3, h4, h5, h6,${nl}
${indent}p, ul, ol, li,${nl}
${indent}blockquote, .slidev-vclick-target {${nl}
${indent}  max-width: var(--text-max-width) !important;${nl}
${indent}  overflow-wrap: break-word !important;${nl}
${indent}  word-break: break-word !important;${nl}
${indent}  overflow-x: hidden !important;${nl}
${indent}}${nl}
${indent}/* Layer 5: Code block handling */${nl}
${indent}pre, code, .shiki {${nl}
${indent}  max-width: var(--code-max-width) !important;${nl}
${indent}  overflow-x: auto !important;${nl}
${indent}  white-space: pre-wrap !important;${nl}
${indent}  word-wrap: break-word !important;${nl}
${indent}}${nl}
${indent}/* Layer 6: Image constraints */${nl}
${indent}img {${nl}
${indent}  max-width: min(90vw, 1500px) !important;${nl}
${indent}  max-height: min(75vh, 900px) !important;${nl}
${indent}  object-fit: contain !important;${nl}
${indent}}${nl}
${indent}/* Layer 7: Grid protection */${nl}
${indent}[style*="grid-template-columns"] {${nl}
${indent}  max-width: 95vw !important;${nl}
${indent}  overflow-x: hidden !important;${nl}
${indent}}${nl}
${indent}/* Layer 8: Emergency clamp */${nl}
${indent}* {${nl}
${indent}  max-width: 100vw !important;${nl}
${indent}}${nl}`;

  return css;
}

module.exports = { generateSmartCSS };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { generateSmartCSS } = require('./scripts/lib/css-generator');

const css = generateSmartCSS();

const hasVariables = css.includes('--content-max-width');
const hasContainer = css.includes('.slidev-slide-content');
const hasText = css.includes('h1, h2, h3');
const hasCode = css.includes('pre, code');
const hasImg = css.includes('img');
const hasImportant = (css.match(/!important/g) || []).length > 10;

if (hasVariables && hasContainer && hasText && hasCode && hasImg && hasImportant) {
  console.log('✅ Tests passing');
  console.log('CSS length:', css.length, 'chars');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  console.log('Variables:', hasVariables);
  console.log('Container:', hasContainer);
  console.log('Text:', hasText);
  console.log('Code:', hasCode);
  console.log('Img:', hasImg);
  console.log('Important:', hasImportant);
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/css-generator.js
git commit -m "feat: add smart CSS generator

- Generate 8-layer overflow protection CSS
- Responsive variables based on viewport
- Element-specific constraints (text, code, images, grids)
- Uses !important to override theme styles
- Support pretty-print mode

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Create Layout Transformer

**Files:**
- Create: `scripts/lib/layout-transformer.js`
- Test: `scripts/lib/__tests__/layout-transformer.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/layout-transformer.test.js
const { transformSlides } = require('../layout-transformer');

describe('Layout Transformer', () => {
  test('should apply layout changes to slides', () => {
    const slides = [
      {
        index: 0,
        frontmatter: { layout: 'center' },
        content: '# Title',
        analysis: { type: 'title', layout: 'center' }
      },
      {
        index: 1,
        frontmatter: { layout: 'center' },
        content: '## Content',
        analysis: { type: 'content', layout: 'default' }
      }
    ];

    const transformed = transformSlides(slides);

    expect(transformed[0].frontmatter.layout).toBe('center');
    expect(transformed[1].frontmatter.layout).toBe('default');
  });

  test('should add frontmatter if missing', () => {
    const slides = [
      {
        index: 0,
        frontmatter: {},
        content: '# Simple',
        analysis: { type: 'simple', layout: 'default' }
      }
    ];

    const transformed = transformSlides(slides);

    expect(transformed[0].frontmatter).toBeDefined();
    expect(transformed[0].frontmatter.layout).toBe('default');
  });

  test('should inject smart CSS into first slide', () => {
    const slides = [
      {
        index: 0,
        frontmatter: {},
        content: '# First Slide',
        analysis: { type: 'title', layout: 'center' }
      }
    ];

    const transformed = transformSlides(slides);

    expect(transformed[0].frontmatter.style).toBeDefined();
    expect(transformed[0].frontmatter.style).toContain('--content-max-width');
  });

  test('should preserve existing frontmatter fields', () => {
    const slides = [
      {
        index: 0,
        frontmatter: { theme: 'seriph', transition: 'slide' },
        content: '# Title',
        analysis: { type: 'title', layout: 'center' }
      }
    ];

    const transformed = transformSlides(slides);

    expect(transformed[0].frontmatter.theme).toBe('seriph');
    expect(transformed[0].frontmatter.transition).toBe('slide');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/layout-transformer.test.js 2>&1 || true`
Expected: Error "Cannot find module '../layout-transformer'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/layout-transformer.js
const { generateSmartCSS } = require('./css-generator');

/**
 * Transform slides with optimal layouts and CSS
 * @param {Array} slides - Array of slide objects with analysis
 * @returns {Array} Transformed slides
 */
function transformSlides(slides) {
  if (!slides || slides.length === 0) {
    return [];
  }

  return slides.map((slide, index) => {
    const transformed = { ...slide };
    const { frontmatter = {}, analysis } = slide;

    // Clone frontmatter
    transformed.frontmatter = { ...frontmatter };

    // Apply layout from analysis
    if (analysis && analysis.layout) {
      transformed.frontmatter.layout = analysis.layout;
    }

    // Inject smart CSS into first slide only
    if (index === 0) {
      const smartCSS = generateSmartCSS({ pretty: false });

      // Merge with existing style or add new
      if (transformed.frontmatter.style) {
        transformed.frontmatter.style = `${transformed.frontmatter.style}\n${smartCSS}`;
      } else {
        transformed.frontmatter.style = smartCSS;
      }
    }

    return transformed;
  });
}

module.exports = { transformSlides };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { transformSlides } = require('./scripts/lib/layout-transformer');

const slides = [
  { index: 0, frontmatter: { layout: 'center' }, content: '# Title', analysis: { type: 'title', layout: 'center' } },
  { index: 1, frontmatter: { layout: 'center' }, content: '## Content', analysis: { type: 'content', layout: 'default' } }
];

const transformed = transformSlides(slides);

if (transformed[0].frontmatter.layout === 'center' &&
    transformed[1].frontmatter.layout === 'default' &&
    transformed[0].frontmatter.style.includes('--content-max-width')) {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  console.log('Slide 0 layout:', transformed[0].frontmatter.layout);
  console.log('Slide 1 layout:', transformed[1].frontmatter.layout);
  console.log('Has CSS:', !!transformed[0].frontmatter.style);
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/layout-transformer.js
git commit -m "feat: add layout transformer

- Apply optimal layouts to each slide based on analysis
- Inject smart CSS into first slide frontmatter
- Preserve existing frontmatter fields
- Merge with existing style if present

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Create Markdown Reconstructor

**Files:**
- Create: `scripts/lib/markdown-reconstructor.js`
- Test: `scripts/lib/__tests__/markdown-reconstructor.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/markdown-reconstructor.test.js
const { reconstructMarkdown } = require('../markdown-reconstructor');

describe('Markdown Reconstructor', () => {
  test('should rebuild markdown from slide objects', () => {
    const slides = [
      {
        index: 0,
        frontmatter: { layout: 'center', theme: 'seriph' },
        content: '# Title Slide'
      },
      {
        index: 1,
        frontmatter: { layout: 'default' },
        content: '## Content Slide\n\nSome content'
      }
    ];

    const markdown = reconstructMarkdown(slides);

    expect(markdown).toMatch(/^---$/m);
    expect(markdown).toContain('layout: center');
    expect(markdown).toContain('theme: seriph');
    expect(markdown).toContain('# Title Slide');
    expect(markdown).toContain('## Content Slide');
  });

  test('should separate slides with ---', () => {
    const slides = [
      {
        index: 0,
        frontmatter: {},
        content: 'Slide 1'
      },
      {
        index: 1,
        frontmatter: {},
        content: 'Slide 2'
      }
    ];

    const markdown = reconstructMarkdown(slides);

    const slideCount = (markdown.match(/^---$/gm) || []).length;
    expect(slideCount).toBe(3); // Start, middle, end
  });

  test('should handle slides without frontmatter', () => {
    const slides = [
      {
        index: 0,
        frontmatter: {},
        content: '# No Frontmatter'
      }
    ];

    const markdown = reconstructMarkdown(slides);

    expect(markdown).toContain('# No Frontmatter');
  });

  test('should format YAML frontmatter correctly', () => {
    const slides = [
      {
        index: 0,
        frontmatter: {
          layout: 'default',
          theme: 'seriph',
          style: 'css: here;'
        },
        content: '# Slide'
      }
    ];

    const markdown = reconstructMarkdown(slides);

    expect(markdown).toMatch(/^---$/m);
    expect(markdown).toContain('layout: default');
    expect(markdown).toContain('theme: seriph');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/markdown-reconstructor.test.js 2>&1 || true`
Expected: Error "Cannot find module '../markdown-reconstructor'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/markdown-reconstructor.js

/**
 * Reconstruct markdown from slide objects
 * @param {Array} slides - Array of slide objects
 * @returns {string} Reconstructed markdown
 */
function reconstructMarkdown(slides) {
  if (!slides || slides.length === 0) {
    return '';
  }

  return slides.map((slide, index) => {
    const { frontmatter, content } = slide;
    const parts = [];

    // Add slide separator (not before first slide)
    if (index > 0) {
      parts.push('---');
    }

    // Add frontmatter if it has content
    if (frontmatter && Object.keys(frontmatter).length > 0) {
      parts.push('---');
      Object.entries(frontmatter).forEach(([key, value]) => {
        // Handle multi-line values (like style)
        if (typeof value === 'string' && value.includes('\n')) {
          parts.push(`${key}: |`);
          value.split('\n').forEach(line => {
            parts.push(`  ${line}`);
          });
        } else {
          parts.push(`${key}: ${value}`);
        }
      });
      parts.push('---');
    }

    // Add content
    if (content) {
      parts.push(content);
    }

    return parts.join('\n');
  }).join('\n\n') + '\n';
}

module.exports = { reconstructMarkdown };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { reconstructMarkdown } = require('./scripts/lib/markdown-reconstructor');

const slides = [
  { index: 0, frontmatter: { layout: 'center', theme: 'seriph' }, content: '# Title' },
  { index: 1, frontmatter: { layout: 'default' }, content: '## Content' }
];

const md = reconstructMarkdown(slides);

const hasLayout = md.includes('layout: center');
const hasTheme = md.includes('theme: seriph');
const hasTitle = md.includes('# Title');
const hasContent = md.includes('## Content');
const hasSeparator = md.includes('---');

if (hasLayout && hasTheme && hasTitle && hasContent && hasSeparator) {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  console.log('Markdown:', md);
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/markdown-reconstructor.js
git commit -m "feat: add markdown reconstructor

- Rebuild markdown from transformed slide objects
- Format YAML frontmatter correctly
- Handle multi-line values (style, etc.)
- Separate slides with --- delimiter
- Preserve content formatting

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Create Report Generator

**Files:**
- Create: `scripts/lib/report-generator.js`
- Test: `scripts/lib/__tests__/report-generator.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/report-generator.test.js
const { generateReport } = require('../report-generator');

describe('Report Generator', () => {
  test('should generate transformation summary', () => {
    const summary = {
      totalSlides: 5,
      slidesModified: 3,
      titleSlides: 1,
      contentSlides: 2
    };

    const report = generateReport(summary, []);

    expect(report.totalSlides).toBe(5);
    expect(report.slidesModified).toBe(3);
  });

  test('should include change details', () => {
    const changes = [
      { slideNumber: 1, originalLayout: 'center', newLayout: 'center', type: 'title' },
      { slideNumber: 2, originalLayout: 'center', newLayout: 'default', type: 'content' }
    ];

    const report = generateReport({ totalSlides: 2, slidesModified: 1 }, changes);

    expect(report.changes).toHaveLength(2);
    expect(report.changes[0].slideNumber).toBe(1);
  });

  test('should include timestamp', () => {
    const report = generateReport({}, []);

    expect(report.timestamp).toBeDefined();
    expect(new Date(report.timestamp)).toBeInstanceOf(Date);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/report-generator.test.js 2>&1 || true`
Expected: Error "Cannot find module '../report-generator'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/report-generator.js

/**
 * Generate transformation report
 * @param {Object} summary - Summary statistics
 * @param {Array} changes - Array of change objects
 * @returns {Object} Report object
 */
function generateReport(summary, changes = []) {
  return {
    timestamp: new Date().toISOString(),
    ...summary,
    changes
  };
}

module.exports = { generateReport };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const { generateReport } = require('./scripts/lib/report-generator');

const report = generateReport(
  { totalSlides: 5, slidesModified: 3 },
  [{ slideNumber: 1, type: 'title' }]
);

if (report.totalSlides === 5 &&
    report.slidesModified === 3 &&
    report.changes.length === 1 &&
    report.timestamp) {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/report-generator.js
git commit -m "feat: add report generator

- Generate transformation summary
- Include change details per slide
- Add timestamp to reports
- Support JSON serialization

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Create Backup Manager

**Files:**
- Create: `scripts/lib/backup-manager.js`
- Test: `scripts/lib/__tests__/backup-manager.test.js`

**Step 1: Write the failing test**

```javascript
// scripts/lib/__tests__/backup-manager.test.js
const fs = require('fs');
const path = require('path');
const { createBackup, restoreBackup } = require('../backup-manager');

describe('Backup Manager', () => {
  const testFile = path.join(__dirname, 'test-backup.md');
  const testContent = '# Test Content';

  beforeEach(() => {
    // Create test file
    fs.writeFileSync(testFile, testContent);
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    // Cleanup backups
    const backups = fs.readdirSync(__dirname)
      .filter(f => f.startsWith('test-backup.md.backup-'));
    backups.forEach(f => fs.unlinkSync(path.join(__dirname, f)));
  });

  test('should create backup with timestamp', () => {
    const backupPath = createBackup(testFile);

    expect(backupPath).toBeDefined();
    expect(backupPath).toContain('backup-');
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(fs.readFileSync(backupPath, 'utf8')).toBe(testContent);
  });

  test('should restore from backup', () => {
    const backupPath = createBackup(testFile);

    // Modify original
    fs.writeFileSync(testFile, '# Modified');

    // Restore
    restoreBackup(backupPath);

    expect(fs.readFileSync(testFile, 'utf8')).toBe(testContent);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && node scripts/lib/__tests__/backup-manager.test.js 2>&1 || true`
Expected: Error "Cannot find module '../backup-manager'"

**Step 3: Write minimal implementation**

```javascript
// scripts/lib/backup-manager.js
const fs = require('fs');
const path = require('path');

/**
 * Create backup of file with timestamp
 * @param {string} filePath - Path to file
 * @returns {string} Backup file path
 */
function createBackup(filePath) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '-')
    .slice(0, 19);
  const backupPath = `${filePath}.backup-${timestamp}`;

  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Restore from backup
 * @param {string} backupPath - Path to backup file
 * @returns {string} Restored file path
 */
function restoreBackup(backupPath) {
  // Extract original path (remove .backup-*)
  const originalPath = backupPath.replace(/\.backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/, '');

  fs.copyFileSync(backupPath, originalPath);
  return originalPath;
}

module.exports = { createBackup, restoreBackup };
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && node -e "
const fs = require('fs');
const path = require('path');
const { createBackup, restoreBackup } = require('./scripts/lib/backup-manager');

const testFile = '/tmp/test-backup.md';
fs.writeFileSync(testFile, 'original content');

// Test backup
const backup = createBackup(testFile);
const backupContent = fs.readFileSync(backup, 'utf8');

// Test restore
fs.writeFileSync(testFile, 'modified');
restoreBackup(backup);
const restored = fs.readFileSync(testFile, 'utf8');

// Cleanup
fs.unlinkSync(testFile);
fs.unlinkSync(backup);

if (backupContent === 'original content' && restored === 'original content') {
  console.log('✅ Tests passing');
  process.exit(0);
} else {
  console.log('❌ Tests failing');
  process.exit(1);
}
"`
Expected: Output "✅ Tests passing"

**Step 5: Commit**

```bash
git add scripts/lib/backup-manager.js
git commit -m "feat: add backup manager

- Create timestamped backups
- Restore from backup functionality
- Preserve file contents and permissions
- Support rollback of transformations

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Create Main CLI Script

**Files:**
- Create: `scripts/fix-layouts.js`

**Step 1: Create implementation**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Import modules
const { parseSlides } = require('./lib/slide-parser');
const { analyzeSlide } = require('./lib/slide-analyzer');
const { transformSlides } = require('./lib/layout-transformer');
const { reconstructMarkdown } = require('./lib/markdown-reconstructor');
const { generateReport } = require('./lib/report-generator');
const { createBackup, restoreBackup } = require('./lib/backup-manager');

/**
 * Main transformation function
 * @param {string} inputFile - Input markdown file
 * @param {Object} options - CLI options
 */
async function fixLayouts(inputFile, options = {}) {
  console.log(`🔍 Analyzing: ${inputFile}`);

  // Read input file
  const markdown = fs.readFileSync(inputFile, 'utf8');

  // Parse slides
  const slides = parseSlides(markdown);
  console.log(`📊 Found ${slides.length} slides`);

  // Analyze each slide
  const slidesWithAnalysis = slides.map(slide => ({
    ...slide,
    analysis: analyzeSlide(slide)
  }));

  // Collect changes for report
  const changes = slidesWithAnalysis.map(slide => ({
    slideNumber: slide.index + 1,
    originalLayout: slide.frontmatter.layout || 'none',
    newLayout: slide.analysis.layout,
    type: slide.analysis.type,
    reason: slide.analysis.reason
  }));

  // Show what will change (if verbose or dry-run)
  if (options.verbose || options.dryRun) {
    console.log('\n📋 Planned changes:');
    changes
      .filter(c => c.originalLayout !== c.newLayout)
      .forEach(change => {
        console.log(`  Slide ${change.slideNumber}: ${change.originalLayout} → ${change.newLayout} (${change.type})`);
      });
  }

  if (options.dryRun) {
    console.log('\n✅ Dry run complete (no changes made)');
    return;
  }

  // Transform slides
  const transformedSlides = transformSlides(slidesWithAnalysis);

  // Reconstruct markdown
  const newMarkdown = reconstructMarkdown(transformedSlides);

  // Create backup
  const backupPath = createBackup(inputFile);
  console.log(`💾 Backup created: ${backupPath}`);

  // Write transformed file
  fs.writeFileSync(inputFile, newMarkdown);

  // Generate report
  const summary = {
    inputFile,
    backupFile: backupPath,
    totalSlides: slides.length,
    slidesModified: changes.filter(c => c.originalLayout !== c.newLayout).length
  };

  const report = generateReport(summary, changes);

  // Save report
  const reportPath = inputFile.replace(/\.md$/, '.layout-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Report saved: ${reportPath}`);

  console.log(`\n✅ Fixed ${summary.slidesModified} slides`);
  console.log(`🔙 To restore: node scripts/fix-layouts.js ${inputFile} --restore ${backupPath}`);
}

/**
 * Restore from backup
 * @param {string} backupPath - Backup file path
 */
function restore(backupPath) {
  console.log(`🔄 Restoring from: ${backupPath}`);
  const originalPath = restoreBackup(backupPath);
  console.log(`✅ Restored: ${originalPath}`);
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node scripts/fix-layouts.js <input-file> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run     Show changes without applying');
    console.log('  --restore     Restore from backup');
    console.log('  --verbose     Show detailed output');
    console.log('');
    process.exit(1);
  }

  const inputFile = args[0];
  const options = {
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose')
  };

  const restoreIndex = args.indexOf('--restore');
  if (restoreIndex !== -1) {
    const backupPath = args[restoreIndex + 1];
    if (!backupPath) {
      console.error('Error: --restore requires backup path');
      process.exit(1);
    }
    return { action: 'restore', backupPath };
  }

  return { action: 'fix', inputFile, options };
}

// Main entry point
async function main() {
  const { action, inputFile, options, backupPath } = parseArgs();

  try {
    if (action === 'restore') {
      restore(backupPath);
    } else {
      await fixLayouts(inputFile, options);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fixLayouts, restore };
```

**Step 2: Make executable**

Run: `chmod +x scripts/fix-layouts.js`

**Step 3: Test on actual file**

Run: `cd html-presentation && node scripts/fix-layouts.js .slidev-v4-temp.md --dry-run --verbose`
Expected: Output showing planned changes

**Step 4: Commit**

```bash
git add scripts/fix-layouts.js
git commit -m "feat: add main CLI script for layout fixing

- Parse CLI arguments (--dry-run, --verbose, --restore)
- Orchestrate all modules (parse, analyze, transform, reconstruct)
- Create backups before transformation
- Generate JSON reports
- Show user-friendly progress messages

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 9: Integration Test

**Files:**
- Test: `scripts/integration.test.js`

**Step 1: Create end-to-end test**

```javascript
// scripts/integration.test.js
const fs = require('fs');
const path = require('path');
const { fixLayouts } = require('./fix-layouts');

describe('Integration Test', () => {
  const testInput = path.join(__dirname, 'test-input.md');
  const testOutput = path.join(__dirname, 'test-output.md');

  beforeEach(() => {
    // Create test input
    const inputContent = `---
layout: center
---

# Presentation Title

---
layout: center
---

## Content Slide

This is content.

---
layout: center
---

\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`python
y = 2
\`\`\`
`;
    fs.writeFileSync(testInput, inputContent);
  });

  afterEach(() => {
    // Cleanup
    [testInput, testOutput].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    // Cleanup backups
    const backups = fs.readdirSync(__dirname)
      .filter(f => f.includes('test-input.md.backup-'));
    backups.forEach(f => fs.unlinkSync(path.join(__dirname, f)));
  });

  test('should fix all overflow issues', async () => {
    await fixLayouts(testInput, {});

    // Read output
    const output = fs.readFileSync(testInput, 'utf8');

    // First slide should keep center layout
    expect(output).toMatch(/layout: center/);

    // Content slides should use default
    const lines = output.split('\n');
    let layoutCenterCount = 0;
    let layoutDefaultCount = 0;

    lines.forEach(line => {
      if (line.includes('layout: center')) layoutCenterCount++;
      if (line.includes('layout: default')) layoutDefaultCount++;
    });

    // Should have center for title, default for others
    expect(layoutCenterCount).toBeGreaterThanOrEqual(1);
    expect(layoutDefaultCount).toBeGreaterThanOrEqual(1);

    // Should have smart CSS
    expect(output).toContain('--content-max-width');
    expect(output).toContain('.slidev-slide-content');
  }, 10000);
});
```

**Step 2: Run integration test**

Run: `cd html-presentation && node scripts/integration.test.js 2>&1 || true`
Expected: Tests pass

**Step 3: Commit**

```bash
git add scripts/integration.test.js
git commit -m "test: add integration test

- End-to-end test of full pipeline
- Verify layout transformations
- Check CSS injection
- Test backup creation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 10: Run on Actual Slides and Verify

**Files:**
- Modify: `.slidev-v4-temp.md` (via script)

**Step 1: Run script on actual slides**

Run: `cd html-presentation && node scripts/fix-layouts.js .slidev-v4-temp.md --verbose`

**Step 2: Check the report**

Run: `cat html-presentation/.slidev-v4-temp.layout-fix-report.json`

**Step 3: Restart preview server**

Run: `lsof -ti:3030 | xargs kill -9 2>/dev/null || true`
Run: `node cli.js preview .slidev-v4-temp.md --port 3030 > /tmp/slidev-preview.log 2>&1 &`

**Step 4: Verify no overflow**

Run: `node -e "
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto('http://localhost:3030/4', { waitUntil: 'networkidle0' });

  const overflow = await page.evaluate(() => {
    const content = document.querySelector('.slidev-slide-content');
    return {
      scrollWidth: content.scrollWidth,
      clientWidth: content.clientWidth,
      hasOverflow: content.scrollWidth > content.clientWidth
    };
  });

  console.log('Page 4 overflow check:', JSON.stringify(overflow, null, 2));

  if (overflow.hasOverflow) {
    console.log('❌ Still has overflow');
    process.exit(1);
  } else {
    console.log('✅ No overflow!');
    process.exit(0);
  }

  await browser.close();
})();
" sleep 5` with timeout 30000

Expected: Output "✅ No overflow!"

**Step 5: Create documentation**

Create: `html-presentation/docs/fix-layouts-usage.md`

```markdown
# Intelligent Layout Fixer - Usage Guide

## Quick Start

Fix all slide layouts automatically:

\`\`\`bash
node scripts/fix-layouts.js slides.md
\`\`\`

## Options

### Dry Run (Preview Changes)

\`\`\`bash
node scripts/fix-layouts.js slides.md --dry-run --verbose
\`\`\`

### Restore from Backup

\`\`\`bash
node scripts/fix-layouts.js slides.md --restore slides.md.backup-20260216-103000
\`\`\`

## What It Does

1. **Analyzes** each slide's content
2. **Detects** slide type (title, content, image, code)
3. **Applies** optimal layout per slide
4. **Injects** smart CSS for overflow protection
5. **Creates** backup automatically
6. **Generates** transformation report

## Slide Type Detection

- **Title**: H1 only, minimal content → `layout: center`
- **Image**: 2+ images → `layout: default` + image constraints
- **Two-column**: Has grid/cards → `layout: default`
- **Code**: 2+ code blocks → `layout: default` + code scrolling
- **Content**: Multiple H2s → `layout: default`

## CSS Layers

8 layers of overflow protection:
1. Viewport-based CSS variables
2. Container max-width
3. Universal element constraints
4. Text element constraints
5. Code block scrolling
6. Image size limits
7. Grid layout protection
8. Emergency 100vw clamp

## Safety Features

- ✅ Automatic backup creation
- ✅ Reversible with --restore
- ✅ Dry-run mode to preview
- ✅ Detailed JSON reports
- ✅ Preserves existing frontmatter
```

**Step 6: Commit final documentation**

```bash
git add docs/fix-layouts-usage.md
git add .slidev-v4-temp.md.layout-fix-report.json
git commit -m "docs: add layout fixer usage guide

- Quick start examples
- All CLI options
- Slide type detection rules
- CSS layer explanations
- Safety features documentation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Summary

This implementation plan creates a complete intelligent slide layout auto-fixer system with:

**Core Modules:**
1. ✅ Slide Parser - Parse markdown into slide objects
2. ✅ Slide Analyzer - Detect slide types intelligently
3. ✅ CSS Generator - Generate 8-layer overflow protection
4. ✅ Layout Transformer - Apply optimal layouts
5. ✅ Markdown Reconstructor - Rebuild markdown
6. ✅ Report Generator - Track all changes
7. ✅ Backup Manager - Safe restoration
8. ✅ CLI Script - Easy-to-use interface

**Testing:**
- Unit tests for each module
- Integration tests for full pipeline
- Visual verification on actual slides

**Safety Features:**
- Automatic backups
- Dry-run mode
- Detailed reports
- Reversible transformations

**Total Estimated Time:** 4-6 hours for full implementation and testing.

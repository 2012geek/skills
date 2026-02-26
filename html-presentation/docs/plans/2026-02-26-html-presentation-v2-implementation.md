# HTML-Presentation v2.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the html-presentation skill with LLM + rendering verification feedback loop architecture to solve layout incompatibility, content overflow, and quality issues.

**Architecture:** LLM generates initial markdown → Slidev renders → Puppeteer captures screenshot → LLM judges quality → Fix if needed (max 3 auto iterations + human intervention) → Output final slides. Three-layer caching (L1 memory, L2 disk, L3 semantic) for performance.

**Tech Stack:** Node.js 18+, Puppeteer 22+, Anthropic Claude API, Slidev 52+, Jest 30+

---

## Phase 1: Foundation - Core Modules (Week 1-2)

### Task 1: Project Structure and Package Setup

**Files:**
- Modify: `package.json`
- Create: `core/content-analyzer.js`
- Create: `core/layout-selector.js`
- Create: `core/slide-generator.js`
- Create: `lib/index.js`

**Step 1: Update package.json with new dependencies**

Run: `cd /home/nice/chenlening/workspace/skills/html-presentation && npm install puppeteer@22.0.0 @anthropic-ai/sdk --save`

Edit `package.json`, add to dependencies:
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.27.0",
    "puppeteer": "^22.0.0"
  }
}
```

**Step 2: Create core directory structure**

Run: `mkdir -p core agents utils tests/unit tests/integration`

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add puppeteer and anthropic sdk dependencies"
```

---

### Task 2: Content Analyzer - Basic Implementation

**Files:**
- Create: `core/content-analyzer.js`
- Create: `tests/unit/content-analyzer.test.js`

**Step 1: Write the failing test**

Create `tests/unit/content-analyzer.test.js`:
```javascript
const { ContentAnalyzer } = require('../core/content-analyzer');

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

    expect(result.codeRatio).toBeCloseTo(0.33, 1);
    expect(result.textRatio).toBeCloseTo(0.67, 1);
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
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/content-analyzer.test.js`

Expected: FAIL with "Cannot find module '../core/content-analyzer'"

**Step 3: Write minimal implementation**

Create `core/content-analyzer.js`:
```javascript
const marked = require('marked');

class ContentAnalyzer {
  constructor() {
    this.tokens = new Map();
  }

  async analyze(markdown) {
    const tokens = marked.lexer(markdown);
    const sections = this.extractSections(tokens);
    const slides = this.extractSlides(tokens);

    return {
      totalSlides: slides.length,
      sections: sections,
      metrics: this.calculateMetrics(tokens),
      structure: this.analyzeStructure(tokens)
    };
  }

  analyzeSlide(markdown) {
    const tokens = marked.lexer(markdown);
    const stats = this.countElements(tokens);

    const total = stats.text + stats.code + stats.images;

    return {
      codeRatio: total > 0 ? stats.code / total : 0,
      textRatio: total > 0 ? stats.text / total : 0,
      imageRatio: total > 0 ? stats.images / total : 0,
      codeBlocks: stats.codeBlocks,
      images: stats.images,
      hasImages: stats.images > 0,
      hasTables: stats.tables > 0,
      hasCodeBlocks: stats.codeBlocks > 0,
      wordCount: stats.wordCount,
      hasLongText: stats.wordCount > 200
    };
  }

  extractSections(tokens) {
    const sections = [];
    let currentSection = null;
    let sectionId = 1;

    tokens.forEach(token => {
      if (token.type === 'heading' && token.depth === 1) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          id: sectionId++,
          title: token.text,
          contents: []
        };
      } else if (currentSection && token.type === 'heading' && token.depth === 2) {
        currentSection.contents.push({
          type: 'subsection',
          title: token.text
        });
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  extractSlides(tokens) {
    const slides = [];
    let currentSlide = [];

    tokens.forEach(token => {
      if (token.type === 'hr' || token.type === 'heading' && token.depth === 1) {
        if (currentSlide.length > 0) {
          slides.push(currentSlide);
          currentSlide = [];
        }
      }
      currentSlide.push(token);
    });

    if (currentSlide.length > 0) {
      slides.push(currentSlide);
    }

    return slides;
  }

  countElements(tokens) {
    let text = 0;
    let code = 0;
    let images = 0;
    let tables = 0;
    let codeBlocks = [];
    let wordCount = 0;

    tokens.forEach(token => {
      switch (token.type) {
        case 'paragraph':
          text += token.text.length;
          wordCount += token.text.split(/\s+/).length;
          break;
        case 'code':
          code += token.text.length;
          codeBlocks.push({
            lang: token.lang,
            length: token.text.length
          });
          break;
        case 'image':
          images++;
          break;
        case 'table':
          tables++;
          break;
      }
    });

    return { text, code, images, tables, codeBlocks, wordCount };
  }

  calculateMetrics(tokens) {
    const stats = this.countElements(tokens);
    const total = stats.text + stats.code + stats.images;

    return {
      avgCodeRatio: total > 0 ? stats.code / total : 0,
      avgImageRatio: total > 0 ? stats.images / total : 0,
      avgTextRatio: total > 0 ? stats.text / total : 0,
      hasTables: stats.tables > 0,
      hasLongText: stats.wordCount > 200,
      hasCodeBlocks: stats.codeBlocks > 0,
      complexity: this.calculateComplexity(stats)
    };
  }

  calculateComplexity(stats) {
    if (stats.tables > 0 || stats.codeBlocks.length > 2) {
      return 'high';
    } else if (stats.codeBlocks.length > 0 || stats.images > 0) {
      return 'medium';
    }
    return 'low';
  }

  analyzeStructure(tokens) {
    const headings = tokens.filter(t => t.type === 'heading');
    const maxDepth = Math.max(...headings.map(h => h.depth), 0);

    return {
      headings: headings.map(h => ({
        depth: h.depth,
        text: h.text
      })),
      depth: maxDepth
    };
  }
}

module.exports = { ContentAnalyzer };
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/content-analyzer.test.js`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add core/content-analyzer.js tests/unit/content-analyzer.test.js
git commit -m "feat: implement ContentAnalyzer with markdown parsing"
```

---

### Task 3: Layout Selector

**Files:**
- Create: `core/layout-selector.js`
- Create: `tests/unit/layout-selector.test.js`

**Step 1: Write the failing test**

Create `tests/unit/layout-selector.test.js`:
```javascript
const { LayoutSelector } = require('../core/layout-selector');

describe('LayoutSelector', () => {
  test('should select center for title slides', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      hasH1: true,
      minimalContent: true
    });

    expect(layout).toBe('center');
  });

  test('should select two-cols for balanced code and text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      codeRatio: 0.5,
      textRatio: 0.5,
      imageRatio: 0
    });

    expect(layout).toBe('two-cols');
  });

  test('should select default for plain text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      textRatio: 1.0,
      codeRatio: 0,
      imageRatio: 0
    });

    expect(layout).toBe('default');
  });

  test('should select image-right for images with text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      textRatio: 0.6,
      imageRatio: 0.4,
      codeRatio: 0,
      firstElementIsImage: false
    });

    expect(layout).toBe('image-right');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/layout-selector.test.js`

Expected: FAIL with "Cannot find module '../core/layout-selector'"

**Step 3: Write minimal implementation**

Create `core/layout-selector.js`:
```javascript
class LayoutSelector {
  constructor() {
    // Standard Slidev layouts
    this.standardLayouts = [
      'default', 'center', 'cover', 'two-cols', 'two-cols-header',
      'image', 'image-left', 'image-right', 'section', 'quote'
    ];
  }

  select(metrics) {
    const {
      codeRatio = 0,
      textRatio = 0,
      imageRatio = 0,
      hasH1 = false,
      minimalContent = false,
      firstElementIsImage = false
    } = metrics;

    // Title slides
    if (hasH1 && minimalContent) {
      return 'center';
    }

    // Cover slides
    if (hasH1 && imageRatio > 0.5) {
      return 'cover';
    }

    // Code-heavy slides (use standard layouts)
    if (codeRatio >= 0.9) {
      return 'default'; // Use default with centered code
    }

    if (codeRatio >= 0.6) {
      return 'two-cols'; // Code on one side, text on other
    }

    // Image-heavy slides
    if (imageRatio >= 0.9) {
      return 'image';
    }

    if (imageRatio >= 0.6) {
      return 'image';
    }

    // Balanced code and text
    if (codeRatio >= 0.3 && textRatio >= 0.3) {
      return 'two-cols';
    }

    // Images with text
    if (imageRatio >= 0.3) {
      return firstElementIsImage ? 'image-left' : 'image-right';
    }

    // Section dividers
    if (textRatio > 0.9 && metrics.isSection) {
      return 'section';
    }

    // Default
    return 'default';
  }

  getStandardLayouts() {
    return this.standardLayouts;
  }

  isValidLayout(layout) {
    return this.standardLayouts.includes(layout);
  }
}

module.exports = { LayoutSelector };
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/layout-selector.test.js`

Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add core/layout-selector.js tests/unit/layout-selector.test.js
git commit -m "feat: implement LayoutSelector with standard Slidev layouts"
```

---

### Task 4: Slide Generator Basic Flow

**Files:**
- Create: `core/slide-generator.js`
- Create: `lib/index.js`

**Step 1: Write minimal SlideGenerator**

Create `core/slide-generator.js`:
```javascript
const { ContentAnalyzer } = require('./content-analyzer');
const { LayoutSelector } = require('./layout-selector');

class SlideGenerator {
  constructor(options = {}) {
    this.analyzer = new ContentAnalyzer();
    this.layoutSelector = new LayoutSelector();
    this.options = {
      theme: options.theme || 'seriph',
      title: options.title || '',
      author: options.author || ''
    };
  }

  async generate(inputPath, options = {}) {
    const fs = require('fs').promises;

    // Read input
    const markdown = await fs.readFile(inputPath, 'utf-8');

    // Analyze content
    const analysis = await this.analyzer.analyze(markdown);

    // Generate slides
    const slides = [];
    for (const section of analysis.sections) {
      for (const content of section.contents) {
        const slideMarkdown = this.generateSlide(content, analysis.metrics);
        slides.push(slideMarkdown);
      }
    }

    // Generate frontmatter
    const frontmatter = this.generateFrontmatter(analysis);

    // Assemble output
    const output = this.assemble(frontmatter, slides);

    // Write output
    const outputPath = options.output || inputPath.replace(/\.md$/, '.slides.md');
    await fs.writeFile(outputPath, output);

    return {
      success: true,
      outputPath: outputPath,
      stats: {
        totalSlides: slides.length
      }
    };
  }

  generateSlide(content, metrics) {
    // Select layout
    const layout = this.layoutSelector.select({
      codeRatio: metrics.avgCodeRatio,
      textRatio: metrics.avgTextRatio,
      imageRatio: metrics.avgImageRatio
    });

    // Generate markdown
    let markdown = `---\nlayout: ${layout}\n---\n\n`;
    markdown += `## ${content.title}\n\n`;

    return markdown;
  }

  generateFrontmatter(analysis) {
    return `---
theme: ${this.options.theme}
title: ${this.options.title || 'Presentation'}
author: ${this.options.author || ''}
class: text-left
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
transition: slide-left
titleTemplate: '%s'
---

`;
  }

  assemble(frontmatter, slides) {
    return frontmatter + slides.join('\n\n---\n\n');
  }
}

module.exports = { SlideGenerator };
```

**Step 2: Create lib/index.js**

Create `lib/index.js`:
```javascript
const { SlideGenerator } = require('../core/slide-generator');
const { ContentAnalyzer } = require('../core/content-analyzer');
const { LayoutSelector } = require('../core/layout-selector');

module.exports = {
  SlideGenerator,
  ContentAnalyzer,
  LayoutSelector
};
```

**Step 3: Test basic generation**

Run: `node -e "const { SlideGenerator } = require('./lib'); const gen = new SlideGenerator({ theme: 'seriph' }); gen.generate('README.md', { output: '/tmp/test.slides.md' }).then(r => console.log(r))"`

Expected: Success message

**Step 4: Commit**

```bash
git add core/slide-generator.js lib/index.js
git commit -m "feat: implement basic SlideGenerator flow"
```

---

## Phase 2: Verification System (Week 3-5)

### Task 5: Slidev Renderer with Server Pool

**Files:**
- Create: `core/slidev-renderer.js`
- Create: `core/server-pool.js`
- Create: `tests/integration/slidev-renderer.test.js`

**Step 1: Write the failing test**

Create `tests/integration/slidev-renderer.test.js`:
```javascript
const { SlidevRenderer } = require('../core/slidev-renderer');
const { ServerPool } = require('../core/server-pool');

describe('SlidevRenderer Integration', () => {
  test('should start Slidev server and render slide', async () => {
    const pool = new ServerPool({ maxServers: 1, portStart: 3100 });
    const renderer = new SlidevRenderer();

    const server = await pool.acquire();
    const result = await renderer.render(server, '# Test Slide');

    expect(result.url).toMatch(/http:\/\/localhost:/);
    expect(server.process).toBeDefined();

    await pool.release(server);
    await pool.closeAll();
  }, 30000);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/slidev-renderer.test.js`

Expected: FAIL with "Cannot find module '../core/slidev-renderer'"

**Step 3: Write ServerPool implementation**

Create `core/server-pool.js`:
```javascript
const { spawn } = require('child_process');
const path = require('path');

class SlidevServer {
  constructor(port) {
    this.port = port;
    this.process = null;
    this.url = `http://localhost:${port}`;
  }

  async start() {
    const slidevBin = path.join(__dirname, '../node_modules/.bin/slidev');

    this.process = spawn('node', [slidevBin, 'port', this.port.toString()], {
      cwd: path.join(__dirname, '..'),
      stdio: 'ignore'
    });

    // Wait for server to be ready
    await this.waitForReady();

    return this;
  }

  async waitForReady() {
    const maxWait = 10000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      try {
        const fetch = require('node-fetch');
        const response = await fetch(this.url);
        if (response.ok) return;
      } catch (e) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error('Slidev server failed to start');
  }

  async stop() {
    if (this.process) {
      this.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (this.process.exitCode === null) {
        this.process.kill('SIGKILL');
      }
    }
  }
}

class ServerPool {
  constructor(options = {}) {
    this.maxServers = options.maxServers || 3;
    this.portStart = options.portStart || 3031;
    this.servers = [];
    this.available = [];
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop();
    }

    if (this.servers.length < this.maxServers) {
      const port = this.portStart + this.servers.length;
      const server = new SlidevServer(port);
      await server.start();
      this.servers.push(server);
      return server;
    }

    throw new Error('No servers available in pool');
  }

  release(server) {
    this.available.push(server);
  }

  async closeAll() {
    await Promise.all(this.servers.map(s => s.stop()));
    this.servers = [];
    this.available = [];
  }
}

module.exports = { SlidevServer, ServerPool };
```

**Step 4: Write SlidevRenderer implementation**

Create `core/slidev-renderer.js`:
```javascript
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class SlidevRenderer {
  constructor() {
    this.tempDir = path.join(os.tmpdir(), 'slides-render');
  }

  async render(server, markdown) {
    // Ensure temp dir exists
    await fs.mkdir(this.tempDir, { recursive: true });

    // Write temporary slide file
    const tempFile = path.join(this.tempDir, `slide-${Date.now()}.md`);
    const fullMarkdown = this.wrapWithFrontmatter(markdown);
    await fs.writeFile(tempFile, fullMarkdown);

    // Navigate to the slide
    const slideUrl = `${server.url}/#${encodeURIComponent(tempFile)}`;

    return {
      url: slideUrl,
      server: server,
      tempFile: tempFile
    };
  }

  wrapWithFrontmatter(markdown) {
    return `---
theme: seriph
---

${markdown}`;
  }

  async cleanup(tempFile) {
    try {
      await fs.unlink(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

module.exports = { SlidevRenderer };
```

**Step 5: Run test to verify it passes**

Run: `npm test -- tests/integration/slidev-renderer.test.js`

Expected: PASS

**Step 6: Commit**

```bash
git add core/slidev-renderer.js core/server-pool.js tests/integration/slidev-renderer.test.js
git commit -m "feat: implement SlidevRenderer with ServerPool"
```

---

### Task 6: Puppeteer Capturer

**Files:**
- Create: `core/puppeteer-capturer.js`
- Create: `tests/integration/puppeteer-capturer.test.js`

**Step 1: Write the failing test**

Create `tests/integration/puppeteer-capturer.test.js`:
```javascript
const { PuppeteerCapturer } = require('../core/puppeteer-capturer');

describe('PuppeteerCapturer Integration', () => {
  test('should capture screenshot of webpage', async () => {
    const capturer = new PuppeteerCapturer();
    const result = await capturer.capture('https://example.com');

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  }, 15000);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/puppeteer-capturer.test.js`

Expected: FAIL with "Cannot find module '../core/puppeteer-capturer'"

**Step 3: Write implementation**

Create `core/puppeteer-capturer.js`:
```javascript
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class PuppeteerCapturer {
  constructor(options = {}) {
    this.browser = null;
    this.screenshotDir = options.screenshotDir || path.join(os.tmpdir(), 'slides-screenshots');
    this.viewport = options.viewport || { width: 1920, height: 1080 };
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    await fs.mkdir(this.screenshotDir, { recursive: true });
  }

  async capture(url, options = {}) {
    await this.init();

    const page = await this.browser.newPage();
    await page.setViewport(this.viewport);

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

      // Wait for slide to render
      await page.waitForSelector('.slidev-layout', { timeout: 5000 }).catch(() => {});

      const buffer = await page.screenshot({
        type: 'png',
        fullPage: false
      });

      const result = { buffer };

      if (options.savePath) {
        const filename = path.join(this.screenshotDir, options.savePath);
        await fs.writeFile(filename, buffer);
        result.path = filename;
      }

      return result;
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = { PuppeteerCapturer };
```

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/puppeteer-capturer.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add core/puppeteer-capturer.js tests/integration/puppeteer-capturer.test.js
git commit -m "feat: implement PuppeteerCapturer for screenshot capture"
```

---

### Task 7: LLM Judge and Fixer

**Files:**
- Create: `core/llm-judge.js`
- Create: `core/llm-fixer.js`
- Create: `agents/slide-judge.md`
- Create: `agents/slide-fixer.md`

**Step 1: Create slide-judge agent**

Create `agents/slide-judge.md`:
```markdown
# Slide Quality Judge

You are an expert at evaluating presentation slide visual quality.

## Task
Examine the provided slide screenshot and evaluate its quality across multiple dimensions.

## Evaluation Criteria (0-100 points each)

1. **Layout Balance** - Are elements distributed properly? Is the slide visually balanced?

2. **Visual Hierarchy** - Is there a clear visual hierarchy? Are headings, body text, and other elements properly sized and positioned?

3. **Whitespace** - Is there appropriate breathing room? Does the slide feel crowded or spacious?

4. **Readability** - Are fonts, spacing, and contrast appropriate? Is the content easy to read?

5. **Overall Aesthetic** - What is your overall impression of the slide's visual quality?

## Output Format

Respond ONLY with valid JSON:

```json
{
  "layout": 85,
  "hierarchy": 80,
  "whitespace": 75,
  "readability": 90,
  "overall": 82,
  "issues": ["Table width exceeds boundaries"],
  "approach": "Consider reducing table font size or splitting into two slides",
  "needsFix": false
}
```

## Pass Threshold
- overall >= 80: No fix needed
- overall < 80: Fix needed

## Notes
- Be objective but fair
- Provide specific, actionable improvement suggestions
- Consider the actual use case (presentation slides)
```

**Step 2: Create slide-fixer agent**

Create `agents/slide-fixer.md`:
```markdown
# Slide Layout Fixer

You are an expert at fixing presentation slide layout issues.

## Task
Fix the slide markdown based on the judgment feedback to make it more visually appealing and functional.

## Input
- Original slide markdown
- Judgment feedback (scores, issues, suggestions)

## Constraints
1. Preserve content semantics - do not change the meaning
2. Only adjust layout, styling, or structure
3. Do not delete or add substantive content
4. Prefer standard Slidev layouts
5. Avoid introducing new issues

## Common Fix Strategies

**Overflow:**
- Split content across multiple slides
- Reduce font size
- Add scroll containers: `::div{overflow-x-auto}{...}`

**Unbalanced Layout:**
- Change layout type (two-cols, default, center)
- Use two-column layout with adjusted proportions
- Adjust grid or flex spacing

**Wide Table:**
- Add max-width: `::div{max-width: 90vw}{...}`
- Use scroll container
- Reduce font size: `::div{text-sm}{...}`

**Long Code Block:**
- Split code into smaller blocks
- Show only key parts
- Add scroll: `::div{overflow-x-auto}{...}`

**Poor Hierarchy:**
- Adjust heading levels
- Add whitespace
- Adjust font sizes: `::div{text-2xl}{...}`

## Output
Return only the fixed markdown string, no explanation.
```

**Step 3: Implement LLMJudge**

Create `core/llm-judge.js`:
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class LLMJudge {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || options.apiKey
    });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = options.maxTokens || 4096;
    this.promptCache = null;
  }

  async loadPrompt() {
    if (this.promptCache) return this.promptCache;

    const promptPath = path.join(__dirname, '../agents/slide-judge.md');
    this.promptCache = await fs.readFile(promptPath, 'utf-8');
    return this.promptCache;
  }

  async evaluate(screenshotBuffer) {
    const prompt = await this.loadPrompt();

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: screenshotBuffer.toString('base64')
              }
            }
          ]
        }
      ]
    });

    const text = message.content[0].text;
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    return JSON.parse(text);
  }

  close() {
    // Cleanup if needed
  }
}

module.exports = { LLMJudge };
```

**Step 4: Implement LLMFixer**

Create `core/llm-fixer.js`:
```javascript
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');

class LLMFixer {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || options.apiKey
    });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
    this.maxTokens = options.maxTokens || 4096;
    this.promptCache = null;
  }

  async loadPrompt() {
    if (this.promptCache) return this.promptCache;

    const promptPath = path.join(__dirname, '../agents/slide-fixer.md');
    this.promptCache = await fs.readFile(promptPath, 'utf-8');
    return this.promptCache;
  }

  async fix(markdown, judgment) {
    const prompt = await this.loadPrompt();

    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        {
      role: 'user',
      content: `${prompt}

## Original Markdown

\`\`\`markdown
${markdown}
\`\`\`

## Judgment Feedback

- Overall Score: ${judgment.score}/100
- Issues: ${judgment.issues.join(', ')}
- Suggested Approach: ${judgment.approach}

## Task
Fix the markdown based on this feedback. Return only the fixed markdown, no explanation.`
    }
  ]
});

const text = message.content[0].text;

// Extract markdown from code blocks if present
const codeMatch = text.match(/```markdown\n([\s\S]*?)\n```/);
if (codeMatch) {
  return codeMatch[1];
}

// Remove any explanation text
const lines = text.split('\n');
let markdownStarted = false;
const result = [];

for (const line of lines) {
  if (line.match(/^```/) || line.match(/^##/) || line.match(/^[A-Z]+:/)) {
    continue;
  }
  markdownStarted = true;
  result.push(line);
}

return result.join('\n').trim();
}

close() {
// Cleanup if needed
}
}

module.exports = { LLMFixer };
```

**Step 5: Commit**

```bash
git add agents/slide-judge.md agents/slide-fixer.md core/llm-judge.js core/llm-fixer.js
git commit -m "feat: implement LLMJudge and LLMFixer with Anthropic API"
```

---

### Task 8: Verify Fix Loop Core

**Files:**
- Create: `core/verify-fix-loop.js`
- Create: `core/attempt-history.js'
- Create: `tests/unit/verify-fix-loop.test.js`

**Step 1: Implement AttemptHistory**

Create `core/attempt-history.js`:
```javascript
const crypto = require('crypto');

class AttemptHistory {
  constructor() {
    this.history = new Map();
  }

  record(slideId, attempt) {
    if (!this.history.has(slideId)) {
      this.history.set(slideId, []);
    }

    const slideHistory = this.history.get(slideId);
    attempt.timestamp = new Date().toISOString();
    attempt.markdownHash = this.hash(attempt.markdown);

    slideHistory.push(attempt);

    return slideHistory;
  }

  get(slideId) {
    return this.history.get(slideId) || [];
  }

  getAll() {
    return Object.fromEntries(this.history);
  }

  hash(markdown) {
    return crypto
      .createHash('md5')
      .update(markdown)
      .digest('hex');
  }

  hasLoop(slideId, newMarkdown) {
    const newHash = this.hash(newMarkdown);
    const slideHistory = this.get(slideId);

    return slideHistory.some(attempt => attempt.markdownHash === newHash);
  }

  clear(slideId) {
    this.history.delete(slideId);
  }

  clearAll() {
    this.history.clear();
  }
}

module.exports = { AttemptHistory };
```

**Step 2: Implement VerifyFixLoop**

Create `core/verify-fix-loop.js`:
```javascript
const { SlidevRenderer } = require('./slidev-renderer');
const { PuppeteerCapturer } = require('./puppeteer-capturer');
const { LLMJudge } = require('./llm-judge');
const { LLMFixer } = require('./llm-fixer');
const { ServerPool } = require('./server-pool');
const { AttemptHistory } = require('./attempt-history');

class VerifyFixLoop {
  constructor(options = {}) {
    this.threshold = options.threshold || 80;
    this.maxIterations = options.maxIterations || 3;
    this.serverPool = new ServerPool(options.serverPool);
    this.renderer = new SlidevRenderer();
    this.capturer = new PuppeteerCapturer(options.capturer);
    this.judge = new LLMJudge(options.judge);
    this.fixer = new LLMFixer(options.fixer);
    this.history = new AttemptHistory();
  }

  async verify(markdown, slideId, options = {}) {
    const maxIterations = options.maxIterations || this.maxIterations;
    const interactive = options.interactive || false;

    let currentMarkdown = markdown;
    const attempts = [];

    // Auto-fix phase
    for (let i = 0; i < maxIterations; i++) {
      // Render
      const server = await this.serverPool.acquire();
      try {
        const rendered = await this.renderer.render(server, currentMarkdown);

        // Capture
        const screenshot = await this.capturer.capture(rendered.url, {
          savePath: `slide-${slideId}-attempt-${i + 1}.png`
        });

        // Judge
        const judgment = await this.judge.evaluate(screenshot.buffer);

        // Record attempt
        const attempt = {
          iteration: i + 1,
          approach: judgment.approach,
          score: judgment.overall,
          issues: judgment.issues,
          screenshot: screenshot.path,
          markdown: currentMarkdown
        };

        attempts.push(attempt);
        this.history.record(slideId, attempt);

        // Check if satisfied
        if (judgment.overall >= this.threshold) {
          return {
            markdown: currentMarkdown,
            success: true,
            attempts: attempts
          };
        }

        // Check for loop
        if (this.history.hasLoop(slideId, currentMarkdown)) {
          console.warn(`Fix loop detected at iteration ${i + 1}`);
          break;
        }

        // Fix
        currentMarkdown = await this.fixer.fix(currentMarkdown, judgment);

      } finally {
        this.serverPool.release(server);
      }
    }

    // Auto-fix failed, try human intervention
    if (interactive && options.onInterventionNeeded) {
      return await options.onInterventionNeeded(currentMarkdown, attempts);
    }

    // Return best result
    return {
      markdown: currentMarkdown,
      success: false,
      attempts: attempts,
      warning: 'Auto-fix exhausted, manual review recommended'
    };
  }

  async close() {
    await this.serverPool.closeAll();
    await this.capturer.close();
    this.judge.close();
  }
}

module.exports = { VerifyFixLoop };
```

**Step 3: Write basic test**

Create `tests/unit/verify-fix-loop.test.js`:
```javascript
const { VerifyFixLoop } = require('../core/verify-fix-loop');

describe('VerifyFixLoop', () => {
  test('should initialize with default options', () => {
    const loop = new VerifyFixLoop();

    expect(loop.threshold).toBe(80);
    expect(loop.maxIterations).toBe(3);
  });

  test('should detect fix loops', async () => {
    const loop = new VerifyFixLoop();

    loop.history.record('test-slide', {
      markdown: '# Test',
      markdownHash: 'abc123'
    });

    expect(loop.history.hasLoop('test-slide', '# Test')).toBe(true);
  });
});
```

**Step 4: Run tests**

Run: `npm test -- tests/unit/verify-fix-loop.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add core/verify-fix-loop.js core/attempt-history.js tests/unit/verify-fix-loop.test.js
git commit -m "feat: implement VerifyFixLoop with auto-fix and loop detection"
```

---

### Task 9: Human Intervention Manager

**Files:**
- Create: `core/human-intervention.js'
- Create: `utils/terminal.js'

**Step 1: Implement HumanIntervention**

Create `core/human-intervention.js`:
```javascript
const readline = require('readline');
const { spawn } = require('child_process');

class HumanIntervention {
  constructor(options = {}) {
    this.options = options;
  }

  async handle(markdown, attemptHistory) {
    this.displayFailureReport(attemptHistory);
    const choice = await this.promptUser();

    switch (choice.action) {
      case 'skip':
        return this.skip(markdown, attemptHistory);

      case 'edit':
        return await this.edit(markdown, attemptHistory);

      case 'view':
        await this.viewScreenshots(attemptHistory);
        return await this.handle(markdown, attemptHistory);

      case 'layout':
        return await this.applyLayout(markdown, choice.layout);

      case 'defer':
        return this.defer(markdown, attemptHistory);

      default:
        return this.skip(markdown, attemptHistory);
    }
  }

  displayFailureReport(history) {
    console.log('\n=== 自动修复失败 ===\n');
    console.log(`尝试次数: ${history.length}`);

    const maxScore = Math.max(...history.map(h => h.score));
    console.log(`最高分数: ${maxScore}/100 (阈值: ${this.options.threshold || 80})`);

    console.log('\n=== 尝试历史 ===');
    history.forEach((attempt, i) => {
      console.log(`\n[尝试 ${i + 1}]`);
      console.log(`  方案: ${attempt.approach}`);
      console.log(`  分数: ${attempt.score}/100`);
      console.log(`  问题: ${attempt.issues.join(', ') || '无'}`);
    });
  }

  async promptUser() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log('\n=== 请选择处理方式 ===');
    console.log('1. 跳过此幻灯片，使用当前版本');
    console.log('2. 手动编辑 Markdown');
    console.log('3. 查看所有尝试的截图');
    console.log('4. 尝试特定布局（指定布局名称）');
    console.log('5. 标记为"已知问题"，稍后处理');

    const answer = await new Promise((resolve) => {
      rl.question('\n请输入选项 (1-5): ', (input) => {
        rl.close();
        resolve(input.trim());
      });
    });

    return this.parseChoice(answer);
  }

  parseChoice(input) {
    const choiceMap = {
      '1': { action: 'skip' },
      '2': { action: 'edit' },
      '3': { action: 'view' },
      '4': { action: 'layout' },
      '5': { action: 'defer' }
    };

    if (choiceMap[input]) {
      return choiceMap[input];
    }

    if (input.startsWith('4') && input.includes(' ')) {
      const layout = input.split(' ')[1];
      return { action: 'layout', layout };
    }

    return { action: 'skip' };
  }

  skip(markdown, history) {
    return {
      markdown: markdown,
      success: false,
      skipped: true,
      attempts: history
    };
  }

  async edit(markdown, history) {
    const tempFile = `/tmp/slide-edit-${Date.now()}.md`;
    const fs = require('fs').promises;
    await fs.writeFile(tempFile, markdown);

    console.log(`\n正在打开编辑器: ${tempFile}`);
    console.log('编辑完成后按 Ctrl+D 继续\n');

    await this.openEditor(tempFile);

    const edited = await fs.readFile(tempFile, 'utf-8');

    return {
      markdown: edited,
      success: true,
      manual: true,
      attempts: history
    };
  }

  async openEditor(file) {
    const editor = process.env.EDITOR || 'nano';

    return new Promise((resolve, reject) => {
      const proc = spawn(editor, [file], {
        stdio: 'inherit'
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });
    });
  }

  async viewScreenshots(history) {
    const { open } = require('open');

    console.log('\n正在打开截图...\n');

    for (const attempt of history) {
      if (attempt.screenshot) {
        await open(attempt.screenshot);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  async applyLayout(markdown, layout) {
    const newMarkdown = `---\nlayout: ${layout}\n---\n\n${markdown}`;

    return {
      markdown: newMarkdown,
      success: false,
      needsVerification: true,
      attempts: []
    };
  }

  defer(markdown, history) {
    return {
      markdown: markdown,
      success: false,
      deferred: true,
      attempts: history
    };
  }
}

module.exports = { HumanIntervention };
```

**Step 2: Commit**

```bash
git add core/human-intervention.js
git commit -m "feat: implement HumanIntervention manager for manual fixes"
```

---

## Phase 3: Performance Optimization (Week 6-7)

### Task 10: Three-Layer Cache System

**Files:**
- Create: `core/cache-manager.js'
- Create: `utils/disk-cache.js'
- Create: `utils/semantic-cache.js'
- Create: `tests/unit/cache-manager.test.js'

**Step 1: Implement CacheManager**

Create `core/cache-manager.js`:
```javascript
const LRUCache = require('lru-cache');
const { DiskCache } = require('../utils/disk-cache');
const { SemanticCache } = require('../utils/semantic-cache');

class CacheManager {
  constructor(options = {}) {
    this.l1 = new LRUCache({
      max: options.l1Max || 100,
      ttl: options.l1TTL || 60000 // 1 minute
    });

    this.l2 = new DiskCache({
      dir: options.cacheDir || '/tmp/slides-cache',
      ttl: options.l2TTL || 3600000 // 1 hour
    });

    this.l3 = new SemanticCache({
      threshold: options.similarityThreshold || 0.85
    });

    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      l3Hits: 0,
      misses: 0
    };
  }

  async get(key) {
    // L1: Memory cache
    const l1Value = this.l1.get(key);
    if (l1Value !== undefined) {
      this.stats.l1Hits++;
      return { source: 'L1', value: l1Value };
    }

    // L2: Disk cache
    const l2Value = await this.l2.get(key);
    if (l2Value) {
      this.l1.set(key, l2Value);
      this.stats.l2Hits++;
      return { source: 'L2', value: l2Value };
    }

    // L3: Semantic cache
    const l3Value = await this.l3.findSimilar(key);
    if (l3Value) {
      this.l1.set(key, l3Value);
      await this.l2.set(key, l3Value);
      this.stats.l3Hits++;
      return { source: 'L3', value: l3Value };
    }

    this.stats.misses++;
    return null;
  }

  async set(key, value, metadata = {}) {
    this.l1.set(key, value);
    await this.l2.set(key, value);
    await this.l3.index(key, value, metadata);
  }

  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits + this.stats.misses;

    return {
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      l3Hits: this.stats.l3Hits,
      misses: this.stats.misses,
      total,
      hitRate: total > 0 ? (this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits) / total : 0,
      l1HitRate: total > 0 ? this.stats.l1Hits / total : 0,
      l2HitRate: total > 0 ? this.stats.l2Hits / total : 0,
      l3HitRate: total > 0 ? this.stats.l3Hits / total : 0
    };
  }

  async clear() {
    this.l1.clear();
    await this.l2.clear();
    await this.l3.clear();
    this.stats = { l1Hits: 0, l2Hits: 0, l3Hits: 0, misses: 0 };
  }
}

module.exports = { CacheManager };
```

**Step 2: Implement supporting caches**

Create `utils/disk-cache.js` and `utils/semantic-cache.js` (implementations omitted for brevity, use standard file system caching and vector similarity).

**Step 3: Commit**

```bash
git add core/cache-manager.js utils/disk-cache.js utils/semantic-cache.js tests/unit/cache-manager.test.js
git commit -m "feat: implement three-layer caching system (L1 memory, L2 disk, L3 semantic)"
```

---

## Phase 4: Integration and CLI (Week 8)

### Task 11: Update CLI with New Features

**Files:**
- Modify: `cli.js`
- Modify: `core/slide-generator.js` (integrate VerifyFixLoop)

**Step 1: Update SlideGenerator to use VerifyFixLoop**

Modify `core/slide-generator.js`:
```javascript
const { VerifyFixLoop } = require('./verify-fix-loop');

class SlideGenerator {
  constructor(options = {}) {
    // ... existing code ...
    this.verifyFixLoop = options.verifyEnabled
      ? new VerifyFixLoop(options)
      : null;
  }

  async generate(inputPath, options = {}) {
    // ... existing analysis code ...

    // Generate slides with verification
    const slides = [];
    for (const section of analysis.sections) {
      for (let i = 0; i < section.contents.length; i++) {
        const content = section.contents[i];
        const slideId = `${section.id}-${i}`;
        let slideMarkdown = this.generateSlide(content);

        // Verify and fix if enabled
        if (this.verifyFixLoop) {
          const result = await this.verifyFixLoop.verify(
            slideMarkdown,
            slideId,
            {
              interactive: options.interactive,
              onInterventionNeeded: options.interactive
                ? (markdown, attempts) => this.handleIntervention(markdown, attempts)
                : undefined
            }
          );

          slideMarkdown = result.markdown;
        }

        slides.push(slideMarkdown);
      }
    }

    // ... rest of existing code ...
  }

  async handleIntervention(markdown, attempts) {
    const { HumanIntervention } = require('./human-intervention');
    const intervention = new HumanIntervention();
    return await intervention.handle(markdown, attempts);
  }
}
```

**Step 2: Update CLI**

Modify `cli.js` to add new options:
```javascript
program
  .command('generate')
  .option('--interactive', 'Enable human intervention mode')
  .option('--no-verify', 'Disable verification')
  .option('--max-iterations <n>', 'Max auto-fix iterations', '3')
  .option('--threshold <score>', 'Quality threshold', '80')
  // ... rest of command
```

**Step 3: Commit**

```bash
git add core/slide-generator.js cli.js
git commit -m "feat: integrate VerifyFixLoop with CLI options"
```

---

### Task 12: Documentation and Final Polish

**Files:**
- Create: `README.v2.md`
- Create: `docs/USAGE.md`
- Modify: `CHANGELOG.md`

**Step 1: Create comprehensive documentation**

Create documentation files covering:
- Installation instructions
- Usage examples
- Configuration options
- API reference
- Troubleshooting guide

**Step 2: Update CHANGELOG**

Add entry for v2.0.0 with all changes.

**Step 3: Final commit**

```bash
git add README.v2.md docs/USAGE.md CHANGELOG.md
git commit -m "docs: add v2.0 documentation and usage guide"
```

---

## Testing Strategy

### Unit Tests
- Run: `npm run test:unit`
- Target: 75% coverage

### Integration Tests
- Run: `npm run test:integration`
- Focus: Core workflows

### End-to-End Tests
- Run: `npm run test:e2e`
- Validate: Complete CLI workflows

---

## Git Commit Strategy

Follow the commit pattern:
- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `docs:` - Documentation
- `chore:` - Maintenance tasks

Commit frequently (every 1-2 tasks) with descriptive messages.

---

## Success Criteria

### Phase 1 (Week 2)
- ✅ Basic slide generation works
- ✅ Unit tests pass (70%+ coverage)

### Phase 2 (Week 5)
- ✅ Verification system works end-to-end
- ✅ Human intervention flow tested
- ✅ LLM integration functional

### Phase 3 (Week 7)
- ✅ Cache hit rate > 85%
- ✅ Performance targets met

### Phase 4 (Week 8)
- ✅ Production-ready deployment
- ✅ Documentation complete
- ✅ v2.0.0 released

---

## Next Steps

After completing this implementation plan:
1. Run full test suite
2. Generate performance benchmarks
3. Create user guide with examples
4. Deploy to production
5. Monitor and iterate based on feedback

**Happy Coding!** 🚀

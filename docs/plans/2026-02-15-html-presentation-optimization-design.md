# HTML Presentation Skill - Complete System Redesign Design Document

**Date:** 2026-02-15
**Version:** 1.0
**Status:** Approved
**Author:** Claude (with user collaboration)

---

## Executive Summary

This document outlines the complete redesign of the `html-presentation` skill (Approach 3), transforming it from a basic Slidev wrapper into a production-grade presentation system with interactive preview capabilities, LLM-powered content optimization, and comprehensive multi-platform support.

**Key Improvements:**
- Interactive browser preview with live reload (headed device support)
- Intelligent content analysis and smart slide splitting
- Community theme integration with smart recommendations
- LLM-powered content optimization (4 levels)
- Robust error handling with graceful degradation
- Comprehensive test coverage (90%+ target)

**Target Use Case:** Mixed content presentations combining code, images, diagrams, and text in Chinese/English.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Component Design](#2-component-design)
3. [Data Flow & Interactive Preview](#3-data-flow--interactive-preview-system)
4. [Advanced Content Analysis (LLM-Powered)](#4-advanced-content-analysis-llm-powered)
5. [Error Handling & Resilience](#5-error-handling--resilience)
6. [Testing Strategy](#6-testing-strategy)
7. [Implementation Plan](#7-implementation-plan)

---

## 1. Architecture Overview

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    HTML Presentation System v5.0                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    PREVIEW LAYER                           │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Browser      │  │ Live Reload  │  │ Visual       │     │ │
│  │  │ Preview      │  │ Monitor      │  │ Inspector    │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↕ WebSocket                            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    PRESENTATION ENGINE                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Content      │  │ Layout       │  │ Theme        │     │ │
│  │  │ Analyzer     │  │ Engine       │  │ Manager      │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Slide        │  │ Asset        │  │ Export       │     │ │
│  │  │ Generator    │  │ Processor    │  │ Manager      │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↕                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    ANALYSIS LAYER                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Structure    │  │ Content      │  │ Visual       │     │ │
│  │  │ Analyzer     │  │ Classifier   │  │ Optimizer    │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  │  ┌──────────────┐  ┌──────────────┐                         │ │
│  │  │ LLM          │  │ Rule-Based   │                         │ │
│  │  │ Optimizer    │  │ Optimizer    │                         │ │
│  │  └──────────────┘  └──────────────┘                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          ↕                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    CORE LAYER                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │ Markdown     │  │ Slidev       │  │ Config       │     │ │
│  │  │ Parser       │  │ Wrapper      │  │ Manager      │     │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Interactive First**: Real-time preview drives development workflow
2. **Content-Aware**: Understands what type of content is being presented
3. **Theme Extensible**: Easy to add new themes from community
4. **Export Ready**: Multiple output formats (PDF, HTML, screenshots)
5. **Error Resilient**: Graceful degradation with clear recovery paths
6. **Cross-Platform**: Works on macOS, Linux (X11/Wayland), Windows

---

## 2. Component Design

### 2.1 Content Analyzer

**Purpose:** Analyze markdown content and extract structural/semantic information

**Key Responsibilities:**
- Parse markdown structure (headings, sections, hierarchy)
- Classify content types (code, images, tables, lists)
- Calculate content metrics (word count, code block count, image count)
- Detect visual hierarchy (importance levels, section depth)

**API Interface:**

```javascript
class ContentAnalyzer {
  // Analyze markdown file
  analyze(markdownPath: string): Promise<AnalysisResult>

  // Classify content type
  classifyContent(section: Section): ContentType

  // Calculate metrics
  calculateMetrics(content: string): ContentMetrics

  // Detect hierarchy
  detectHierarchy(structure: Structure): HierarchyTree
}

// Output structure
interface AnalysisResult {
  structure: SectionTree;           // Hierarchical structure
  contentTypes: ContentTypeMap;     // Code, images, tables, etc.
  metrics: ContentMetrics;          // Counts, densities
  recommendations: LayoutRecommendation[]; // Suggested layouts
}
```

**Key Algorithms:**

1. **Structure Detection**
   - Parse heading hierarchy (H1 → H2 → H3 → H4)
   - Group content by sections
   - Detect section boundaries

2. **Content Classification**
   - Code blocks: Detect language, calculate complexity
   - Images: Extract URLs, check dimensions
   - Tables: Count rows/columns, check complexity
   - Lists: Detect nesting depth, item count

3. **Metrics Calculation**
   - Content density (chars per slide)
   - Code ratio (code / total content)
   - Image ratio (image count / total slides)
   - Readability score

---

### 2.2 Layout Engine

**Purpose:** Assign appropriate layouts to slides based on content composition

**Layout Types:**

```javascript
const LAYOUTS = {
  // Text-focused
  'title': { content: { text: 100, code: 0, image: 0 } },
  'section': { content: { text: 100, code: 0, image: 0 } },

  // Code-focused
  'code-focus': { content: { text: 30, code: 70, image: 0 } },
  'code-full': { content: { text: 0, code: 100, image: 0 } },

  // Image-focused
  'image-focus': { content: { text: 20, code: 0, image: 80 } },
  'image-full': { content: { text: 0, code: 0, image: 100 } },

  // Mixed
  'two-col': { content: { text: 50, code: 50, image: 0 } },
  'image-right': { content: { text: 60, code: 0, image: 40 } },
  'image-left': { content: { text: 60, code: 0, image: 40 } },
  'two-col-image': { content: { text: 30, code: 30, image: 40 } },

  // Complex
  'card-grid': { content: { text: 40, code: 0, image: 60 } },
  'default': { content: { text: 100, code: 0, image: 0 } }
};
```

**Layout Selection Logic:**

```javascript
function selectLayout(content: ContentMetrics): LayoutType {
  const { codeRatio, imageRatio, textRatio } = content;

  // Code-heavy slides
  if (codeRatio > 0.6) return 'code-focus';
  if (codeRatio > 0.9) return 'code-full';

  // Image-heavy slides
  if (imageRatio > 0.6) return 'image-focus';
  if (imageRatio > 0.9) return 'image-full';

  // Balanced content
  if (codeRatio > 0.3 && imageRatio > 0.2) return 'two-col-image';
  if (codeRatio > 0.3) return 'two-col';
  if (imageRatio > 0.3) {
    return content.firstElementIsImage ? 'image-left' : 'image-right';
  }

  return 'default';
}
```

---

### 2.3 Theme Manager

**Purpose:** Manage and recommend Slidev community themes

**Community Themes Database:**

```javascript
const OFFICIAL_THEMES = [
  {
    name: 'seriph',
    style: 'professional',
    bestFor: ['mixed', 'business', 'technical'],
    description: 'Elegant professional theme for mixed content'
  },
  {
    name: 'default',
    style: 'minimal',
    bestFor: ['code', 'technical'],
    description: 'Minimal style, great for code'
  },
  {
    name: 'apple-basic',
    style: 'modern',
    bestFor: ['business', 'design'],
    description: 'Apple-style, modern and clean'
  }
];

const COMMUNITY_THEMES = [
  {
    name: 'shibainu',
    package: '@slidev/theme-shibainu',
    style: 'playful',
    bestFor: ['casual', 'creative'],
    install: 'npm install @slidev/theme-shibainu',
    description: 'Cute playful style'
  },
  {
    name: 'dracula',
    package: '@slidev/theme-dracula',
    style: 'dark',
    bestFor: ['code', 'technical'],
    install: 'npm install @slidev/theme-dracula',
    description: 'Dracula dark theme, code-friendly'
  }
];
```

**Smart Recommendation Logic:**

```javascript
function recommendTheme(content: ContentMetrics): ThemeRecommendation[] {
  const recommendations = [];
  const { codeRatio, imageRatio, style } = content;

  // Code-heavy → Dark theme
  if (codeRatio > 0.5) {
    recommendations.push({
      theme: 'dracula',
      package: '@slidev/theme-dracula',
      reason: 'Dark theme highlights code syntax',
      priority: 'high'
    });
  }

  // Image-heavy → Light theme
  if (imageRatio > 0.5) {
    recommendations.push({
      theme: 'seriph',
      package: '@slidev/theme-seriph',
      reason: 'Elegant theme with great image presentation',
      priority: 'high'
    });
  }

  // Mixed content → Balanced theme
  if (codeRatio > 0.2 && imageRatio > 0.2) {
    recommendations.push({
      theme: 'seriph',
      package: '@slidev/theme-seriph',
      reason: 'Current theme, suitable for mixed content',
      priority: 'high'
    });
  }

  return recommendations;
}
```

**Theme Configuration with CSS Overrides:**

While not creating themes from scratch, we optimize theme configuration for Chinese content and mixed content:

```javascript
const THEME_CONFIGS = {
  seriph: {
    frontmatter: {
      theme: 'seriph',
      highlighter: 'shiki',
      lineNumbers: false,
      class: 'text-left'
    },
    cssOverrides: `
      /* Chinese optimization */
      .slide-content {
        line-height: 1.8;
        letter-spacing: 0.02em;
      }

      /* Code block optimization */
      pre {
        font-size: 0.85em;
        max-height: 400px;
        overflow-y: auto;
      }

      /* Image optimization */
      img {
        max-height: 450px;
        object-fit: contain;
      }
    `
  }
};
```

---

## 3. Data Flow & Interactive Preview System

### Complete Data Flow

```
INPUT STAGE
    ↓
1. User Input
   - Markdown file
   - Config options
   - Command (dev/build/export)

ANALYSIS STAGE
    ↓
2. Content Analyzer
   - Parse structure
   - Classify content types
   - Calculate metrics

3. Theme Recommender
   - Analyze characteristics
   - Match against theme database
   - Return ranked recommendations

4. LLM Optimizer (optional)
   - Content summarization
   - Slide structure optimization
   - Visual hierarchy suggestions

GENERATION STAGE
    ↓
5. Slide Generator
   - Split content into slides
   - Assign layouts
   - Generate Slidev markdown

6. Theme Configurator
   - Apply selected theme
   - Add CSS overrides
   - Generate frontmatter

PREVIEW STAGE
    ↓
7. Dev Server Manager
   - Detect display availability
   - Start Slidev dev server
   - Expose WebSocket for live reload

8. Browser Automation (if display available)
   - Launch browser
   - Open http://localhost:3030
   - Keep window visible

INTERACTION LOOP
    ↓
9. File Watcher
   - Monitor source markdown
   - Detect modifications
   - Trigger regeneration

10. Live Reload
    - Regenerate slides
    - Notify browser via WebSocket
    - Auto-refresh browser view

11. Visual Inspector (optional)
    - Capture screenshots
    - Analyze rendered output
    - Provide feedback

OUTPUT STAGE
    ↓
12. Export Manager (on demand)
    - Export to PDF
    - Export to static HTML
    - Export screenshots
    - Package for deployment
```

### Interactive Preview System

**Cross-Platform Display Detection:**

```javascript
class PlatformDetector {
  static getPlatform(): Platform {
    return {
      type: process.platform,
      hasDisplay: this.checkDisplay(),
      defaultBrowser: this.getDefaultBrowser()
    };
  }

  static checkDisplay(): boolean {
    switch (process.platform) {
      case 'darwin':
        // macOS: Check for WindowServer
        try {
          execSync('pgrep WindowServer', { stdio: 'ignore' });
          return true;
        } catch { return false; }

      case 'linux':
        // Linux: Check DISPLAY
        return !!process.env.DISPLAY;

      case 'win32':
        // Windows: Always has display
        return true;

      default:
        return false;
    }
  }
}
```

**Preview Manager:**

```javascript
class PreviewManager {
  async startPreview(options: PreviewOptions): Promise<void> {
    // 1. Detect display
    this.displayAvailable = await this.detectDisplay();

    if (!this.displayAvailable) {
      console.log('⚠️  No display detected, using headless mode');
      return;
    }

    // 2. Start Slidev dev server
    const port = options.port || 3030;
    await this.startSlidevServer(port);

    // 3. Launch browser
    await this.launchBrowser();

    // 4. Open page
    await this.openPage(`http://localhost:${port}`);

    // 5. Start file watcher
    this.startWatcher(options.inputFile);
  }

  async launchBrowser(): Promise<void> {
    const puppeteer = require('puppeteer');

    this.browser = await puppeteer.launch({
      headless: false,  // Headed mode
      args: ['--start-maximized', '--disable-http-cache']
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  startWatcher(inputFile: string): void {
    const chokidar = require('chokidar');
    this.watcher = chokidar.watch(inputFile);

    this.watcher.on('change', async () => {
      console.log('📝 File changed, regenerating...');
      await this.regenerateSlides();
      await this.notifyBrowser();
    });
  }
}
```

---

## 4. Advanced Content Analysis (LLM-Powered)

### LLM Optimizer Architecture

```
ANALYSIS LAYER
    ↓
- Content Analyzer
- Structure Analyzer
- Visual Analyzer

OPTIMIZATION LAYER
    ↓
- Slide Splitter
- Content Refiner
- Layout Optimizer

LLM INTEGRATION
    ↓
- Anthropic API Client
- Prompt Templates
- Response Parser
```

### Optimization Strategies

**1. Content Refinement**

Extract key points and simplify lengthy content for slides:

```javascript
class ContentRefiner {
  async refineContent(content: string, context: RefineContext): Promise<RefinedContent> {
    const prompt = `
You are a professional content editor optimizing content for slide presentations.

**Original Content:**
\`\`\`
${content}
\`\`\`

**Context:**
- Title: ${context.title}
- Content Type: ${context.contentType}
- Target Length: ${context.targetLength} chars
- Audience: ${context.audience}

**Task:**
1. Extract key points (preserve critical information)
2. Simplify lengthy descriptions (use bullet points)
3. Preserve code examples (if any)
4. Maintain logical structure

**Output Format (JSON):**
\`\`\`json
{
  "summary": "Brief summary (2-3 sentences)",
  "keyPoints": ["point1", "point2", "point3"],
  "codeExamples": ["preserved code"],
  "simplified": true/false
}
\`\`\`
`;

    const response = await this.callLLM(prompt);
    return JSON.parse(response);
  }
}
```

**2. Intelligent Splitting**

Automatically identify reasonable split points:

```javascript
class IntelligentSplitter {
  async splitWithLLM(content: string, options: SplitOptions): Promise<SlideSplit[]> {
    const prompt = `
You are a professional slide designer splitting content into multiple slides.

**Content:**
\`\`\`
${content}
\`\`\`

**Requirements:**
1. Max ${options.maxContent} chars per slide
2. Maintain content integrity and logic
3. Don't split mid-sentence
4. Keep code blocks complete in one slide
5. Keep images with descriptions together

**Output Format (JSON):**
\`\`\`json
[
  {
    "slideNumber": 1,
    "title": "Slide title",
    "content": "Slide content",
    "estimatedChars": 500,
    "layout": "recommended-layout"
  }
]
\`\`\`
`;

    const response = await this.callLLM(prompt);
    return JSON.parse(response);
  }
}
```

**3. Multimodal Processing**

Handle content with images, diagrams, and code:

```javascript
class MultimodalProcessor {
  async analyzeImageLayout(images: ImageRef[], content: string): Promise<LayoutSuggestion[]> {
    const prompt = `
You are a professional layout designer recommending image layouts for slides.

**Content Summary:**
\`\`\`
${this.summarizeContent(content, 500)}
\`\`\`

**Image Info:**
${images.map((img, i) => `
${i + 1}. ${img.filename}
   - Size: ${img.width}x${img.height}
   - Line: ${img.lineNumber}
   - Context: ${img.context}
`).join('\n')}

**Task:**
Recommend best layout for each image:
- image-focus: Single image as main content
- image-right: Image right, text left
- image-left: Image left, text right
- two-col-image: Image and text in two columns
- card-grid: Multiple images as cards

**Output Format (JSON):**
\`\`\`json
[
  {
    "imageRef": "image1",
    "recommendedLayout": "image-right",
    "reason": "Explanation",
    "position": "top/bottom/middle"
  }
]
\`\`\`
`;

    const response = await this.callLLM(prompt);
    return JSON.parse(response);
  }
}
```

### LLM API Integration

```javascript
class LLMClient {
  private apiKey: string;
  private baseURL: string;
  private cache = new Map<string, any>();

  async callWithCache(prompt: string, options?: LLMOptions): Promise<string> {
    const cacheKey = this.hashPrompt(prompt);

    if (this.cache.has(cacheKey)) {
      console.log('♻️  Using cached LLM response');
      return this.cache.get(cacheKey);
    }

    const response = await this.callLLM(prompt, options);
    this.cache.set(cacheKey, response);

    return response;
  }

  async batchCall(prompts: string[]): Promise<string[]> {
    return Promise.all(prompts.map(p => this.callWithCache(p)));
  }
}
```

### Optimization Level Control

```javascript
const OPTIMIZATION_LEVELS = {
  none: { llm: false, smartSplit: false, contentRefine: false, hierarchyOpt: false },
  basic: { llm: false, smartSplit: true, contentRefine: false, hierarchyOpt: true },
  standard: { llm: true, smartSplit: true, contentRefine: true, hierarchyOpt: true, llmTasks: ['layout', 'hierarchy'] },
  full: { llm: true, smartSplit: true, contentRefine: true, hierarchyOpt: true, llmTasks: ['layout', 'hierarchy', 'split', 'refine', 'multimodal'] }
};
```

---

## 5. Error Handling & Resilience

### Error Classification

```javascript
class ErrorHandler {
  private classifyError(error: Error): ErrorLevel {
    if (error instanceof FileNotFoundError) return 'fatal';
    if (error instanceof PermissionError) return 'fatal';
    if (error instanceof APIKeyError) return 'severe';
    if (error instanceof RateLimitError) return 'moderate';
    if (error instanceof TimeoutError) return 'moderate';
    if (error instanceof ImageNotFoundError) return 'minor';
    return 'moderate';
  }
}
```

### LLM API Error Handling with Retry

```javascript
class LLMErrorHandler {
  async callWithRetry(fn: () => Promise<string>, options: RetryOptions): Promise<string> {
    const maxRetries = options.maxRetries || 3;
    const delay = options.initialDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (this.isRecoverable(error)) {
          console.warn(`⚠️  LLM API error (attempt ${attempt}/${maxRetries}): ${error.message}`);

          if (attempt < maxRetries) {
            const waitTime = delay * Math.pow(2, attempt - 1);  // Exponential backoff
            await this.sleep(waitTime);
            continue;
          }
        }

        throw this.enhanceError(error, attempt);
      }
    }
  }

  private isRecoverable(error: Error): boolean {
    const recoverablePatterns = [
      /rate limit/i, /timeout/i, /connection/i, /temporary/i, /503/, /502/, /429/
    ];
    return recoverablePatterns.some(pattern => pattern.test(error.message));
  }
}
```

### Graceful Degradation

```javascript
class GracefulDegradation {
  async degrade(error: Error, context: ProcessingContext): Promise<DegradedResult> {
    const level = this.classifyError(error);

    switch (level) {
      case 'fatal':
        return { canContinue: false, message: 'Cannot continue due to fatal error', error };

      case 'severe':
        console.warn('⚠️  Severe error, falling back to basic mode');
        return await this.fallbackToBasic(context);

      case 'moderate':
        console.warn('⚠️  Moderate error, some features disabled');
        return await this.disableFeatures(context, this.getAffectedFeatures(error));

      case 'minor':
        console.warn('⚠️  Minor error, continuing with reduced functionality');
        return { canContinue: true, warnings: [error.message] };
    }
  }
}
```

### Health Check System

```javascript
class HealthChecker {
  async check(): Promise<HealthReport> {
    const checks = {
      api: await this.checkAPI(),
      theme: await this.checkTheme(),
      display: await this.checkDisplay(),
      disk: await this.checkDiskSpace(),
      memory: await this.checkMemory()
    };

    const healthy = Object.values(checks).every(c => c.status === 'ok');

    return { healthy, checks, timestamp: new Date().toISOString() };
  }

  private async checkAPI(): Promise<CheckResult> {
    try {
      const client = new LLMClient();
      await client.callLLM('test', { maxTokens: 10 });
      return { status: 'ok', message: 'API connection successful' };
    } catch (error) {
      return {
        status: 'error',
        message: `API connection failed: ${error.message}`,
        suggestion: 'Check ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json'
      };
    }
  }
}
```

---

## 6. Testing Strategy

### Test Pyramid

```
           /\
          /  \     E2E Tests (少量)
         /____\
        /      \
       / Integration Tests (中等)
      /__________\
     /            \
    / Unit Tests (大量)
   /________________\
```

### Unit Tests (90%+ Coverage Target)

**Component Coverage:**

| Component | Target | Key Tests |
|-----------|--------|-----------|
| ContentAnalyzer | 90% | Structure parsing, content classification, metrics calculation |
| LayoutEngine | 85% | Layout selection logic, content type detection |
| ThemeManager | 80% | Theme recommendation, installation checks |
| LLMClient | 85% | Retry mechanism, caching, batch processing |
| SlideGenerator | 85% | Slide splitting, markdown generation |
| PreviewManager | 80% | Display detection, browser launch, file watching |
| ErrorHandler | 90% | Error classification, retry logic, degradation |

**Example Test:**

```javascript
describe('ContentAnalyzer', () => {
  test('should parse markdown structure', async () => {
    const analyzer = new ContentAnalyzer();
    const result = await analyzer.analyze('test/fixtures/simple.md');

    expect(result.structure).toBeDefined();
    expect(result.structure.sections).toHaveLength(5);
  });

  test('should classify code-heavy slides', () => {
    const analyzer = new ContentAnalyzer();
    const content = { codeBlocks: 5, images: 0, tables: 0, totalWords: 100 };

    const type = analyzer.classifyContent(content);
    expect(type).toBe('code-focused');
  });
});
```

### Integration Tests

**Key Scenarios:**

1. **Generation Pipeline:** Analyze → Layout → Generate
2. **Optimization Pipeline:** Content → LLM Optimize → Generate
3. **Preview System:** Start → File Change → Reload
4. **Error Handling:** Missing file, LLM error, cleanup

### E2E Tests

**User Workflows:**

```javascript
describe('Development Workflow E2E', () => {
  test('should complete full dev workflow', async () => {
    // 1. Start with sample markdown
    const inputFile = 'test/fixtures/sample.md';

    // 2. Run build command
    const buildProcess = spawn('node', ['scripts/build.js', inputFile]);

    // 3. Wait for server
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 4. Verify server
    const response = await fetch('http://localhost:3030');
    expect(response.ok).toBe(true);

    // 5. Cleanup
    buildProcess.kill();
  });
});
```

### Visual Regression Tests

```javascript
describe('Visual Regression Tests', () => {
  test('should match expected slide appearance', async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await page.goto('http://localhost:3030');
    await page.screenshot({ path: 'test/screenshots/actual.png', fullPage: true });

    const looksSame = require('looks-same');
    const diff = await looksSame('test/screenshots/baseline.png', 'test/screenshots/actual.png');

    expect(diff.equal).toBe(true);
  });
});
```

### Performance Tests

```javascript
describe('Performance Tests', () => {
  test('should handle large file within reasonable time', async () => {
    const startTime = Date.now();

    const analyzer = new ContentAnalyzer();
    await analyzer.analyze('test/fixtures/large-file-10000-lines.md');

    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5000);  // < 5 seconds
  });
});
```

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [18.x, 20.x]

    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

---

## 7. Implementation Plan

### 5-Week Implementation Roadmap

#### Phase 1: Foundation (Week 1)

**Goal:** Establish core architecture and infrastructure

**Tasks:**
1. Project structure reorganization
2. Core utility classes (PlatformDetector, HealthChecker, ErrorHandler, Logger)
3. Test infrastructure setup (Jest, fixtures, CI/CD)

**Deliverables:**
- New project structure
- Core utility classes (tested)
- Test framework configured

**Acceptance Criteria:**
- All unit tests pass
- CI/CD pipeline runs successfully
- Basic health check works

---

#### Phase 2: Content Processing (Week 2)

**Goal:** Implement content analysis and generation

**Tasks:**
1. Content Analyzer implementation
   - Markdown parser
   - Content classifier
   - Metrics calculator
2. Layout Engine implementation
   - Layout selection logic
   - Layout configuration
3. Slide Generator implementation
   - Smart slide splitting
   - Slidev markdown generation
4. Theme Manager implementation
   - Theme database
   - Recommendation engine
   - Installation tool

**Deliverables:**
- Content Analyzer (fully tested)
- Layout Engine (fully tested)
- Slide Generator (fully tested)
- Theme Manager (fully tested)

**Acceptance Criteria:**
- Can analyze test document and generate Slidev markdown
- Layout selection accuracy > 80%
- Theme recommendations are reasonable

---

#### Phase 3: Preview System (Week 3)

**Goal:** Implement interactive preview system

**Tasks:**
1. Display Detection (macOS, Linux, Windows)
2. Browser Automation (Puppeteer integration)
3. File Watcher (chokidar integration)
4. Dev Server Manager (Slidev server control)
5. Interactive Workflow implementation

**Deliverables:**
- Preview Manager (fully tested)
- Cross-platform browser support
- Live reload functionality

**Acceptance Criteria:**
- Can launch browser preview on Mac
- File changes trigger auto-reload
- Degrades gracefully when no display

---

#### Phase 4: LLM Integration (Week 4)

**Goal:** Integrate LLM optimization features

**Tasks:**
1. LLM Client implementation
   - Anthropic API client
   - Retry mechanism
   - Caching system
   - Batch processing
2. Content Optimizer implementation
   - Content refinement
   - Intelligent splitting
   - Visual hierarchy optimization
3. Multimodal Processor implementation
   - Image layout analysis
   - Code block optimization
   - Table optimization
4. Optimization Controller implementation
   - Level-based optimization (none/basic/standard/full)
   - Degradation strategies

**Deliverables:**
- LLM Client (fully tested)
- Content Optimizer (fully tested)
- Multimodal Processor (fully tested)
- Tiered optimization system

**Acceptance Criteria:**
- LLM API calls succeed
- Optimization results are reasonable
- Degrades gracefully on errors

---

#### Phase 5: Polish & Testing (Week 5)

**Goal:** Optimization, testing, and documentation

**Tasks:**
1. Performance optimization
   - Large file handling
   - Memory usage optimization
   - Streaming processing
2. Error handling refinement
   - Additional error scenarios
   - Improved error messages
   - Recovery suggestions
3. Visual optimization
   - CSS refinements
   - Chinese typography improvements
   - Image display optimization
4. Documentation
   - README.md update
   - API documentation
   - User guide
   - Contributor guide
5. Test completion
   - Supplement unit tests
   - Supplement integration tests
   - Supplement E2E tests
   - Achieve coverage targets

**Deliverables:**
- Performance-optimized system
- Comprehensive error handling
- Complete documentation
- 100% test coverage target met

**Acceptance Criteria:**
- All tests pass
- Documentation complete
- Performance meets requirements

---

### Dependencies

```
Foundation (Week 1)
    ↓
    ├─→ Content Processing (Week 2)
    │       ↓
    │       ├─→ Preview System (Week 3)
    │       │       ↓
    │       │       └─→ LLM Integration (Week 4)
    │       │               ↓
    │       │               └─→ Polish & Testing (Week 5)
    │       │
    │       └───────────────┘ (Can be parallel)
    │
    └───────────────────────┘ (Foundation dependency)
```

### Milestones

| Milestone | Date | Deliverables |
|-----------|------|--------------|
| M1: Foundation Complete | Week 1 | Core architecture, test framework |
| M2: Content Processing Ready | Week 2 | Content analysis and generation |
| M3: Interactive Preview Working | Week 3 | Real-time preview functionality |
| M4: LLM Integration Done | Week 4 | Intelligent optimization features |
| M5: Production Ready | Week 5 | Complete system, documentation, tests |

### Risk Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| LLM API rate limiting | High | Medium | Caching, fallback to basic mode |
| Browser compatibility | Medium | Low | Puppeteer, multi-browser testing |
| Large file performance | Medium | Medium | Streaming, chunked optimization |
| Cross-platform issues | Medium | Medium | Comprehensive testing, CI multi-platform |
| Time constraints | High | Low | Prioritize core features, phased releases |

---

## Expected Results

### For Test File: `claude-code-practical-guide.md`

**Before Optimization:**
- ❌ Single slide with 5000%+ content overflow
- ❌ Inconsistent image sizing
- ❌ Code blocks too small
- ❌ Poor Chinese font rendering
- ❌ No preview capability

**After Optimization:**
- ✅ Intelligently split into 20-30 slides
- ✅ Auto-scaled images with optimal layouts
- ✅ Presentation-sized code blocks
- ✅ Clear, readable Chinese typography
- ✅ Real-time browser preview
- ✅ Instant refresh on file changes

---

## Appendices

### A. Technology Stack

- **Runtime**: Node.js >= 18
- **Framework**: Slidev (@slidev/cli)
- **LLM**: Anthropic Claude API
- **Browser Automation**: Puppeteer
- **Testing**: Jest
- **File Watching**: Chokidar
- **Markdown Parsing**: Custom + marked

### B. Configuration Files

**User Config Example:**

```json
{
  "theme": "seriph",
  "optimizeLevel": "standard",
  "port": 3030,
  "features": {
    "liveReload": true,
    "browserPreview": true,
    "llmOptimization": true
  }
}
```

### C. API Reference

*(Detailed API documentation will be generated during implementation)*

---

**Document Status:** ✅ Approved
**Next Steps:** Invoke `writing-plans` skill to create detailed implementation plan

---

**Signature:** Claude Code (v5.0 - Complete System Redesign)

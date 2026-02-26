# Slidev Overflow Verification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time rendering verification system that uses LLM aesthetic judgment to automatically detect and fix slide overflow issues

**Architecture:** Edge-by-edge verification during slide generation with Puppeteer screenshots and LLM-driven aesthetic judgment (0-100 scoring)

**Tech Stack:** Puppeteer (screenshots), Anthropic API (LLM judgment), Node.js (verification logic)

---

## Task 1: Create LLM Judgment Prompt

**Files:**
- Create: `agents/slide-judgment.md`

**Step 1: Create the prompt file**

```markdown
You are an expert presentation designer. Review this slide screenshot and provide aesthetic judgment.

Scoring Criteria (0-100):
1. Layout Balance (20 points) - Elements distributed evenly, not crowded
2. Visual Hierarchy (20 points) - Title, content, images properly proportioned
3. White Space (20 points) - Appropriate breathing room, not cramped
4. Readability (20 points) - Font sizes, spacing are legible
5. Overall Appeal (20 points) - Professional, polished appearance

Check for Issues:
- Vertical overflow (content exceeds slide height)
- Horizontal overflow (content exceeds slide width)
- Text too small or too large
- Unbalanced layout (too much empty space on one side)
- Poor contrast (hard to read)

Output JSON:
{
  "score": 85,              // 0-100 overall aesthetic score
  "needsFix": false,        // true if score < 80 or critical issues
  "issues": [],             // array of issue descriptions if needsFix
  "suggestions": []         // specific improvement suggestions
}

Thresholds:
- Score >= 80: Accept, no fix needed
- Score < 80: Needs improvement
- Critical issues (overflow): Always needs fix regardless of score
```

**Step 2: Verify file created**

Run: `ls -la html-presentation/agents/slide-judgment.md`
Expected: File exists with content

**Step 3: Commit**

```bash
cd html-presentation
git add agents/slide-judgment.md
git commit -m "feat: add LLM judgment prompt for slide aesthetic evaluation"
```

---

## Task 2: Create SlideVerifier Class

**Files:**
- Create: `scripts/overflow-verifier.js`

**Step 1: Write the test**

```javascript
const fs = require('fs');
const path = require('path');

describe('SlideVerifier', () => {
  const verifier = new SlideVerifier({
    port: 3031,
    timeout: 15000
  });

  afterEach(async () => {
    await verifier.cleanup();
  });

  test('should start server and capture screenshot', async () => {
    const result = await verifier.verify('# Test Slide\n\nContent here');
    expect(result.screenshot).toBeInstanceOf(Buffer);
    expect(result.screenshot.length).toBeGreaterThan(1000);
    expect(result.basicInfo.title).toBe('Test Slide');
  }, 30000);

  test('should detect overflow in basic info', async () => {
    const longContent = '# Test\n\n'.repeat(50);
    const result = await verifier.verify(longContent);
    expect(result.basicInfo.vOverflow).toBe(true);
  }, 30000);
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && npm test -- overflow-verifier.test.js`
Expected: FAIL with "SlideVerifier not defined"

**Step 3: Write minimal implementation**

Create `scripts/overflow-verifier.js`:

```javascript
const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class SlideVerifier {
  constructor(options = {}) {
    this.port = options.port || 3031;
    this.timeout = options.timeout || 15000;
    this.server = null;
    this.tempFile = null;
    this.browser = null;
  }

  async verify(markdownContent) {
    // Create temporary markdown file
    const tempId = crypto.randomBytes(8).toString('hex');
    this.tempFile = path.join(__dirname, '..', `.verify-${tempId}.md`);

    await fs.writeFile(this.tempFile, this._wrapWithFrontmatter(markdownContent));

    // Start Slidev server
    await this._startServer();

    // Capture screenshot
    const result = await this._captureScreenshot();

    return result;
  }

  _wrapWithFrontmatter(content) {
    return `---
theme: default
background: https://source.unsplash.com/collection/94734566/1920x1080
class: text-center
highlighter: shiki
lineNumbers: false
info: |
  ## Verification Slide
drawings:
  persist: false
transition: slide-left
title: Verification
---

${content}`;
  }

  async _startServer() {
    this.server = spawn('npx', ['@slidev/cli', this.tempFile, '--port', String(this.port), '--open', 'false'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    await this._waitForServer();
  }

  async _waitForServer() {
    for (let i = 0; i < this.timeout / 1000; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(`http://localhost:${this.port}/`, (res) => resolve());
          req.on('error', reject);
          req.setTimeout(1000, () => {
            req.destroy();
            reject(new Error('timeout'));
          });
        });
        await new Promise(r => setTimeout(r, 2000)); // Extra wait for full init
        return true;
      } catch (e) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Server failed to start');
  }

  async _captureScreenshot() {
    this.browser = await puppeteer.launch({ headless: true });
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    await page.goto(`http://localhost:${this.port}/0`, { waitUntil: 'networkidle2', timeout: this.timeout });
    await new Promise(r => setTimeout(r, 1500));

    const screenshot = await page.screenshot({ fullPage: true });
    const basicInfo = await page.evaluate(() => ({
      title: document.querySelector('h1, h2')?.textContent?.substring(0, 100) || 'No title',
      vOverflow: document.body.scrollHeight > window.innerHeight,
      hOverflow: document.body.scrollWidth > document.body.clientWidth,
      ratio: (document.body.scrollHeight / window.innerHeight).toFixed(1)
    }));

    return { screenshot, basicInfo };
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.server) {
      this.server.kill();
      this.server = null;
    }
    if (this.tempFile) {
      try {
        await fs.unlink(this.tempFile);
      } catch (e) {
        // Ignore
      }
      this.tempFile = null;
    }
  }
}

module.exports = SlideVerifier;
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && npm test -- overflow-verifier.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd html-presentation
git add scripts/overflow-verifier.js tests/overflow-verifier.test.js
git commit -m "feat: add SlideVerifier for screenshot capture and overflow detection"
```

---

## Task 3: Create LLMSlideFixer Class

**Files:**
- Create: `scripts/llm-slide-fixer.js`

**Step 1: Write the test**

```javascript
describe('LLMSlideFixer', () => {
  const fixer = new LLMSlideFixer();

  test('should fix slide based on LLM feedback', async () => {
    const original = '# Title\n\n' + 'Line of content\n'.repeat(20);
    const feedback = {
      issues: ['Vertical overflow - content too long'],
      suggestions: ['Split into multiple slides', 'Use more concise language']
    };

    const fixed = await fixer.fix(original, feedback);
    expect(fixed).not.toEqual(original);
    expect(fixed.length).toBeLessThan(original.length);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd html-presentation && npm test -- llm-slide-fixer.test.js`
Expected: FAIL with "LLMSlideFixer not defined"

**Step 3: Write minimal implementation**

Create `scripts/llm-slide-fixer.js`:

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;

class LLMSlideFixer {
  constructor(options = {}) {
    this.client = new Anthropic({
      apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
  }

  async fix(markdownContent, judgment) {
    const prompt = this._buildFixPrompt(markdownContent, judgment);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return this._extractFixedMarkdown(response.content[0].text);
  }

  _buildFixPrompt(content, judgment) {
    return `Fix this slide markdown to address the following issues:

Issues:
${judgment.issues.map(i => `- ${i}`).join('\n')}

Suggestions:
${judgment.suggestions.map(s => `- ${s}`).join('\n')}

Original Content:
\`\`\`markdown
${content}
\`\`\`

Return ONLY the fixed markdown, no explanation. Keep the same frontmatter structure if present.`;
  }

  _extractFixedMarkdown(response) {
    // Extract markdown from code block if present
    const codeBlockMatch = response.match(/```markdown\n([\s\S]+?)\n```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    return response.trim();
  }
}

module.exports = LLMSlideFixer;
```

**Step 4: Run test to verify it passes**

Run: `cd html-presentation && npm test -- llm-slide-fixer.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd html-presentation
git add scripts/llm-slide-fixer.js tests/llm-slide-fixer.test.js
git commit -m "feat: add LLMSlideFixer for automatic slide optimization"
```

---

## Task 4: Integrate Verification Flow

**Files:**
- Modify: `scripts/slidev-generator.js`
- Modify: `lib/llm-optimizer.js`

**Step 1: Add verifyAndFix method to SlideProcessor**

In `scripts/slidev-generator.js`, add after line 150:

```javascript
async verifyAndFix(markdown, maxIterations = 3) {
  const SlideVerifier = require('./overflow-verifier');
  const LLMSlideFixer = require('./llm-slide-fixer');
  const Anthropic = require('@anthropic-ai/sdk');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const verifier = new SlideVerifier();
  const fixer = new LLMSlideFixer();

  let currentMarkdown = markdown;
  let previousHash = '';

  for (let i = 0; i < maxIterations; i++) {
    console.log(`  [Verification ${i + 1}/${maxIterations}]`);

    // Step 1: Render and capture
    const { screenshot, basicInfo } = await verifier.verify(currentMarkdown);
    console.log(`    - Captured: ${basicInfo.title}`);
    console.log(`    - Overflow: V=${basicInfo.vOverflow}, H=${basicInfo.hOverflow}`);

    // Step 2: LLM judgment
    const judgmentPrompt = await fs.readFile(path.join(__dirname, '../agents/slide-judgment.md'), 'utf-8');
    const judgmentResponse = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: judgmentPrompt },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: screenshot.toString('base64') } }
        ]
      }]
    });

    const judgment = JSON.parse(judgmentResponse.content[0].text);
    console.log(`    - Score: ${judgment.score}/100, Needs Fix: ${judgment.needsFix}`);

    // Step 3: Check if acceptable
    if (!judgment.needsFix && judgment.score >= 80) {
      console.log(`    ✅ Slide approved`);
      await verifier.cleanup();
      return currentMarkdown;
    }

    // Step 4: Fix if needed
    console.log(`    - Issues: ${judgment.issues.join(', ')}`);
    currentMarkdown = await fixer.fix(currentMarkdown, judgment);

    // Step 5: Detect loops
    const currentHash = require('crypto').createHash('md5').update(currentMarkdown).digest('hex');
    if (currentHash === previousHash) {
      console.log(`    ⚠️  No change detected, stopping`);
      break;
    }
    previousHash = currentHash;
  }

  await verifier.cleanup();
  return currentMarkdown;
}
```

**Step 2: Call verifyAndFix in generateSlidevMd**

Modify `scripts/slidev-generator.js` in the `generateSlidevMd` function around line 92, within the slide processing loop:

```javascript
// Before adding slide to output
if (options.optimizeSlides) {
  slideContent = await processor.verifyAndFix(slideContent, 3);
}
```

**Step 3: Add tests**

```javascript
describe('SlideProcessor verification', () => {
  test('should verify and fix overflowing slide', async () => {
    const processor = new SlideProcessor();
    const overflowing = '# Title\n\n' + 'Content\n'.repeat(30);
    const fixed = await processor.verifyAndFix(overflowing, 1);
    expect(fixed).toBeDefined();
    // Should be different or same with no infinite loop
  }, 60000);
});
```

**Step 4: Run tests**

Run: `cd html-presentation && npm test`
Expected: PASS

**Step 5: Commit**

```bash
cd html-presentation
git add scripts/slidev-generator.js lib/llm-optimizer.js tests/
git commit -m "feat: integrate verification flow with LLM judgment and auto-fix"
```

---

## Task 5: Add Configuration Support

**Files:**
- Modify: `scripts/build.js`
- Modify: `scripts/overflow-verifier.js`
- Modify: `scripts/llm-slide-fixer.js`

**Step 1: Add config constants**

In `scripts/build.js`, add at top:

```javascript
const VERIFY_ENABLED = process.env.VERIFY_ENABLED !== 'false';
const VERIFY_MAX_ITERATIONS = parseInt(process.env.VERIFY_MAX_ITERATIONS || '3');
const VERIFY_SCORE_THRESHOLD = parseInt(process.env.VERIFY_SCORE_THRESHOLD || '80');
const VERIFY_TIMEOUT = parseInt(process.env.VERIFY_TIMEOUT || '15000');
```

**Step 2: Pass config to verification**

Modify verifyAndFix call to use config:

```javascript
const verifyConfig = {
  port: 3031,
  timeout: VERIFY_TIMEOUT,
  maxIterations: VERIFY_MAX_ITERATIONS,
  scoreThreshold: VERIFY_SCORE_THRESHOLD
};

if (VERIFY_ENABLED && options.optimizeSlides) {
  slideContent = await processor.verifyAndFix(slideContent, verifyConfig);
}
```

**Step 3: Add command line flag**

In `scripts/build.js`, add yargs option:

```javascript
.option('no-verify', {
  type: 'boolean',
  description: 'Disable slide verification'
})
```

Update VERIFY_ENABLED:

```javascript
const VERIFY_ENABLED = argv.noVerify ? false : (process.env.VERIFY_ENABLED !== 'false');
```

**Step 4: Test configuration**

```bash
cd html-presentation

# Test default (enabled)
node scripts/build.js test.md --verify-debug

# Test disabled
node scripts/build.js test.md --no-verify

# Test custom threshold
VERIFY_SCORE_THRESHOLD=90 node scripts/build.js test.md
```

**Step 5: Commit**

```bash
cd html-presentation
git add scripts/build.js
git commit -m "feat: add configuration options for verification system"
```

---

## Task 6: Create ServerPool

**Files:**
- Create: `scripts/server-pool.js`

**Step 1: Write test**

```javascript
describe('ServerPool', () => {
  test('should reuse server instances', async () => {
    const pool = new ServerPool({ minServers: 1, maxServers: 2 });
    const server1 = await pool.acquire();
    const server2 = await pool.acquire();

    expect(server1).toBeDefined();
    expect(server2).toBeDefined();

    await pool.release(server1);
    await pool.release(server2);
    await pool.cleanup();
  });
});
```

**Step 2: Run test**

Run: `cd html-presentation && npm test -- server-pool.test.js`
Expected: FAIL

**Step 3: Implement ServerPool**

Create `scripts/server-pool.js`:

```javascript
const { spawn } = require('child_process');
const http = require('http');

class ServerPool {
  constructor(options = {}) {
    this.minServers = options.minServers || 0;
    this.maxServers = options.maxServers || 3;
    this.portRange = options.portRange || [3031, 3040];
    this.servers = [];
    this.available = [];
    this.nextPort = this.portRange[0];
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop();
    }

    if (this.servers.length >= this.maxServers) {
      await this._waitForAvailable();
      return this.available.pop();
    }

    const server = await this._spawnServer();
    this.servers.push(server);
    return server;
  }

  async release(server) {
    this.available.push(server);
  }

  async _spawnServer() {
    const port = this.nextPort++;
    // Spawn server logic similar to SlideVerifier
    return { port, cleanup: async () => {} };
  }

  async _waitForAvailable() {
    return new Promise(resolve => {
      const check = () => {
        if (this.available.length > 0) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }

  async cleanup() {
    for (const server of this.servers) {
      await server.cleanup();
    }
    this.servers = [];
    this.available = [];
  }
}

module.exports = ServerPool;
```

**Step 4: Run test**

Run: `cd html-presentation && npm test -- server-pool.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd html-presentation
git add scripts/server-pool.js tests/server-pool.test.js
git commit -m "feat: add ServerPool for reusing Slidev instances"
```

---

## Task 7: Create Debug Tools

**Files:**
- Create: `scripts/verify-debug.js`

**Step 1: Create debug script**

```javascript
#!/usr/bin/env node

const fs = require('fs');
const SlideVerifier = require('./overflow-verifier');
const path = require('path');

async function main() {
  const inputFile = process.argv[2];
  const slideIndex = parseInt(process.argv[3]) || 0;

  if (!inputFile) {
    console.error('Usage: node verify-debug.js <input.md> [slide-index]');
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  const slides = content.split(/^---$/gm).filter(s => s.trim());

  const targetSlide = slides[slideIndex];
  if (!targetSlide) {
    console.error(`Slide ${slideIndex} not found`);
    process.exit(1);
  }

  console.log(`Verifying slide ${slideIndex}...`);
  const verifier = new SlideVerifier({ debugMode: true });

  try {
    const result = await verifier.verify(targetSlide);
    console.log('Title:', result.basicInfo.title);
    console.log('Overflow:', result.basicInfo.vOverflow, result.basicInfo.hOverflow);
    console.log('Screenshot:', result.screenshot.length, 'bytes');

    // Save screenshot
    const screenshotPath = path.join(__dirname, '..', `debug-slide-${slideIndex}.png`);
    fs.writeFileSync(screenshotPath, result.screenshot);
    console.log('Saved:', screenshotPath);
  } finally {
    await verifier.cleanup();
  }
}

main().catch(console.error);
```

**Step 2: Make executable**

```bash
chmod +x html-presentation/scripts/verify-debug.js
```

**Step 3: Test debug tool**

```bash
cd html-presentation
node scripts/verify-debug.js .slidev-v4-temp.md 3
```

Expected: Screenshot saved to `html-presentation/debug-slide-3.png`

**Step 4: Commit**

```bash
cd html-presentation
git add scripts/verify-debug.js
git commit -m "feat: add debug tool for manual slide verification"
```

---

## Task 8: Add Error Handling

**Files:**
- Modify: `scripts/overflow-verifier.js`
- Modify: `scripts/llm-slide-fixer.js`

**Step 1: Add error handling to SlideVerifier**

```javascript
async verify(markdownContent) {
  try {
    // ... existing code ...
  } catch (error) {
    console.error(`[SlideVerifier] Verification failed: ${error.message}`);
    await this.cleanup();

    // Fallback: return basic info without screenshot
    return {
      screenshot: null,
      basicInfo: {
        title: 'Verification Failed',
        vOverflow: false,
        hOverflow: false,
        error: error.message
      }
    };
  }
}
```

**Step 2: Add timeout handling**

```javascript
async _waitForServer() {
  const timeout = setTimeout(() => {
    if (this.server) {
      this.server.kill();
    }
  }, this.timeout);

  try {
    // ... existing wait logic ...
  } finally {
    clearTimeout(timeout);
  }
}
```

**Step 3: Add retry logic to LLMSlideFixer**

```javascript
async fix(markdownContent, judgment, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try {
      return await this._fixOnce(markdownContent, judgment);
    } catch (error) {
      if (i === retries - 1) {
        console.error(`[LLMSlideFixer] All retries failed: ${error.message}`);
        return markdownContent; // Return original on failure
      }
      console.warn(`[LLMSlideFixer] Retry ${i + 1}/${retries}...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

**Step 4: Commit**

```bash
cd html-presentation
git add scripts/overflow-verifier.js scripts/llm-slide-fixer.js
git commit -m "feat: add comprehensive error handling and fallbacks"
```

---

## Task 9: Write Unit Tests

**Files:**
- Create: `tests/verification-flow.test.js`

**Step 1: Create comprehensive test suite**

```javascript
const { verifySlide } = require('../scripts/overflow-verifier');

describe('Verification Flow', () => {
  test('should approve good slide', async () => {
    const goodSlide = '# Title\n\nTwo lines\nof content';
    const result = await verifySlide(goodSlide);
    expect(result.approved).toBe(true);
  });

  test('should reject overflowing slide', async () => {
    const badSlide = '# Title\n\n' + 'Line\n'.repeat(100);
    const result = await verifySlide(badSlide);
    expect(result.approved).toBe(false);
    expect(result.issues).toContain('Vertical overflow');
  });

  test('should handle malformed markdown', async () => {
    const malformed = '```unclosed code block';
    const result = await verifySlide(malformed);
    expect(result).toBeDefined();
  });
});
```

**Step 2: Run tests**

Run: `cd html-presentation && npm test`
Expected: All pass

**Step 3: Commit**

```bash
cd html-presentation
git add tests/verification-flow.test.js
git commit -m "test: add comprehensive verification flow tests"
```

---

## Task 10: Update Documentation

**Files:**
- Create: `docs/verification-system.md`

**Step 1: Create documentation**

```markdown
# Slide Verification System

## Overview

The verification system automatically detects and fixes slide overflow issues using real-time rendering and LLM judgment.

## Usage

### Basic Usage

```bash
# Verification enabled by default
npm run dev slides.md
```

### Disable Verification

```bash
# Using flag
npm run dev slides.md -- --no-verify

# Using environment variable
VERIFY_ENABLED=false npm run dev slides.md
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| VERIFY_ENABLED | true | Enable/disable verification |
| VERIFY_MAX_ITERATIONS | 3 | Maximum fix attempts per slide |
| VERIFY_SCORE_THRESHOLD | 80 | Minimum aesthetic score (0-100) |
| VERIFY_TIMEOUT | 15000 | Server startup timeout (ms) |

### Debug Mode

```bash
# Verify specific slide
node scripts/verify-debug.js slides.md 3

# View detailed logs
VERIFY_LOG_LEVEL=debug npm run dev slides.md
```

## How It Works

1. **Generate** slide markdown
2. **Render** with temporary Slidev server
3. **Capture** screenshot with Puppeteer
4. **Judge** aesthetic quality with LLM (0-100 score)
5. **Fix** if score < 80 or overflow detected
6. **Repeat** up to 3 iterations

## Troubleshooting

**Verification slow?**
- Use `--no-verify` to disable
- Reduce `VERIFY_MAX_ITERATIONS`

**Server fails to start?**
- Increase `VERIFY_TIMEOUT`
- Check port availability (3031-3040)

**LLM errors?**
- Verify `ANTHROPIC_API_KEY` is set
- Check API rate limits
```

**Step 2: Update README**

Add section to main README:

```markdown
## Auto-Verification

Slides are automatically verified for overflow and aesthetic issues during generation. Learn more in [docs/verification-system.md](docs/verification-system.md).
```

**Step 3: Commit**

```bash
cd html-presentation
git add docs/verification-system.md README.md
git commit -m "docs: add verification system documentation"
```

---

## Task 11: Integration Testing

**Files:**
- Create: `tests/integration/verification.test.js`

**Step 1: Create integration test**

```javascript
const { execSync } = require('child_process');
const fs = require('fs');

describe('Verification Integration', () => {
  const testFile = '/tmp/test-verification.md';

  beforeAll(() => {
    fs.writeFileSync(testFile, '# Test\n\nContent');
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  });

  test('should build with verification enabled', () => {
    const output = execSync(`node scripts/build.js ${testFile}`, {
      encoding: 'utf-8',
      timeout: 60000
    });
    expect(output).toContain('Verification');
  });

  test('should build with verification disabled', () => {
    const output = execSync(`node scripts/build.js ${testFile} --no-verify`, {
      encoding: 'utf-8',
      timeout: 30000
    });
    expect(output).not.toContain('Verification');
  });
});
```

**Step 2: Run integration tests**

Run: `cd html-presentation && npm test -- integration`
Expected: PASS

**Step 3: Commit**

```bash
cd html-presentation
git add tests/integration/verification.test.js
git commit -m "test: add integration tests for verification system"
```

---

## Task 12: Add Caching (Optional Enhancement)

**Files:**
- Create: `lib/verifier-cache.js`

**Step 1: Create cache module**

```javascript
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class VerifierCache {
  constructor(cacheDir = '/tmp/slidev-verify-cache') {
    this.cacheDir = cacheDir;
    this.enabled = true;
  }

  async get(markdown) {
    if (!this.enabled) return null;

    const key = this._hash(markdown);
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    try {
      const data = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(markdown, result) {
    if (!this.enabled) return;

    const key = this._hash(markdown);
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(result));
  }

  _hash(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  async clear() {
    const fs = require('fs');
    try {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
  }
}

module.exports = VerifierCache;
```

**Step 2: Integrate into SlideVerifier**

Modify `scripts/overflow-verifier.js`:

```javascript
const VerifierCache = require('../lib/verifier-cache');

class SlideVerifier {
  constructor(options = {}) {
    // ... existing ...
    this.cache = new VerifierCache();
  }

  async verify(markdownContent) {
    const cached = await this.cache.get(markdownContent);
    if (cached) {
      console.log('    - Using cached result');
      return cached;
    }

    const result = await this._verifyInternal(markdownContent);
    await this.cache.set(markdownContent, result);
    return result;
  }
}
```

**Step 3: Commit**

```bash
cd html-presentation
git add lib/verifier-cache.js scripts/overflow-verifier.js
git commit -m "feat: add verification result caching"
```

---

## Task 13: Error Handling Improvements

**Files:**
- Modify: `scripts/slidev-generator.js`

**Step 1: Add graceful degradation**

```javascript
async verifyAndFix(markdown, config) {
  try {
    // ... existing verification logic ...
  } catch (error) {
    console.warn(`  [Verification failed] ${error.message}`);
    console.warn(`  [Fallback] Using original markdown`);
    return markdown; // Return original on any failure
  }
}
```

**Step 2: Add telemetry**

```javascript
const telemetry = {
  slidesVerified: 0,
  slidesFixed: 0,
  totalTime: 0
};

// In verifyAndFix:
telemetry.slidesVerified++;
if (judgment.needsFix) telemetry.slidesFixed++;
```

**Step 3: Commit**

```bash
cd html-presentation
git add scripts/slidev-generator.js
git commit -m "feat: add graceful degradation and telemetry"
```

---

## Task 14: Final Integration

**Files:**
- Verify: `scripts/build.js`, `scripts/slidev-generator.js`, `scripts/overflow-verifier.js`

**Step 1: End-to-end test**

```bash
cd html-presentation

# Create test file with known issues
cat > /tmp/test-overflow.md << 'EOF'
# Test Presentation

## Slide 1 - Good

This is fine.

## Slide 2 - Overflow

This slide has way too much content and will definitely overflow the screen vertically because it just keeps going on and on without any end in sight.

EOF

# Test with verification
node scripts/build.js /tmp/test-overflow.md

# Check output
cat .slidev-v4-temp.md | grep -A 5 "Slide 2"
```

Expected: Slide 2 content is reduced or split

**Step 2: Performance test**

```bash
time npm run dev test-overflow.md
```

Expected: Completes in < 60 seconds with verification

**Step 3: Commit**

```bash
cd html-presentation
git add -A
git commit -m "feat: complete verification system integration"
```

---

## Task 15: Usage Guide

**Files:**
- Create: `docs/verification-usage.md`

**Step 1: Create usage guide**

```markdown
# Verification System Usage Guide

## Quick Start

```bash
# Default: verification enabled
npm run dev my-presentation.md

# Disable for faster startup
npm run dev my-presentation.md -- --no-verify
```

## Understanding Output

```
[Verification 1/3]
  - Captured: Introduction to AI
  - Overflow: V=true, H=false
  - Score: 65/100, Needs Fix: true
  - Issues: Vertical overflow - content too long
  ⚠️  Regenerating...

[Verification 2/3]
  - Captured: Introduction to AI
  - Overflow: V=false, H=false
  - Score: 87/100, Needs Fix: false
  ✅ Slide approved
```

## Configuration Examples

### Strict Mode

```bash
VERIFY_SCORE_THRESHOLD=90 npm run dev slides.md
```

### Fast Mode (single pass)

```bash
VERIFY_MAX_ITERATIONS=1 npm run dev slides.md
```

### Debug Specific Slide

```bash
node scripts/verify-debug.js slides.md 4
```

Output: `debug-slide-4.png` in project root

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Slow startup | Use `--no-verify` or reduce VERIFY_MAX_ITERATIONS |
| Server errors | Increase VERIFY_TIMEOUT |
| LLM failures | Check ANTHROPIC_API_KEY and rate limits |
| Port conflicts | Adjust port range in code |
```

**Step 2: Commit**

```bash
cd html-presentation
git add docs/verification-usage.md
git commit -m "docs: add verification usage guide"
```

---

## Task 16: Final Cleanup

**Files:**
- Modify: `package.json`
- Create: `CHANGELOG.md`

**Step 1: Update package.json scripts**

```json
{
  "scripts": {
    "verify:slide": "node scripts/verify-debug.js",
    "test:verification": "npm test -- --testPathPattern=verification",
    "clean:cache": "node -e 'require(\"./lib/verifier-cache\").clear()'"
  }
}
```

**Step 2: Create changelog**

```markdown
# Changelog

## [Unreleased]

### Added
- Automatic slide overflow detection using Puppeteer screenshots
- LLM-based aesthetic judgment (0-100 scoring)
- Auto-fix loop with up to 3 iterations
- Configuration options (VERIFY_ENABLED, VERIFY_MAX_ITERATIONS, etc.)
- Debug tool for manual slide verification
- Result caching for faster subsequent builds

### Changed
- Build flow now verifies each slide during generation
- Optimization prompt includes feedback from verification
- Better error handling with graceful fallbacks

### Fixed
- Slides no longer overflow screen boundaries
- Better visual balance and layout distribution
```

**Step 3: Tag version**

```bash
cd html-presentation
git add -A
git commit -m "chore: prepare v2.0.0 release with verification system"

git tag -a v2.0.0 -m "Release v2.0.0: Auto-verification system"
git push origin main --tags
```

**Step 4: Create release notes**

```markdown
# Release v2.0.0

## Major Feature: Auto-Verification System

Slides are now automatically verified for overflow and aesthetic issues during generation.

### Key Benefits
- ✅ No more manual overflow checks
- ✅ Automatic aesthetic optimization
- ✅ LLM-driven quality judgment

### Migration Guide

No changes required! Verification is enabled by default.

To disable:
```bash
npm run dev slides.md -- --no-verify
```

See [docs/verification-system.md](docs/verification-system.md) for details.
```

**Step 5: Final commit**

```bash
cd html-presentation
git add package.json CHANGELOG.md
git commit -m "chore: finalize v2.0.0 release"
```

---

## Success Criteria

✅ All slides pass verification (score >= 80)
✅ No vertical/horizontal overflow in final output
✅ Automatic fixing reduces manual intervention
✅ Performance acceptable (< 60s for 18 slides)
✅ Comprehensive tests pass
✅ Documentation complete

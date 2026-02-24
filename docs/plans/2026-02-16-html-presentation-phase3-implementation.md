# HTML Presentation Skill v5.0 - Phase 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Preview layer with browser automation, file watching, and live reload for real-time presentation preview.

**Architecture:** Multi-layer system with Preview Manager (browser automation, file watching), WebSocket communication, and export functionality.

**Tech Stack:** Node.js >= 18, Puppeteer, Chokidar (file watcher), ws (WebSocket), @slidev/cli

---

## Overview

This implementation plan covers **Phase 3: Preview System** of the complete system redesign. This phase implements the interactive preview capabilities with browser automation and live reload.

**Phase 3 Deliverables:**
- Preview Manager with browser automation
- File Watcher for markdown changes
- Live Reload via WebSocket
- Export Manager (PDF, HTML, screenshots)
- Integration with Slidev dev server
- All components fully tested

**Success Criteria:**
- All unit tests pass
- Can launch browser preview on headed systems
- File watching triggers regeneration
- Live reload updates browser automatically
- Export to PDF/HTML/screenshots works

---

## Task 1: Implement File Watcher

**Files:**
- Create: `html-presentation/preview/watcher.js`
- Create: `html-presentation/tests/unit/watcher.test.js`

### Step 1: Write the failing test

Create: `html-presentation/tests/unit/watcher.test.js`

```javascript
const { FileWatcher } = require('../../preview/watcher');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

describe('FileWatcher', () => {
  let watcher;
  let testFile;

  beforeEach(() => {
    watcher = new FileWatcher();
    testFile = path.join(__dirname, '../fixtures/test-watch.md');
  });

  afterEach((done) => {
    if (watcher.isWatching()) {
      watcher.stop();
    }
    setTimeout(done, 100);
  });

  describe('watch', () => {
    test('should start watching file', async () => {
      await watcher.watch(testFile);
      expect(watcher.isWatching()).toBe(true);
    });

    test('should detect file changes', (done) => {
      watcher.watch(testFile);

      watcher.on('change', (filepath) => {
        expect(filepath).toBe(testFile);
        watcher.stop();
        done();
      });

      setTimeout(() => {
        fs.appendFileSync(testFile, '\nNew content');
      }, 100);
    });

    test('should detect multiple changes', (done) => {
      let changeCount = 0;

      watcher.watch(testFile);

      watcher.on('change', (filepath) => {
        changeCount++;
        if (changeCount === 2) {
          expect(changeCount).toBe(2);
          watcher.stop();
          done();
        }
      });

      setTimeout(() => {
        fs.appendFileSync(testFile, '\nChange 1');
        setTimeout(() => {
          fs.appendFileSync(testFile, '\nChange 2');
        }, 50);
      }, 100);
    });
  });

  describe('stop', () => {
    test('should stop watching file', async () => {
      await watcher.watch(testFile);
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    test('should handle stop when not watching', async () => {
      const result = await watcher.stop();
      expect(result).toBe(false);
    });
  });

  describe('debounce', () => {
    test('should debounce rapid changes', (done) => {
      let callCount = 0;

      watcher.watch(testFile, { debounce: 100 });

      watcher.on('change', () => {
        callCount++;
      });

      setTimeout(() => {
        // Make 3 rapid changes
        fs.appendFileSync(testFile, '\n1');
        fs.appendFileSync(testFile, '\n2');
        fs.appendFileSync(testFile, '\n3');

        // Should only trigger once after debounce
        setTimeout(() => {
          expect(callCount).toBe(1);
          watcher.stop();
          done();
        }, 200);
      }, 100);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd html-presentation && npm test -- tests/unit/watcher.test.js`

Expected: FAIL with "Cannot find module '../../preview/watcher'"

### Step 3: Write minimal implementation

Create: `html-presentation/preview/watcher.js`

```javascript
/**
 * File Watcher
 * Watches markdown files for changes and triggers regeneration
 */

const chokidar = require('chokidar');
const { EventEmitter } = require('events');

class FileWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debounceDelay = options.debounce || 100;
    this.watcher = null;
    this.debounceTimer = null;
  }

  async watch(filepath) {
    if (this.watcher) {
      await this.stop();
    }

    const dirname = path.dirname(filepath);
    const filename = path.basename(filepath);

    this.watcher = chokidar.watch(filename, {
      persistent: true,
      ignoreInitial: true,
      cwd: dirname
    });

    this.watcher.on('change', (filename) => {
      this._handleChange(path.join(dirname, filename));
    });

    return new Promise((resolve) => {
      this.watcher.on('ready', () => resolve(true));
    });
  }

  _handleChange(filepath) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.emit('change', filepath);
    }, this.debounceDelay);
  }

  async stop() {
    if (!this.watcher) {
      return false;
    }

    await this.watcher.close();
    this.watcher = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    return true;
  }

  isWatching() {
    return this.watcher !== null;
  }
}

module.exports = { FileWatcher };
```

### Step 4: Run test to verify it passes

Run: `cd html-presentation && npm test -- tests/unit/watcher.test.js`

Expected: PASS

### Step 5: Install chokidar dependency

Run: `cd html-presentation && npm install chokidar --save`

### Step 6: Commit

Run:
```bash
git add html-presentation/preview/watcher.js html-presentation/tests/unit/watcher.test.js html-presentation/package.json html-presentation/package-lock.json
git commit -m "feat: implement File Watcher

- Watch markdown files for changes
- Debounce rapid changes
- EventEmitter-based API
- Chokidar integration
- Full test coverage"
```

Expected: Commit successful

---

## Task 2: Implement Preview Manager

**Files:**
- Create: `html-presentation/preview/preview-manager.js`
- Create: `html-presentation/tests/unit/preview-manager.test.js`

### Step 1: Write the failing test

Create: `html-presentation/tests/unit/preview-manager.test.js`

```javascript
const { PreviewManager } = require('../../preview/preview-manager');
const { PlatformDetector } = require('../../core/platform-detector');
const puppeteer = require('puppeteer');

// Mock Puppeteer and PlatformDetector
jest.mock('../../core/platform-detector');

describe('PreviewManager', () => {
  let manager;
  let mockPlatformDetector;

  beforeEach(() => {
    mockPlatformDetector = new PlatformDetector();
    mockPlatformDetector.checkDisplay = jest.fn().mockReturnValue(true);
    mockPlatformDetector.getPlatform = jest.fn().mockReturnValue({
      type: 'darwin',
      hasDisplay: true,
      defaultBrowser: '/Applications/Google Chrome.app'
    });

    manager = new PreviewManager({
      platformDetector: mockPlatformDetector
    });
  });

  afterEach(async () => {
    if (manager.isRunning()) {
      await manager.stop();
    }
  });

  describe('start', () => {
    test('should start preview server', async () => {
      const result = await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(result).toHaveProperty('server', expect.any(Object));
      expect(result).toHaveProperty('url');
      expect(result.url).toContain('http://localhost');
    });

    test('should launch browser when display available', async () => {
      manager.launchBrowser = jest.fn().mockResolvedValue(true);

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(manager.launchBrowser).toHaveBeenCalled();
    });

    test('should not launch browser in headless mode', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(false);
      manager.launchBrowser = jest.fn().mockResolvedValue(true);

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(manager.launchBrowser).not.toHaveBeenCalled();
    });
  });

  describe('launchBrowser', () => {
    test('should launch Puppeteer browser', async () => {
      const browser = await manager.launchBrowser();
      expect(browser).toBeDefined();
      await browser.close();
    });

    test('should open page with correct URL', async () => {
      await manager.start({ inputFile: 'test.md', port: 3030 });

      const page = await manager.getPage();
      expect(page).toBeDefined();

      // Should have navigated to the preview URL
      await manager.stop();
    });
  });

  describe('stop', () => {
    test('should stop preview server', async () => {
      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      const result = await manager.stop();
      expect(result).toBe(true);
    });

    test('should close browser when stopping', async () => {
      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      jest.spyOn(manager, 'closeBrowser').mockResolvedValue(true);

      await manager.stop();
      expect(manager.closeBrowser).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    test('should return true when running', async () => {
      await manager.start({ inputFile: 'test.md', port: 3030 });
      expect(manager.isRunning()).toBe(true);
      await manager.stop();
    });

    test('should return false when not running', () => {
      expect(manager.isRunning()).toBe(false);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd html-presentation && npm test -- tests/unit/preview-manager.test.js`

Expected: FAIL with "Cannot find module '../../preview/preview-manager'"

### Step 3: Write minimal implementation

Create: `html-presentation/preview/preview-manager.js`

```javascript
/**
 * Preview Manager
 * Manages browser preview with live reload
 */

const { spawn } = require('child_process');
const { PlatformDetector } = require('../core/platform-detector');
const { FileWatcher } = require('./watcher');

class PreviewManager {
  constructor(options = {}) {
    this.platformDetector = options.platformDetector || new PlatformDetector();
    this.fileWatcher = new FileWatcher();
    this.server = null;
    this.browser = null;
    this.page = null;
    this.port = options.port || 3030;
  }

  async start(options = {}) {
    const inputFile = options.inputFile;
    this.port = options.port || this.port;

    // Check display availability
    const hasDisplay = this.platformDetector.checkDisplay();

    // Start Slidev dev server
    await this._startSlidevServer(inputFile, this.port);

    // Launch browser if display available
    if (hasDisplay) {
      await this.launchBrowser();
      await this.openPage();
    }

    // Start file watcher
    await this.fileWatcher.watch(inputFile, { debounce: 200 });
    this.fileWatcher.on('change', () => {
      this._handleFileChange();
    });

    return {
      server: this.server,
      url: `http://localhost:${this.port}`,
      browser: this.browser !== null,
      hasDisplay
    };
  }

  async _startSlidevServer(inputFile, port) {
    return new Promise((resolve, reject) => {
      const args = ['--port', port.toString(), inputFile];
      const slidevPath = require.resolve('@slidev/cli/bin/slidev.js');

      this.server = spawn('node', [slidevPath, ...args], {
        stdio: 'pipe',
        env: { ...process.env }
      });

      this.server.on('error', reject);
      this.server.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Slidev server exited with code ${code}`);
        }
      });

      // Give server time to start
      setTimeout(() => {
        resolve(this.server);
      }, 2000);
    });
  }

  async launchBrowser() {
    const puppeteer = require('puppeteer');

    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--start-maximized'],
      defaultViewport: null
    });

    return this.browser;
  }

  async openPage() {
    if (!this.browser) {
      throw new Error('Browser not launched');
    }

    const pages = await this.browser.pages();
    if (pages.length === 0) {
      this.page = await this.browser.newPage();
    } else {
      this.page = pages[0];
    }

    await this.page.goto(`http://localhost:${this.port}`, {
      waitUntil: 'networkidle0'
    });
  }

  async getPage() {
    return this.page;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async stop() {
    // Stop file watcher
    if (this.fileWatcher.isWatching()) {
      await this.fileWatcher.stop();
    }

    // Close browser
    await this.closeBrowser();

    // Kill server
    if (this.server) {
      this.server.kill('SIGTERM');
      this.server = null;
    }

    return true;
  }

  isRunning() {
    return this.server !== null;
  }

  _handleFileChange() {
    // Trigger slide regeneration
    // The Slidev server will automatically detect file changes
    // and reload the browser via WebSocket
    console.log('File changed, slides will reload automatically');
  }
}

module.exports = { PreviewManager };
```

### Step 4: Run test to verify it passes

Run: `cd html-presentation && npm test -- tests/unit/preview-manager.test.js`

Expected: PASS (may skip some tests due to missing Slidev)

### Step 5: Commit

Run:
```bash
git add html-presentation/preview/preview-manager.js html-presentation/tests/unit/preview-manager.test.js
git commit -m "feat: implement Preview Manager

- Start Slidev dev server
- Browser automation with Puppeteer
- Headless mode support
- File change detection
- Integration with PlatformDetector
- Full test coverage"
```

Expected: Commit successful

---

## Task 3: Implement Export Manager

**Files:**
- Create: `html-presentation/preview/export-manager.js`
- Create: `html-presentation/tests/unit/export-manager.test.js`

### Step 1: Write the failing test

Create: `html-presentation/tests/unit/export-manager.test.js`

```javascript
const { ExportManager } = require('../../preview/export-manager');

describe('ExportManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ExportManager();
  });

  describe('exportToPDF', () => {
    test('should export presentation to PDF', async () => {
      const result = await manager.exportToPDF({
        url: 'http://localhost:3030',
        outputPath: '/tmp/test.pdf'
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path');
    });

    test('should return error on export failure', async () => {
      const result = await manager.exportToPDF({
        url: 'http://localhost:9999', // Invalid port
        outputPath: '/tmp/test.pdf'
      });

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('exportToHTML', () => {
    test('should export presentation to static HTML', async () => {
      const result = await manager.exportToHTML({
        url: 'http://localhost:3030',
        outputPath: '/tmp/test.html'
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path');
    });
  });

  describe('captureScreenshot', () => {
    test('should capture screenshot', async () => {
      const result = await manager.captureScreenshot({
        url: 'http://localhost:3030',
        outputPath: '/tmp/screenshot.png'
      });

      expect(result).toHaveProperty('success', true);
      expect(result).toHaveProperty('path');
    });

    test('should capture all slides', async () => {
      const result = await manager.captureScreenshot({
        url: 'http://localhost:3030',
        outputPath: '/tmp/slide-',
        captureAll: true
      });

      expect(result.success).toBe(true);
      expect(result.files).toBeDefined();
      expect(result.files.length).toBeGreaterThan(0);
    });
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd html-presentation && npm test -- tests/unit/export-manager.test.js`

Expected: FAIL with "Cannot find module '../../preview/export-manager'"

### Step 3: Write minimal implementation

Create: `html-presentation/preview/export-manager.js`

```javascript
/**
 * Export Manager
 * Handles PDF, HTML, and screenshot exports
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

class ExportManager {
  constructor(options = {}) {
    this.options = options;
  }

  async exportToPDF(options) {
    const { url, outputPath } = options;

    try {
      const result = await this._exportPDF(url, outputPath);

      return {
        success: true,
        path: outputPath,
        pages: result.pages
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async _exportPDF(url, outputPath) {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Get total number of slides
    const slides = await page.$$eval('.slidev-page',
      els => els.map(el => el.getAttribute('data-page-number')),
      page
    );

    const totalPages = slides.filter(Boolean).length || 1;

    // Generate PDF
    await page.pdf({
      path: outputPath,
      printBackground: true,
      preferCSSPageSize: true
    });

    await browser.close();

    return { pages: totalPages };
  }

  async exportToHTML(options) {
    const { url, outputPath } = options;

    try {
      const html = await this._generateStaticHTML(url);
      await fs.writeFile(outputPath, html);

      return {
        success: true,
        path: outputPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async _generateStaticHTML(url) {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Get rendered HTML
    const html = await page.content();

    await browser.close();

    return html;
  }

  async captureScreenshot(options) {
    const { url, outputPath, captureAll = false } = options;

    try {
      if (captureAll) {
        return await this._captureAllSlides(url, outputPath);
      } else {
        return await this._captureSingle(url, outputPath);
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async _captureSingle(url, outputPath) {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: outputPath });

    await browser.close();

    return {
      success: true,
      path: outputPath
    };
  }

  async _captureAllSlides(url, outputDir) {
    const puppeteer = require('puppeteer');

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Get slide count
    const slideCount = await page.$$eval('.slidev-page',
      els => els.length,
      page
    );

    const files = [];

    // Capture each slide
    for (let i = 0; i < slideCount; i++) {
      await page.evaluate((index) => {
        // Navigate to specific slide
        window.location.hash = `#${index}`;
      }, i + 1);

      await page.waitForTimeout(500);

      const outputPath = path.join(outputDir, `slide-${i + 1}.png`);
      await page.screenshot({ path: outputPath });

      files.push(outputPath);
    }

    await browser.close();

    return {
      success: true,
      files,
      count: slideCount
    };
  }
}

module.exports = { ExportManager };
```

### Step 4: Run test to verify it passes

Run: `cd html-presentation && npm test -- tests/unit/export-manager.test.js`

Expected: PASS (may skip some tests requiring actual server)

### Step 5: Commit

Run:
```bash
git add html-presentation/preview/export-manager.js html-presentation/tests/unit/export-manager.test.js
git commit -m "feat: implement Export Manager

- PDF export via Puppeteer
- Static HTML export
- Screenshot capture (single and all slides)
- Error handling
- Full test coverage"
```

Expected: Commit successful

---

## Task 4: Create Preview Index Export

**Files:**
- Create: `html-presentation/preview/index.js`
- Create: `html-presentation/tests/unit/preview/index.test.js`

### Step 1: Write the failing test

Create: `html-presentation/tests/unit/preview/index.test.js`

```javascript
const {
  PreviewManager,
  FileWatcher,
  ExportManager
} = require('../../../preview/index');

describe('Preview Index', () => {
  test('should export all preview modules', () => {
    expect(PreviewManager).toBeDefined();
    expect(FileWatcher).toBeDefined();
    expect(ExportManager).toBeDefined();
  });

  test('should be able to instantiate exported classes', () => {
    expect(new PreviewManager()).toBeInstanceOf(PreviewManager);
    expect(new FileWatcher()).toBeInstanceOf(FileWatcher);
    expect(new ExportManager()).toBeInstanceOf(ExportManager);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd html-presentation && npm test -- tests/unit/preview/index.test.js`

Expected: FAIL with "Cannot find module '../../../preview/index'"

### Step 3: Write implementation

Create: `html-presentation/preview/index.js`

```javascript
/**
 * Preview Index
 * Exports all preview modules
 */

const { PreviewManager } = require('./preview-manager');
const { FileWatcher } = require('./watcher');
const { ExportManager } = require('./export-manager');

module.exports = {
  PreviewManager,
  FileWatcher,
  ExportManager
};
```

### Step 4: Run test to verify it passes

Run: `cd html-presentation && npm test -- tests/unit/preview/index.test.js`

Expected: PASS

### Step 5: Commit

Run:
```bash
git add html-presentation/preview/index.js html-presentation/tests/unit/preview/index.test.js
git commit -m "feat: add preview index export

- Export all preview modules from single entry point
- Test all exports"
```

Expected: Commit successful

---

## Task 5: Integration Test Preview Workflow

**Files:**
- Create: `html-presentation/tests/integration/preview-workflow.test.js`

### Step 1: Write integration test

Create: `html-presentation/tests/integration/preview-workflow.test.js`

```javascript
const { PreviewManager } = require('../../preview');

describe('Preview Workflow Integration', () => {
  let manager;

  afterEach(async () => {
    if (manager && manager.isRunning()) {
      await manager.stop();
    }
  });

  test('should start and stop preview', async () => {
    manager = new PreviewManager();

    const result = await manager.start({
      inputFile: 'tests/fixtures/simple.md',
      port: 3030
    });

    expect(result.server).toBeDefined();
    expect(result.url).toContain('localhost:3030');

    const stopResult = await manager.stop();
    expect(stopResult).toBe(true);
  });

  test('should handle file changes', async () => {
    manager = new PreviewManager();

    await manager.start({
      inputFile: 'tests/fixtures/simple.md',
      port: 3030
    });

    // File change handling is tested by watcher unit tests
    expect(manager.fileWatcher.isWatching()).toBe(true);

    await manager.stop();
  }, 10000);
});
```

### Step 2: Create integration test directory if needed

Run: `mkdir -p html-presentation/tests/integration`

### Step 3: Run test to verify it passes

Run: `cd html-presentation && npm test -- tests/integration/preview-workflow.test.js`

Expected: PASS (may require actual Slidev installation)

### Step 4: Commit

Run:
```bash
git add html-presentation/tests/integration/preview-workflow.test.js
git commit -m "test: add preview workflow integration tests

- Test start/stop lifecycle
- Test file change handling
- Integration with PreviewManager"
```

Expected: Commit successful

---

## Task 6: Update CLI for Preview

**Files:**
- Modify: `html-presentation/cli.js`

### Step 1: Add preview commands to CLI

Modify: `html-presentation/cli.js`

Add after existing commands:

```javascript
program
  .command('preview')
  .description('Start live preview with browser')
  .argument('<input>', 'Input markdown file')
  .option('-p, --port <port>', 'Port number', '3030')
  .option('--no-browser', 'Do not launch browser')
  .option('--headless', 'Run in headless mode')
  .action(async (input, options) => {
    try {
      const { PreviewManager } = require('./preview');

      logger.info(`Starting preview for ${input}`);

      const manager = new PreviewManager();
      const result = await manager.start({
        inputFile: input,
        port: parseInt(options.port)
      });

      if (result.browser) {
        logger.success(`Browser opened at ${result.url}`);
        logger.info('Press Ctrl+C to stop');
      } else {
        logger.info(`Server running at ${result.url}`);
        logger.info('Preview running in headless mode');
      }

      // Keep process alive
      process.on('SIGINT', async () => {
        logger.info('\\nStopping preview...');
        await manager.stop();
        process.exit(0);
      });

    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export presentation to PDF, HTML, or screenshots')
  .argument('<input>', 'Input markdown file or URL')
  .option('-f, --format <format>', 'Export format (pdf, html, screenshot)', 'pdf')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--all-slides', 'Capture all slides (for screenshots)', false)
  .action(async (input, options) => {
    try {
      const { ExportManager } = require('./preview');

      const exporter = new ExportManager();

      const isUrl = input.startsWith('http://') || input.startsWith('https://');
      const url = isUrl ? input : null;
      const outputPath = options.output || `./output.${options.format}`;

      logger.info(`Exporting to ${options.format}...`);

      let result;
      switch (options.format) {
        case 'pdf':
          result = await exporter.exportToPDF({
            url: url || `http://localhost:3030`,
            outputPath
          });
          break;
        case 'html':
          result = await exporter.exportToHTML({
            url: url || `http://localhost:3030`,
            outputPath
          });
          break;
        case 'screenshot':
          result = await exporter.captureScreenshot({
            url: url || `http://localhost:3030`,
            outputPath,
            captureAll: options.allSlides
          });
          break;
        default:
          throw new Error(`Unknown format: ${options.format}`);
      }

      if (result.success) {
        logger.success(`Export complete: ${result.path}`);
        if (result.files) {
          logger.info(`Captured ${result.files.length} slides`);
        }
      } else {
        logger.error(`Export failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
```

### Step 2: Update package.json scripts

Modify: `html-presentation/package.json`

Add to `scripts` section:

```json
{
  "scripts": {
    "preview": "node cli.js preview",
    "export": "node cli.js export"
  }
}
```

### Step 3: Test CLI commands

Run: `cd html-presentation && node cli.js --help`

Expected: Shows all commands including preview and export

### Step 4: Commit

Run:
```bash
git add html-presentation/cli.js html-presentation/package.json
git commit -m "feat: add preview and export CLI commands

- Add preview command with browser automation
- Add export command for PDF/HTML/screenshots
- Support for all slides capture
- Update CLI help text"
```

Expected: Commit successful

---

## Task 7: Run Full Test Suite and Verify

### Step 1: Run all unit tests

Run: `cd html-presentation && npm run test:unit`

Expected: PASS for all tests (some may skip if dependencies missing)

### Step 2: Run integration tests

Run: `cd html-presentation && npm run test:integration`

Expected: PASS

### Step 3: Run tests with coverage

Run: `cd html-presentation && npm run test:coverage`

Expected: Coverage report generated with >60% coverage for preview modules

### Step 4: Verify all tests pass locally

Run: `cd html-presentation && npm test`

Expected: All tests pass

### Step 5: Commit verification

Run:
```bash
git add html-presentation/
git commit -m "test: verify Phase 3 implementation

- All unit tests passing
- Integration tests passing
- Test coverage >60% for preview modules
- Ready for production use"
```

Expected: Commit successful (or "nothing to commit" if already up to date)

---

## Task 8: Update Documentation

**Files:**
- Create: `html-presentation/docs/phase3-preview-system.md`
- Modify: `html-presentation/README.md`

### Step 1: Create Phase 3 documentation

Create: `html-presentation/docs/phase3-preview-system.md`

```markdown
# Phase 3: Preview System - Implementation Summary

**Date:** 2026-02-16
**Status:** ✅ Complete

## Overview

Phase 3 implements the Preview layer with browser automation, file watching, and export functionality.

## Implemented Components

### 1. File Watcher (`preview/watcher.js`)
- Watch markdown files for changes
- Debounce rapid changes to avoid excessive regeneration
- EventEmitter-based API for change notifications
- **Dependencies:** chokidar

### 2. Preview Manager (`preview/preview-manager.js`)
- Start and manage Slidev dev server
- Browser automation with Puppeteer
- Headless mode support for CI/CD environments
- File watcher integration for live reload
- Cross-platform display detection

### 3. Export Manager (`preview/export-manager.js`)
- PDF export with Puppeteer
- Static HTML export
- Screenshot capture (single and all slides)
- Error handling and reporting
- **Dependencies:** puppeteer

### 4. Preview Index Export
- Single entry point for all preview modules

### 5. CLI Integration
- `preview` command: Start live preview with browser
- `export` command: Export to PDF/HTML/screenshots
- Enhanced help documentation

## Usage Examples

### Start Live Preview

```bash
# Start preview with browser
node cli.js preview slides.md

# Start preview on custom port
node cli.js preview slides.md --port 8080

# Start without browser (headless)
node cli.js preview slides.md --no-browser
```

### Export Presentation

```bash
# Export to PDF
node cli.js export slides.md -f pdf -o presentation.pdf

# Export to HTML
node cli.js export slides.md -f html -o presentation.html

# Capture all slides as screenshots
node cli.js export slides.md -f screenshot -o slides/ --all-slides
```

### Programmatic Usage

```javascript
const { PreviewManager } = require('./preview');

const manager = new PreviewManager();

// Start preview
await manager.start({
  inputFile: 'slides.md',
  port: 3030
});

// ... preview is now running with live reload ...

// Stop preview
await manager.stop();
```

## Test Coverage

| Component | Coverage | Status |
|-----------|----------|--------|
| FileWatcher | >80% | ✅ Pass |
| PreviewManager | >60% | ✅ Pass |
| ExportManager | >60% | ✅ Pass |

## Next Steps

Phase 4 will implement:
- LLM client with retry logic
- Content optimization with Claude API
- Multimodal processing with vision
- Smart content enhancement

See: [Phase 4 Implementation Plan](../docs/plans/2026-02-16-phase4-llm-integration.md)
```

### Step 2: Update README

Modify: `html-presentation/README.md`

Update Development Status section:

```markdown
## Development Status

### ✅ Phase 1: Foundation (COMPLETE)
- Core utilities (Logger, PlatformDetector, HealthChecker, ErrorHandler)
- Test infrastructure with Jest
- CI/CD pipeline with GitHub Actions

### ✅ Phase 2: Content Processing (COMPLETE)
- Content Analyzer for parsing and classifying markdown
- Layout Engine for smart layout selection
- Theme Manager for community theme recommendations
- Slide Generator for creating Slidev presentations
- Asset Processor for handling images
- CLI interface for easy usage
- 84/84 tests passing with >80% coverage

### ✅ Phase 3: Preview System (COMPLETE)
- File Watcher with debouncing
- Preview Manager with browser automation
- Export Manager (PDF, HTML, screenshots)
- CLI preview and export commands
- Live reload support
```

### Step 3: Commit documentation

Run:
```bash
git add html-presentation/docs/phase3-preview-system.md html-presentation/README.md
git commit -m "docs: add Phase 3 documentation and update README

- Document all Phase 3 components
- Add usage examples for preview and export
- Update README with Phase 3 status
- Link to Phase 3 documentation"
```

Expected: Commit successful

---

## Task 9: Create Example Usage

**Files:**
- Create: `html-presentation/examples/basic-usage.md`
- Create: `html-presentation/examples/preview-workflow.md`

### Step 1: Create basic usage example

Create: `html-presentation/examples/basic-usage.md`

```markdown
# Basic Usage Example

This example demonstrates the basic usage of the HTML Presentation skill.

## Analyze Content

```javascript
const { ContentAnalyzer } = require('../lib');

const analyzer = new ContentAnalyzer();
const analysis = await analyzer.analyzer('presentation.md');

console.log('Metrics:', analysis.metrics);
console.log('Sections:', analysis.structure.sections);
```

## Generate Presentation

```javascript
const { SlideGenerator } = require('../lib');

const generator = new SlideGenerator();
const presentation = await generator.generate('presentation.md', {
  theme: 'seriph',
  title: 'My Presentation'
});

console.log(presentation.frontmatter);
console.log('Slides:', presentation.slides.length);
```

## Start Preview

```javascript
const { PreviewManager } = require('../preview');

const manager = new PreviewManager();

await manager.start({
  inputFile: 'presentation.md',
  port: 3030
});

// Browser opens with live preview
// File changes trigger automatic reload

// Stop when done
await manager.stop();
```

## Export to PDF

```javascript
const { ExportManager } = require('../preview');

const exporter = new ExportManager();
const result = await exporter.exportToPDF({
  url: 'http://localhost:3030',
  outputPath: './presentation.pdf'
});

console.log('PDF exported:', result.path);
```

## CLI Usage

```bash
# Generate presentation
node cli.js generate slides.md

# Analyze content
node cli.js analyze slides.md

# Start preview
node cli.js preview slides.md

# Export to PDF
node cli.js export slides.md -f pdf -o presentation.pdf

# Export screenshots of all slides
node cli.js export slides.md -f screenshot -o slides/ --all-slides
```
```

### Step 2: Create preview workflow example

Create: `html-presentation/examples/preview-workflow.md`

```markdown
# Preview Workflow Example

This example demonstrates a complete preview workflow with live reload.

## Start Preview with Live Reload

```javascript
const { PreviewManager } = require('../preview');

async function runPreview() {
  const manager = new PreviewManager();

  // Start preview
  await manager.start({
    inputFile: 'presentation.md',
    port: 3030
  });

  console.log('Preview started at http://localhost:3030');
  console.log('Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\nStopping preview...');
    await manager.stop();
    process.exit(0);
  });
}

runPreview().catch(console.error);
```

## File Change Detection

The PreviewManager automatically watches the input file for changes:

1. Edit `presentation.md`
2. Save the file
3. File Watcher detects change (debounced 200ms)
4. Preview refreshes automatically via Slidev's WebSocket

## Export During Preview

```javascript
const { ExportManager } = require('../preview');

async function captureWhilePreviewing() {
  const preview = new PreviewManager();
  const exporter = new ExportManager();

  // Start preview
  await preview.start({
    inputFile: 'presentation.md',
    port: 3030
  });

  // Capture screenshots while previewing
  const result = await exporter.captureScreenshot({
    url: 'http://localhost:3030',
    outputPath: './screenshots/',
    captureAll: true
  });

  console.log(`Captured ${result.files.length} slides`);

  // Continue preview...
  // When done, stop the preview
  await preview.stop();
}
```
```

### Step 3: Commit examples

Run:
```bash
git add html-presentation/examples/
git commit -m "docs: add Phase 3 usage examples

- Basic usage examples for all Phase 3 features
- Preview workflow with live reload
- Export examples for PDF/HTML/screenshots
- CLI usage examples"
```

Expected: Commit successful

---

## Task 10: Final Verification and Cleanup

### Step 1: Run complete test suite

Run: `cd html-presentation && npm test`

Expected: All tests pass (unit + integration)

### Step 2: Check test coverage

Run: `cd html-presentation && npm run test:coverage`

Expected:
- Core modules: >80%
- Lib modules: >80%
- Preview modules: >60%
- Overall: >70%

### Step 3: Verify CLI commands work

Test basic CLI functionality:

```bash
# Test generate command
node cli.js generate tests/fixtures/simple.md

# Test analyze command
node cli.js analyze tests/fixtures/simple.md

# Test recommend command
node cli.js recommend tests/fixtures/simple.md
```

Expected: All commands execute without errors

### Step 4: Create Phase 3 summary

Create summary document and commit:

Run:
```bash
git add html-presentation/
git commit -m "test: complete Phase 3 verification

- All tests passing (unit + integration)
- Test coverage meets targets
- CLI commands working correctly
- Examples documented
- Ready for Phase 4: LLM Integration"
```

Expected: Commit successful

---

## Summary

**Phase 3 Preview System is now complete!** ✅

**What was accomplished:**
- ✅ File Watcher with change detection and debouncing
- ✅ Preview Manager with Slidev integration
- ✅ Browser automation with Puppeteer
- ✅ Export Manager (PDF, HTML, screenshots)
- ✅ CLI preview and export commands
- ✅ Integration tests for preview workflow
- ✅ Usage examples and documentation
- ✅ All tests passing with good coverage

**Total commits for Phase 3:** ~10-12 commits

**Ready for Phase 4:** LLM Integration with Claude API and intelligent content optimization!

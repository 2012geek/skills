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

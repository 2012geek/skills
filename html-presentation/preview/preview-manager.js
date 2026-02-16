/**
 * Preview Manager
 * Manages browser preview with live reload
 */

const { spawn } = require('child_process');
const path = require('path');
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
      // Use node to run the slidev binary
      const slidevPath = path.join(__dirname, '../node_modules/.bin/slidev');

      console.log(`Starting Slidev server on port ${port}...`);

      // Use node directly with the slidev CLI
      this.server = spawn('node', [slidevPath, ...args], {
        stdio: 'pipe',
        env: { ...process.env }
      });

      // Log server output
      this.server.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Slidev] ${output}`);
        }
      });

      this.server.stderr.on('data', (data) => {
        const output = data.toString().trim();
        // Filter out deprecation warnings
        if (output && !output.includes('DEP0190') && !output.includes('localstorage-file')) {
          console.error(`[Slidev] ${output}`);
        }
      });

      this.server.on('error', (err) => {
        console.error('Failed to start Slidev server:', err);
        reject(err);
      });

      this.server.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.error(`Slidev server exited with code ${code}`);
        }
      });

      // Give server time to start
      setTimeout(() => {
        console.log('Slidev server started successfully');
        resolve(this.server);
      }, 3000);
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

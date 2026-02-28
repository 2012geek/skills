const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Helper function to create a delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Custom error class for PuppeteerCapturer errors
 */
class PuppeteerCapturerError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PuppeteerCapturerError';
  }
}

class PuppeteerCapturer {
  constructor(options = {}) {
    this.browser = null;
    this.screenshotDir = options.screenshotDir || path.join(os.tmpdir(), 'slides-screenshots');
    this.viewport = options.viewport || { width: 1920, height: 1080 };
  }

  /**
   * Initialize the browser instance and create screenshot directory
   * @returns {Promise<void>}
   */
  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    await fs.mkdir(this.screenshotDir, { recursive: true });
  }

  /**
   * Captures a screenshot of a webpage using headless Chrome
   * @param {string} url - The URL to capture
   * @param {Object} [options={}] - Capture options
   * @param {string} [options.savePath] - If provided, save screenshot to this filename
   * @param {number} [options.timeout] - Page load timeout in milliseconds (default: 15000)
   * @param {number} [options.waitTime] - Additional wait time for dynamic content in milliseconds (default: 1000)
   * @returns {Promise<{buffer: Buffer, path?: string}>} Screenshot buffer and optional file path
   * @throws {PuppeteerCapturerError} If URL is invalid or options are malformed
   */
  async capture(url, options = {}) {
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new PuppeteerCapturerError('URL must be a non-empty string');
    }

    try {
      new URL(url);
    } catch (e) {
      throw new PuppeteerCapturerError(`Invalid URL: ${url}`);
    }

    // Validate options
    if (options && typeof options !== 'object') {
      throw new PuppeteerCapturerError('Options must be an object');
    }

    if (options.savePath && typeof options.savePath !== 'string') {
      throw new PuppeteerCapturerError('savePath must be a string');
    }

    if (options.timeout && typeof options.timeout !== 'number') {
      throw new PuppeteerCapturerError('timeout must be a number');
    }

    if (options.waitTime && typeof options.waitTime !== 'number') {
      throw new PuppeteerCapturerError('waitTime must be a number');
    }

    await this.init();

    const page = await this.browser.newPage();
    await page.setViewport(this.viewport);

    try {
      // Use domcontentloaded for faster initial load
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: options.timeout || 15000
      });

      // Wait a bit for dynamic content to load
      await delay(options.waitTime || 1000);

      // Wait for slide to render if it's a Slidev page
      await page.waitForSelector('.slidev-layout', { timeout: 3000 }).catch(() => {});

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

  /**
   * Close the browser instance and cleanup resources
   * @returns {Promise<void>}
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = {
  PuppeteerCapturer,
  PuppeteerCapturerError
};

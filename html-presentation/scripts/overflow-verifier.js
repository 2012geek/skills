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
    try {
      const tempId = crypto.randomBytes(8).toString('hex');
      this.tempFile = path.join(__dirname, '..', `.verify-${tempId}.md`);
      await fs.writeFile(this.tempFile, this._wrapWithFrontmatter(markdownContent));
      await this._startServer();
      const result = await this._captureScreenshot();
      return result;
    } finally {
      await this.cleanup();
    }
  }

  _wrapWithFrontmatter(content) {
    return `---
theme: seriph
---

${content}`;
  }

  async _startServer() {
    const projectRoot = path.join(__dirname, '..');
    this.server = spawn('npx', ['@slidev/cli', this.tempFile, '--port', String(this.port)], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: projectRoot
    });

    await this._waitForServer();
  }

  async _waitForServer() {
    // Wait for server to be ready with longer polling
    let attempts = 0;
    const maxAttempts = Math.floor(this.timeout / 1000);

    while (attempts < maxAttempts) {
      try {
        await new Promise((resolve, reject) => {
          const options = {
            hostname: 'localhost',
            port: this.port,
            path: '/',
            method: 'GET',
            timeout: 2000
          };

          const req = http.request(options, (res) => {
            req.destroy();
            resolve();
          });

          req.on('error', (err) => {
            req.destroy();
            reject(err);
          });

          req.on('timeout', () => {
            req.destroy();
            reject(new Error('timeout'));
          });

          req.end();
        });

        // Server responded, give it time to fully build
        await new Promise(r => setTimeout(r, 3000));
        return true;
      } catch (e) {
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    throw new Error('Server failed to start after ' + maxAttempts + ' attempts');
  }

  async _captureScreenshot() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await this.browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(`http://localhost:${this.port}/0`, { waitUntil: 'networkidle2', timeout: this.timeout });
    await new Promise(r => setTimeout(r, 1500));

    const screenshot = await page.screenshot({ fullPage: true });
    const basicInfo = await page.evaluate(() => {
      // Try to find the actual slide container
      const slideContainer = document.querySelector('.slide-content') || document.querySelector('.slidev-layout') || document.body;
      return {
        title: document.querySelector('h1, h2')?.textContent?.substring(0, 100) || 'No title',
        vOverflow: slideContainer.scrollHeight > window.innerHeight,
        hOverflow: slideContainer.scrollWidth > window.innerWidth,
        ratio: (slideContainer.scrollHeight / window.innerHeight).toFixed(1),
        scrollHeight: slideContainer.scrollHeight,
        innerHeight: window.innerHeight
      };
    });

    return { screenshot, basicInfo };
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.server) {
      this.server.kill('SIGTERM');

      // Check if process already exited
      if (this.server.killed || this.server.exitCode !== null) {
        // Process already dead, no need to wait
      } else {
        await new Promise(resolve => {
          this.server.on('exit', resolve);
          setTimeout(resolve, 5000); // Force resolve after 5s
        });
      }
      this.server = null;
    }
    if (this.tempFile) {
      try {
        await fs.unlink(this.tempFile);
      } catch (e) { /* ignore */ }
      this.tempFile = null;
    }
  }
}

module.exports = SlideVerifier;

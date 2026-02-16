/**
 * Export Manager
 * Handles PDF, HTML, and screenshot exports
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Require puppeteer at module level for better testability
let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (e) {
  // Puppeteer not installed, will fail at runtime if used
}

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
    if (!puppeteer) {
      throw new Error('Puppeteer not installed');
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Get total number of slides
    const slides = await page.$$eval('.slidev-page',
      els => els.map(el => el.getAttribute('data-page-number'))
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
    if (!puppeteer) {
      throw new Error('Puppeteer not installed');
    }

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
    if (!puppeteer) {
      throw new Error('Puppeteer not installed');
    }

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
    if (!puppeteer) {
      throw new Error('Puppeteer not installed');
    }

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // Get slide count
    const slideCount = await page.$$eval('.slidev-page',
      els => els.length
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

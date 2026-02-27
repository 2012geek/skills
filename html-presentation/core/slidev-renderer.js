const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class SlidevRenderer {
  constructor(options = {}) {
    this.tempDir = options.tempDir || path.join(os.tmpdir(), 'slides-render');
    this.theme = options.theme || 'seriph';
  }

  async render(server, markdown, options = {}) {
    // Ensure temp dir exists
    await fs.mkdir(this.tempDir, { recursive: true });

    // Generate unique filename and slide ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const slideId = `slide-${timestamp}-${random}`;
    const tempFile = path.join(this.tempDir, `${slideId}.md`);

    // Wrap with frontmatter
    const fullMarkdown = this.wrapWithFrontmatter(markdown, options);

    // Write temporary slide file
    await fs.writeFile(tempFile, fullMarkdown, 'utf-8');

    // Build the slide URL using hash-based approach
    // This allows navigating to specific slides without file path issues
    const slideUrl = `${server.url}/#${slideId}`;

    return {
      url: slideUrl,
      server: server,
      tempFile: tempFile,
      markdown: fullMarkdown,
      slideId: slideId
    };
  }

  wrapWithFrontmatter(markdown, options = {}) {
    const theme = options.theme || this.theme;

    let frontmatter = `---
theme: ${theme}
`;

    // Add optional frontmatter properties
    if (options.title) {
      frontmatter += `title: ${options.title}\n`;
    }

    if (options.info) {
      frontmatter += `info: ${options.info}\n`;
    }

    frontmatter += `---
`;

    return frontmatter + '\n' + markdown;
  }

  async cleanup(tempFile) {
    try {
      await fs.unlink(tempFile);
    } catch (e) {
      // Ignore cleanup errors
      // File may already be deleted or permission issues
    }
  }

  async cleanupAll(tempFiles) {
    await Promise.all(
      tempFiles.map(file => this.cleanup(file))
    );
  }

  /**
   * Render multiple slides in parallel using server pool
   * @param {ServerPool} pool - Server pool for parallel rendering
   * @param {Array<{markdown: string, options?: object}>} slides - Slides to render
   * @returns {Promise<Array>} Array of render results
   */
  async renderBatch(pool, slides) {
    const results = [];

    await Promise.all(slides.map(async (slide) => {
      const server = await pool.acquire();
      try {
        const result = await this.render(server, slide.markdown, slide.options);
        results.push(result);
      } finally {
        pool.release(server);
      }
    }));

    return results;
  }
}

module.exports = { SlidevRenderer };

const { SlidevRenderer } = require('./slidev-renderer');
const { PuppeteerCapturer } = require('./puppeteer-capturer');
const { LLMJudge } = require('./llm-judge');
const { LLMFixer } = require('./llm-fixer');
const { ServerPool } = require('./server-pool');
const { AttemptHistory } = require('./attempt-history');

/**
 * Orchestrates the verify-fix loop for slide quality assurance
 * Renders slides, captures screenshots, judges quality, and fixes issues
 */
class VerifyFixLoop {
  constructor(options = {}) {
    this.threshold = options.threshold || 80;
    this.maxIterations = options.maxIterations || 3;

    // Initialize components
    this.serverPool = new ServerPool(options.serverPool);
    this.renderer = new SlidevRenderer();
    this.capturer = new PuppeteerCapturer(options.capturer);
    this.judge = new LLMJudge(options.judge);
    this.fixer = new LLMFixer(options.fixer);
    this.history = new AttemptHistory();
  }

  /**
   * Verify and fix a slide until quality threshold is met
   * @param {string} markdown - Slide markdown content
   * @param {string} slideId - Slide identifier
   * @param {Object} options - Verification options
   * @returns {Object} Verification result with markdown and status
   */
  async verify(markdown, slideId, options = {}) {
    const maxIterations = options.maxIterations || this.maxIterations;
    const interactive = options.interactive || false;

    let currentMarkdown = markdown;
    const attempts = [];

    // Auto-fix phase
    for (let i = 0; i < maxIterations; i++) {
      try {
        // Render slide
        const server = await this.serverPool.acquire();
        try {
          const rendered = await this.renderer.render(server, currentMarkdown);

          // Capture screenshot
          const screenshot = await this.capturer.capture(rendered.url, {
            savePath: `slide-${slideId}-attempt-${i + 1}.png`
          });

          // Judge quality
          const judgment = await this.judge.evaluate(screenshot.buffer);

          // Record attempt
          const attempt = {
            iteration: i + 1,
            approach: judgment.approach || 'default',
            score: judgment.overall,
            issues: judgment.issues || [],
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

          // Fix issues
          currentMarkdown = await this.fixer.fix(currentMarkdown, judgment);

        } finally {
          this.serverPool.release(server);
        }

      } catch (error) {
        console.error(`Error in iteration ${i + 1}:`, error.message);
        attempts.push({
          iteration: i + 1,
          error: error.message,
          markdown: currentMarkdown
        });
        break;
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

  /**
   * Clean up resources
   */
  async close() {
    await this.serverPool.closeAll();
    await this.capturer.close();
    this.judge.close();
  }
}

module.exports = { VerifyFixLoop };

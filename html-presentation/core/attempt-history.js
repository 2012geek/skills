const crypto = require('crypto');

/**
 * Tracks slide fix attempts to detect loops and maintain history
 */
class AttemptHistory {
  constructor() {
    this.history = new Map();
  }

  /**
   * Record a fix attempt for a slide
   * @param {string} slideId - Slide identifier
   * @param {Object} attempt - Attempt details
   * @returns {Array} Updated slide history
   */
  record(slideId, attempt) {
    if (!this.history.has(slideId)) {
      this.history.set(slideId, []);
    }

    const slideHistory = this.history.get(slideId);

    // Add metadata
    attempt.timestamp = new Date().toISOString();
    attempt.markdownHash = this.hash(attempt.markdown);

    slideHistory.push(attempt);

    return slideHistory;
  }

  /**
   * Get attempt history for a slide
   * @param {string} slideId - Slide identifier
   * @returns {Array} Attempt history
   */
  get(slideId) {
    return this.history.get(slideId) || [];
  }

  /**
   * Get all slide histories
   * @returns {Object} All histories as object
   */
  getAll() {
    return Object.fromEntries(this.history);
  }

  /**
   * Generate hash for markdown content
   * @param {string} markdown - Markdown content
   * @returns {string} MD5 hash
   */
  hash(markdown) {
    return crypto
      .createHash('md5')
      .update(markdown)
      .digest('hex');
  }

  /**
   * Check if markdown has been seen before (loop detection)
   * @param {string} slideId - Slide identifier
   * @param {string} newMarkdown - New markdown content
   * @returns {boolean} True if loop detected
   */
  hasLoop(slideId, newMarkdown) {
    const newHash = this.hash(newMarkdown);
    const slideHistory = this.get(slideId);

    return slideHistory.some(attempt => attempt.markdownHash === newHash);
  }

  /**
   * Clear history for a specific slide
   * @param {string} slideId - Slide identifier
   */
  clear(slideId) {
    this.history.delete(slideId);
  }

  /**
   * Clear all slide histories
   */
  clearAll() {
    this.history.clear();
  }
}

module.exports = { AttemptHistory };

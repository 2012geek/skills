class LayoutSelector {
  constructor() {
    // Standard Slidev layouts
    this.standardLayouts = [
      'default', 'center', 'cover', 'two-cols', 'two-cols-header',
      'image', 'image-left', 'image-right', 'section', 'quote'
    ];
  }

  /**
   * Select appropriate Slidev layout based on content metrics.
   *
   * @param {Object} metrics - Content analysis metrics
   * @param {number} [metrics.codeRatio=0] - Ratio of code characters (0-1)
   * @param {number} [metrics.textRatio=0] - Ratio of text characters (0-1)
   * @param {number} [metrics.imageRatio=0] - Ratio of image references (0-1)
   * @param {boolean} [metrics.hasH1=false] - Whether slide has H1 heading
   * @param {boolean} [metrics.minimalContent=false] - Whether slide has minimal content
   * @param {boolean} [metrics.firstElementIsImage=false] - Whether first element is image
   * @param {boolean} [metrics.isSection=false] - Whether slide is a section divider
   * @returns {string} Slidev layout name
   */
  select(metrics) {
    // Critical Issue 1: Handle null/undefined input
    if (!metrics || typeof metrics !== 'object') {
      return 'default';
    }

    const {
      codeRatio = 0,
      textRatio = 0,
      imageRatio = 0,
      hasH1 = false,
      minimalContent = false,
      firstElementIsImage = false,
      isSection = false
    } = metrics;

    // Important Issue 3: Normalize ratios to [0, 1] range
    const normalizedCodeRatio = Math.max(0, Math.min(1, codeRatio));
    const normalizedTextRatio = Math.max(0, Math.min(1, textRatio));
    const normalizedImageRatio = Math.max(0, Math.min(1, imageRatio));

    // Title slides
    if (hasH1 && minimalContent) {
      return 'center';
    }

    // Cover slides
    if (hasH1 && normalizedImageRatio > 0.5) {
      return 'cover';
    }

    // Critical Issue 2: H1 slides with moderate content should default to center
    if (hasH1) {
      return 'center';
    }

    // Code-heavy slides (use standard layouts)
    if (normalizedCodeRatio >= 0.9) {
      return 'default'; // Use default with centered code
    }

    if (normalizedCodeRatio >= 0.6) {
      return 'two-cols'; // Code on one side, text on other
    }

    // Important Issue 4: Remove redundant image ratio checks
    // Image-heavy slides
    if (normalizedImageRatio >= 0.6) {
      return 'image';
    }

    // Balanced code and text
    if (normalizedCodeRatio >= 0.3 && normalizedTextRatio >= 0.3) {
      return 'two-cols';
    }

    // Images with text
    if (normalizedImageRatio >= 0.3) {
      return firstElementIsImage ? 'image-left' : 'image-right';
    }

    // Section dividers
    if (normalizedTextRatio > 0.9 && isSection) {
      return 'section';
    }

    // Default
    return 'default';
  }

  getStandardLayouts() {
    return this.standardLayouts;
  }

  isValidLayout(layout) {
    return this.standardLayouts.includes(layout);
  }
}

module.exports = { LayoutSelector };

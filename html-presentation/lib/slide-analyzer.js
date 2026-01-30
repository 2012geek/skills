/**
 * Slide Analyzer - Analyzes individual slides to extract metrics for LLM
 * 为 LLM 分析单张幻灯片并提取指标
 */

/**
 * Analyzes individual slides to extract metrics for LLM
 */
class SlideAnalyzer {
  /**
   * Analyze a slide and extract metrics
   * @param {Object} slide - Slide object with title and content
   * @returns {Object} Analysis results
   */
  analyzeSlide(slide) {
    const content = typeof slide === 'string' ? slide : slide.content;
    const title = typeof slide === 'string' ? '' : (slide.title || '');

    // Extract metrics
    const listItems = content.match(/^\s*[-*+]\s+/gm) || [];
    const numberedLists = content.match(/^\s*\d+\.\s+/gm) || [];
    const codeBlocks = content.match(/```[\s\S]*?```/g) || [];
    const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
    const tables = content.match(/\|.*\|/g) || [];

    // Count lines and characters
    const lines = content.split('\n').length;
    const chars = content.length;
    const words = content.split(/\s+/).length;

    // Detect slide type
    const slideType = this.detectSlideType(content, title);

    // Estimate visual density
    const density = this.calculateDensity(content, lines, chars);

    // Calculate average list item length
    const avgListLength = listItems.length > 0
      ? Math.round(listItems.reduce((sum, item) => sum + item.length, 0) / listItems.length)
      : 0;

    return {
      index: slide.index || 0,
      title,
      slideType,
      metrics: {
        listCount: listItems.length + numberedLists.length,
        codeBlockCount: codeBlocks.length,
        headingCount: headings.length,
        tableCount: tables.length,
        lineCount: lines,
        charCount: chars,
        wordCount: words,
        density,
        avgListLength
      },
      hasLongLists: listItems.length > 15 || numberedLists.length > 15,
      hasCode: codeBlocks.length > 0,
      hasTables: tables.length > 0,
      content: content
    };
  }

  /**
   * Detect the type of slide
   */
  detectSlideType(content, title) {
    // TOC slides
    if (title.match(/目录|TOC|Table of Contents|目录表/i) ||
        content.match(/^##\s*目录|^##\s*目录表|^##\s*Table of Contents|^##\s*TOC/m)) {
      return 'toc';
    }

    // Main section (Chinese numbering)
    if (title.match(/^[一二三四五六七八九十]+、/) ||
        content.match(/^##\s*[一二三四五六七八九十]+、/m)) {
      return 'main-section';
    }

    // List-heavy slides
    const listMatch = content.match(/^\s*[-*+]\s+/gm);
    if (listMatch && listMatch.length > 10) {
      return 'list-heavy';
    }

    // Code-heavy slides
    const codeMatch = content.match(/```/g);
    if (codeMatch && codeMatch.length > 2) {
      return 'code-heavy';
    }

    // Table-heavy slides
    if (content.match(/\|.*\|/)) {
      return 'table-heavy';
    }

    return 'standard';
  }

  /**
   * Calculate visual density (items per visible area)
   */
  calculateDensity(content, lines, chars) {
    // Approximate visible area: 40 lines x 100 chars = 4000 chars
    const visibleArea = 4000;
    const ratio = chars / visibleArea;

    if (ratio > 2.0) return 'very-high';
    if (ratio > 1.5) return 'high';
    if (ratio > 1.0) return 'medium';
    return 'low';
  }

  /**
   * Analyze multiple slides
   */
  analyzeAll(slides) {
    return slides.map((slide, index) => {
      slide.index = index;
      return this.analyzeSlide(slide);
    });
  }

  /**
   * Get slide summary for LLM prompt
   */
  getSlideSummary(analysis) {
    return {
      index: analysis.index,
      title: analysis.title,
      type: analysis.slideType,
      density: analysis.metrics.density,
      listItems: analysis.metrics.listCount,
      codeBlocks: analysis.metrics.codeBlockCount,
      length: analysis.metrics.charCount,
      lines: analysis.metrics.lineCount
    };
  }
}

module.exports = { SlideAnalyzer };

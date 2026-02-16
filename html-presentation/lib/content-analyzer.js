/**
 * Content Analyzer
 * Analyzes markdown content and extracts structural/semantic information
 */

const fs = require('fs').promises;

class ContentAnalyzer {
  constructor(options = {}) {
    this.options = options;
  }

  async analyze(markdownPath) {
    const content = await fs.readFile(markdownPath, 'utf-8');
    const structure = this.detectHierarchy(content);
    const metrics = this.calculateMetrics(content);

    // Classify each section
    const contentTypes = structure.sections.map(section => ({
      ...section,
      classification: this.classifyContent(section)
    }));

    return {
      structure,
      contentTypes,
      metrics,
      recommendations: this.generateRecommendations(metrics, contentTypes)
    };
  }

  classifyContent(section) {
    const content = section.content || section.raw || '';
    const total = content.length || 1;

    // Count code blocks
    const codeMatches = content.match(/```[\s\S]*?```/g) || [];
    const codeLength = codeMatches.reduce((sum, block) => sum + block.length, 0);
    const codeRatio = codeLength / total;

    // Count images
    const imageMatches = content.match(/!\[.*?\]\(.*?\)/g) || [];
    const imageCount = imageMatches.length;
    const imageRatio = Math.min(imageCount * 0.1, 1); // Each image ~10%

    // Text is everything else
    const textRatio = Math.max(0, 1 - codeRatio - imageRatio);

    return {
      code: codeRatio,
      image: imageRatio,
      text: textRatio,
      dominant: this.getDominantType(codeRatio, imageRatio)
    };
  }

  getDominantType(codeRatio, imageRatio) {
    if (codeRatio > 0.5) return 'code';
    if (imageRatio > 0.3) return 'image';
    return 'text';
  }

  calculateMetrics(content) {
    const words = content.split(/\s+/).filter(w => w.length > 0);
    const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
    const images = (content.match(/!\[.*?\]\(.*?\)/g) || []).length;
    const tables = (content.match(/\|.*\|/g) || []).length;

    return {
      wordCount: words.length,
      charCount: content.length,
      codeBlockCount: codeBlocks,
      imageCount: images,
      tableCount: Math.floor(tables / 2), // Approximate
      readabilityScore: this.calculateReadability(words)
    };
  }

  calculateReadability(words) {
    // Simple readability: average word length
    if (words.length === 0) return 0;
    const avgLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;
    return Math.max(0, Math.min(100, 100 - avgLength * 5));
  }

  detectHierarchy(markdown) {
    const headingRegex = /^(#{1,4})\s+(.+)$/gm;
    const headings = [];
    let match;

    while ((match = headingRegex.exec(markdown)) !== null) {
      headings.push({
        level: match[1].length,
        title: match[2].trim(),
        position: match.index
      });
    }

    const maxLevel = headings.length > 0
      ? Math.max(...headings.map(h => h.level))
      : 0;

    // Group content into sections
    const sections = this.createSections(markdown, headings);

    return {
      headings,
      maxLevel,
      sections
    };
  }

  createSections(markdown, headings) {
    if (headings.length === 0) {
      return [{
        level: 0,
        title: 'Untitled',
        content: markdown,
        start: 0,
        end: markdown.length
      }];
    }

    const sections = [];

    for (let i = 0; i < headings.length; i++) {
      const heading = headings[i];
      const nextHeading = headings[i + 1];

      const start = heading.position;
      const end = nextHeading ? nextHeading.position : markdown.length;
      const content = markdown.substring(start, end);

      sections.push({
        level: heading.level,
        title: heading.title,
        content,
        start,
        end
      });
    }

    return sections;
  }

  generateRecommendations(metrics, contentTypes) {
    const recommendations = [];

    if (metrics.codeBlockCount > 5) {
      recommendations.push({
        type: 'layout',
        suggestion: 'code-focus',
        reason: 'Multiple code blocks detected'
      });
    }

    if (metrics.imageCount > 3) {
      recommendations.push({
        type: 'layout',
        suggestion: 'image-focus',
        reason: 'Multiple images detected'
      });
    }

    return recommendations;
  }
}

module.exports = { ContentAnalyzer };

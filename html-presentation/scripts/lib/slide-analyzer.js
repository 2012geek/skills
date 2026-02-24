function analyzeSlide(slide) {
  const { content, frontmatter } = slide;

  // Calculate metrics
  const metrics = {
    hasH1: /^#\s/.test(content),
    h2Count: (content.match(/^##\s/gm) || []).length,
    hasCode: /```/.test(content),
    codeBlockCount: (content.match(/```/g) || []).length / 2,
    hasImages: content.includes('<img'),
    imageCount: (content.match(/<img/g) || []).length,
    hasGrid: content.includes('grid-template-columns'),
    hasCards: content.includes('case-card') || content.includes('comparison-card') || content.includes('class="card"'),
    lineCount: content.split('\n').length,
    hasVClick: content.includes('<v-click'),
    hasLists: /^\s*[-*+]\s/m.test(content)
  };

  // Decision tree for slide type

  // Title slide: H1 only, minimal content, no code
  if (metrics.hasH1 && !metrics.h2Count && !metrics.hasCode && metrics.lineCount < 20) {
    return {
      type: 'title',
      layout: 'center',
      reason: 'H1 only, minimal content'
    };
  }

  // Image-heavy: multiple images
  if (metrics.imageCount >= 2 && metrics.lineCount < 40) {
    return {
      type: 'image',
      layout: 'default',
      imageHeavy: true,
      reason: `${metrics.imageCount} images, content-light`
    };
  }

  // Two-column: has grid or cards
  if (metrics.hasGrid || metrics.hasCards) {
    return {
      type: 'two-col',
      layout: 'default',
      reason: 'Grid/card layout detected'
    };
  }

  // Code-heavy: multiple code blocks
  if (metrics.codeBlockCount >= 2) {
    return {
      type: 'code',
      layout: 'default',
      codeHeavy: true,
      reason: `${metrics.codeBlockCount} code blocks`
    };
  }

  // Content slide: multiple H2s
  if (metrics.h2Count >= 2) {
    return {
      type: 'content',
      layout: 'default',
      reason: `${metrics.h2Count} sections`
    };
  }

  // Simple slide: fallback
  return {
    type: 'simple',
    layout: 'default',
    reason: 'Default layout'
  };
}

module.exports = { analyzeSlide };

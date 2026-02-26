const marked = require('marked');

class ContentAnalyzer {
  async analyze(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      throw new Error('Markdown must be a non-empty string');
    }

    const tokens = marked.lexer(markdown);
    const sections = this.extractSections(tokens);
    const slides = this.extractSlides(tokens);

    return {
      totalSlides: slides.length,
      sections: sections,
      metrics: this.calculateMetrics(tokens),
      structure: this.analyzeStructure(tokens)
    };
  }

  analyzeSlide(markdown) {
    if (!markdown || typeof markdown !== 'string') {
      throw new Error('Markdown must be a non-empty string');
    }

    const tokens = marked.lexer(markdown);
    const stats = this.countElements(tokens);

    const total = stats.text + stats.code + stats.images.length;

    return {
      codeRatio: total > 0 ? stats.code / total : 0,
      textRatio: total > 0 ? stats.text / total : 0,
      imageRatio: total > 0 ? stats.images.length / total : 0,
      codeBlocks: stats.codeBlocks,
      images: stats.images,
      hasImages: stats.images.length > 0,
      hasTables: stats.tables > 0,
      hasCodeBlocks: stats.codeBlocks.length > 0,
      wordCount: stats.wordCount,
      hasLongText: stats.wordCount > 200
    };
  }

  extractSections(tokens) {
    const sections = [];
    let currentSection = null;
    let sectionId = 1;

    tokens.forEach(token => {
      if (token.type === 'heading' && token.depth === 1) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          id: sectionId++,
          title: token.text,
          contents: []
        };
      } else if (currentSection && token.type === 'heading' && token.depth === 2) {
        currentSection.contents.push({
          type: 'subsection',
          title: token.text
        });
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  extractSlides(tokens) {
    const slides = [];
    let currentSlide = [];

    tokens.forEach(token => {
      if (token.type === 'hr' || token.type === 'heading' && token.depth === 1) {
        if (currentSlide.length > 0) {
          slides.push(currentSlide);
          currentSlide = [];
        }
      }
      currentSlide.push(token);
    });

    if (currentSlide.length > 0) {
      slides.push(currentSlide);
    }

    return slides;
  }

  countElements(tokens) {
    let text = 0;
    let code = 0;
    let images = [];
    let tables = 0;
    let codeBlocks = [];
    let wordCount = 0;

    tokens.forEach(token => {
      switch (token.type) {
        case 'paragraph':
          text += token.text.length;
          wordCount += token.text.split(/\s+/).length;
          // Check for nested images
          if (token.tokens) {
            token.tokens.forEach(nested => {
              if (nested.type === 'image') {
                images.push({
                  href: nested.href,
                  text: nested.text
                });
              }
            });
          }
          break;
        case 'code':
          code += token.text.length;
          codeBlocks.push({
            lang: token.lang,
            length: token.text.length
          });
          break;
        case 'image':
          images.push({
            href: token.href,
            text: token.text
          });
          break;
        case 'table':
          tables++;
          break;
      }
    });

    return { text, code, images, tables, codeBlocks, wordCount };
  }

  calculateMetrics(tokens) {
    const stats = this.countElements(tokens);
    const total = stats.text + stats.code + stats.images.length;

    return {
      avgCodeRatio: total > 0 ? stats.code / total : 0,
      avgImageRatio: total > 0 ? stats.images.length / total : 0,
      avgTextRatio: total > 0 ? stats.text / total : 0,
      hasTables: stats.tables > 0,
      hasLongText: stats.wordCount > 200,
      hasCodeBlocks: stats.codeBlocks.length > 0,
      complexity: this.calculateComplexity(stats)
    };
  }

  calculateComplexity(stats) {
    if (stats.tables > 0 || stats.codeBlocks.length > 2) {
      return 'high';
    } else if (stats.codeBlocks.length > 0 || stats.images.length > 0) {
      return 'medium';
    }
    return 'low';
  }

  analyzeStructure(tokens) {
    const headings = tokens.filter(t => t.type === 'heading');
    const maxDepth = Math.max(...headings.map(h => h.depth), 0);

    return {
      headings: headings.map(h => ({
        depth: h.depth,
        text: h.text
      })),
      depth: maxDepth
    };
  }
}

module.exports = { ContentAnalyzer };

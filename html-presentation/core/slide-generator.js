const { ContentAnalyzer } = require('./content-analyzer');
const { LayoutSelector } = require('./layout-selector');

class SlideGenerator {
  constructor(options = {}) {
    this.analyzer = new ContentAnalyzer();
    this.layoutSelector = new LayoutSelector();
    this.options = {
      theme: options.theme || 'seriph',
      title: options.title || '',
      author: options.author || ''
    };
  }

  async generate(inputPath, options = {}) {
    const fs = require('fs').promises;

    // Read input
    const markdown = await fs.readFile(inputPath, 'utf-8');

    // Analyze content
    const analysis = await this.analyzer.analyze(markdown);

    // Generate slides
    const slides = [];
    for (const section of analysis.sections) {
      for (const content of section.contents) {
        const slideMarkdown = this.generateSlide(content, analysis.metrics);
        slides.push(slideMarkdown);
      }
    }

    // Generate frontmatter
    const frontmatter = this.generateFrontmatter(analysis);

    // Assemble output
    const output = this.assemble(frontmatter, slides);

    // Write output
    const outputPath = options.output || inputPath.replace(/\.md$/, '.slides.md');
    await fs.writeFile(outputPath, output);

    return {
      success: true,
      outputPath: outputPath,
      stats: {
        totalSlides: slides.length
      }
    };
  }

  generateSlide(content, metrics) {
    // Select layout
    const layout = this.layoutSelector.select({
      codeRatio: metrics.avgCodeRatio,
      textRatio: metrics.avgTextRatio,
      imageRatio: metrics.avgImageRatio
    });

    // Generate markdown
    let markdown = `---\nlayout: ${layout}\n---\n\n`;
    markdown += `## ${content.title}\n\n`;

    return markdown;
  }

  generateFrontmatter(analysis) {
    return `---
theme: ${this.options.theme}
title: ${this.options.title || 'Presentation'}
author: ${this.options.author || ''}
class: text-left
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
transition: slide-left
titleTemplate: '%s'
---

`;
  }

  assemble(frontmatter, slides) {
    return frontmatter + slides.join('\n\n---\n\n');
  }
}

module.exports = { SlideGenerator };

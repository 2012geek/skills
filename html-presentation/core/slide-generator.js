const { ContentAnalyzer } = require('./content-analyzer');
const { LayoutSelector } = require('./layout-selector');
const { VerifyFixLoop } = require('./verify-fix-loop');
const { HumanIntervention } = require('./human-intervention');

class SlideGenerator {
  constructor(options = {}) {
    this.analyzer = new ContentAnalyzer();
    this.layoutSelector = new LayoutSelector();
    this.options = {
      theme: options.theme || 'seriph',
      title: options.title || '',
      author: options.author || ''
    };

    // Initialize VerifyFixLoop if verification is enabled
    this.verifyEnabled = options.verifyEnabled || false;
    this.interactive = options.interactive || false;

    if (this.verifyEnabled) {
      this.verifyFixLoop = new VerifyFixLoop({
        threshold: options.threshold || 80,
        maxIterations: options.maxIterations || 3,
        judge: {
          apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
        },
        fixer: {
          apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY
        }
      });
    }
  }

  async generate(inputPath, options = {}) {
    const fs = require('fs').promises;

    // Read input
    const markdown = await fs.readFile(inputPath, 'utf-8');

    // Analyze content
    const analysis = await this.analyzer.analyze(markdown);

    // Generate slides with optional verification
    const slides = [];
    let verifiedSlides = 0;
    let skippedSlides = 0;

    for (const section of analysis.sections) {
      for (let i = 0; i < section.contents.length; i++) {
        const content = section.contents[i];
        const slideId = `${section.id}-${i}`;
        let slideMarkdown = this.generateSlide(content, analysis.metrics);

        // Verify and fix if enabled
        if (this.verifyEnabled && this.verifyFixLoop) {
          try {
            const result = await this.verifyFixLoop.verify(
              slideMarkdown,
              slideId,
              {
                interactive: this.interactive,
                onInterventionNeeded: this.interactive
                  ? (markdown, attempts) => this.handleIntervention(markdown, attempts)
                  : undefined
              }
            );

            slideMarkdown = result.markdown;

            if (result.success) {
              verifiedSlides++;
            } else if (result.skipped || result.deferred) {
              skippedSlides++;
            }
          } catch (error) {
            console.warn(`Verification failed for slide ${slideId}: ${error.message}`);
            // Continue with original markdown
          }
        }

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
        totalSlides: slides.length,
        verifiedSlides: verifiedSlides,
        skippedSlides: skippedSlides
      }
    };
  }

  async handleIntervention(markdown, attempts) {
    const intervention = new HumanIntervention({
      threshold: this.verifyFixLoop.threshold
    });
    return await intervention.handle(markdown, attempts);
  }

  async close() {
    if (this.verifyFixLoop) {
      await this.verifyFixLoop.close();
    }
  }

  generateSlide(content, metrics) {
    const layout = this.layoutSelector.select({
      codeRatio: metrics.avgCodeRatio,
      textRatio: metrics.avgTextRatio,
      imageRatio: metrics.avgImageRatio
    });

    let markdown = `---\nlayout: ${layout}\n---\n\n`;
    markdown += `## ${content.title}\n\n`;

    if (content.content && content.content.length > 0) {
      markdown += this.tokensToMarkdown(content.content);
    }

    return markdown;
  }

  tokensToMarkdown(tokens) {
    return tokens.map(token => this.tokenToMarkdown(token)).filter(Boolean).join('\n\n');
  }

  tokenToMarkdown(token) {
    if (!token) return '';
    const bt = '`';
    switch (token.type) {
      case 'heading':
        return `${'#'.repeat(token.depth)} ${token.text}`;
      case 'paragraph':
        return token.text || (token.tokens ? this.tokensToMarkdown(token.tokens) : '');
      case 'code':
        return `${bt}${bt}${bt}${token.lang || ''}\n${token.text}\n${bt}${bt}${bt}`;
      case 'codespan':
        return `${bt}${token.text}${bt}`;
      case 'list':
        const prefix = token.ordered ? (i => `${i + 1}. `) : () => '- ';
        return token.items.map((item, i) => `${prefix(i)}${this.tokenToMarkdown(item)}`).join('\n');
      case 'list_item':
        return token.text || (token.tokens ? this.tokensToMarkdown(token.tokens) : '');
      case 'text':
        return token.raw || token.text || '';
      case 'strong':
        return `**${token.text}**`;
      case 'em':
        return `*${token.text}*`;
      case 'link':
        return `[${token.text}](${token.href})`;
      case 'image':
        return `![${token.text}](${token.href})`;
      case 'space':
        return '';
      case 'hr':
        return '---';
      case 'table':
        const header = `| ${token.header.map(h => h.text).join(' | ')} |`;
        const separator = `| ${token.header.map(() => '---').join(' | ')} |`;
        const rows = token.rows.map(row => `| ${row.map(c => c.text || '').join(' | ')} |`).join('\n');
        return `${header}\n${separator}\n${rows}`;
      case 'blockquote':
        return `> ${token.text || ''}`;
      default:
        return token.raw || token.text || '';
    }
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

/**
 * Slide Generator
 * Generates Slidev presentations from analyzed content
 */

const { ContentAnalyzer } = require('./content-analyzer');
const { LayoutEngine } = require('./layout-engine');
const { ThemeManager } = require('./theme-manager');

class SlideGenerator {
  constructor(options = {}) {
    this.analyzer = options.analyzer || new ContentAnalyzer();
    this.layoutEngine = options.layoutEngine || new LayoutEngine();
    this.themeManager = options.themeManager || new ThemeManager();
  }

  async generate(inputPath, options = {}) {
    // Analyze content
    const analysis = await this.analyzer.analyze(inputPath);

    // Generate slides
    const slides = this.splitIntoSlides(analysis.structure.sections);

    // Add layouts
    const slidesWithLayouts = slides.map(slide => {
      const classification = this.analyzer.classifyContent(slide);
      // Map classification structure to metrics structure for layout engine
      const metrics = {
        codeRatio: classification.code,
        imageRatio: classification.image,
        textRatio: classification.text
      };
      const layout = this.layoutEngine.selectLayout(metrics);
      return {
        ...slide,
        layout
      };
    });

    // Generate frontmatter
    const theme = options.theme || this.selectTheme(analysis);
    const frontmatter = this.generateFrontmatter({
      theme,
      title: options.title || this.extractTitle(analysis),
      author: options.author
    });

    return {
      frontmatter,
      slides: slidesWithLayouts,
      theme
    };
  }

  selectTheme(analysis) {
    const recommendations = this.themeManager.recommendThemes(analysis.metrics);
    return recommendations[0]?.theme || 'seriph';
  }

  extractTitle(analysis) {
    const firstHeading = analysis.structure.headings[0];
    return firstHeading ? firstHeading.title : 'Presentation';
  }

  generateFrontmatter(options) {
    const { theme, title, author } = options;
    const themeConfig = this.themeManager.getThemeConfig(theme);
    const config = themeConfig.frontmatter;

    let frontmatter = '---\n';
    frontmatter += `theme: ${theme}\n`;
    frontmatter += `title: ${title}\n`;

    if (author) {
      frontmatter += `author: ${author}\n`;
    }

    // Add theme-specific config
    Object.entries(config).forEach(([key, value]) => {
      if (key !== 'theme' && key !== 'title') {
        frontmatter += `${key}: ${JSON.stringify(value)}\n`;
      }
    });

    frontmatter += '---\n\n';

    return frontmatter;
  }

  splitIntoSlides(sections) {
    if (!sections || sections.length === 0) {
      return [];
    }

    const slides = [];

    sections.forEach(section => {
      // Each section becomes a slide
      // Preserve the full section structure for classification
      slides.push({
        title: section.title,
        level: section.level,
        content: section.content.trim(),
        raw: section.content.trim() // Add raw for classifyContent
      });
    });

    return slides;
  }

  renderToMarkdown(presentation) {
    let output = presentation.frontmatter;

    presentation.slides.forEach(slide => {
      // Add layout directive if not default
      if (slide.layout && slide.layout !== 'default') {
        output += `---\nlayout: ${slide.layout}\n---\n\n`;
      }

      // Add title
      output += `# ${slide.title}\n\n`;

      // Add content
      output += `${slide.content}\n\n`;

      output += '---\n\n';
    });

    return output;
  }
}

module.exports = { SlideGenerator };

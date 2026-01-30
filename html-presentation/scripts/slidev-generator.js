#!/usr/bin/env node

/**
 * Slidev Markdown Generator v2.0
 * Converts source markdown to Slidev-compatible format
 * - Removes existing --- separators
 * - Adds smart slide splitting based on headings
 */

const fs = require('fs');
const path = require('path');
const { SlideOptimizer } = require('../lib/slide-optimizer.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  theme: 'seriph',
  highlighter: false,  // 完全禁用语法高亮，大幅提升加载速度
  lineNumbers: false,  // 禁用行号以加速
  drawings: {
    persist: false
  },
  editor: false,
  transition: 'none',  // 禁用过渡动画加速
  download: false,
  info: false,
  canCopy: true,
  transitionSlide: false,  // 禁用幻灯片过渡动画
  mouseWheel: true,
  // 禁用一些功能以加速加载
  recording: {
    enabled: false,  // 完全禁用录制功能
    video: false,
    audio: false
  },
  slidev: false,
  charts: false,
  editable: false,
  // 禁用 presenter mode 相关功能
  presenter: false,
  // 完全禁用 UnoCSS
  uno: false,
  // 禁用 Walt animations
  wa: false,
  // 禁用 LaTeX
  latex: false,
  // 禁用单选组件
  select: false,
  // 简化字体配置，避免 Google Fonts URL 问题
  // 字体通过内联 CSS 设置，不需要在 frontmatter 中配置
  // fonts: {
  //   sans: 'sans-serif',
  //   serif: 'sans-serif',
  //   mono: 'monospace'
  // }
};

// ============================================================================
// FRONTMATTER GENERATOR
// ============================================================================

function generateFrontmatter() {
  return `---
theme: ${CONFIG.theme}
highlighter: shiki
lineNumbers: ${CONFIG.lineNumbers}
drawings:
  persist: ${CONFIG.drawings.persist}
editor: false
transition: ${CONFIG.transition}
download: ${CONFIG.download}
info: ${CONFIG.info}
canCopy: ${CONFIG.canCopy}
transitionSlide: ${CONFIG.transitionSlide}
mouseWheel: ${CONFIG.mouseWheel}
recording:
  enabled: false
  video: false
  audio: false
class: text-left
---

`;
}

// ============================================================================
// SLIDE PROCESSOR
// ============================================================================

class SlideProcessor {
  constructor(options = {}) {
    this.slides = [];
    this.currentSlide = { content: [], title: '' };
    this.inCodeBlock = false;
    this.codeBlockLines = [];
    this.options = options;
    this.slideOptimizer = new SlideOptimizer(options);
  }

  async process(markdown) {
    // Remove consecutive --- to prevent empty slides
    let cleanedMarkdown = markdown.replace(/\n---\n\n---\n/g, '\n---\n');
    const lines = cleanedMarkdown.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle code blocks
      if (line.trim().startsWith('```')) {
        if (this.inCodeBlock) {
          // End code block
          this.codeBlockLines.push(line);
          this.currentSlide.content.push(this.codeBlockLines.join('\n'));
          this.codeBlockLines = [];
          this.inCodeBlock = false;
        } else {
          // Start code block
          this.inCodeBlock = true;
          this.codeBlockLines.push(line);
        }
        continue;
      }

      if (this.inCodeBlock) {
        this.codeBlockLines.push(line);
        continue;
      }

      // Handle horizontal rules (---) as slide separators
      // Must match exactly '---' on its own line
      if (line.trim() === '---' && !line.includes('layout:')) {
        this.finalizeSlide();
        continue;
      }

      // Detect headings for slide splitting
      const h1Match = line.match(/^#\s+(.+)$/);
      const h2Match = line.match(/^##\s+(.+)$/);

      if (h1Match) {
        // H1 always starts a new slide
        this.finalizeSlide();
        this.currentSlide.title = h1Match[1];
        this.currentSlide.content.push(line);
        continue;
      }

      if (h2Match) {
        const title = h2Match[1];
        // Check if this H2 should start a new slide
        const isMajorSection = [
          '文档概述',
          '需求背景分析',
          'NVIDIA CUDA',
          'Intel oneAPI',
          'ARM big.LITTLE',
          'Apple M1',
          '综合方案设计',
          '实施路线图',
          '参考资料',
          '附录',
          'Vue 组件示例'
        ].some(keyword => title.includes(keyword));

        // Also start new slide for "一、" "二、" etc.
        const isNumberedSection = title.match(/^[一二三四五六七八九十]+、/);

        if (isMajorSection || isNumberedSection) {
          this.finalizeSlide();
          this.currentSlide.title = title;
          this.currentSlide.content.push(line);
          continue;
        }
      }

      // Add line to current slide
      this.currentSlide.content.push(line);
    }

    // Don't forget the last slide
    this.finalizeSlide();

    // Optimize ALL slides with LLM (not just TOC)
    if (this.options.optimizeSlides !== false) {
      this.slides = await this.slideOptimizer.optimizeAllSlides(this.slides);
    }

    return this.slides;
  }

  finalizeSlide() {
    // Join content with newlines, but DON'T trim - preserve original formatting
    // Trim only leading/trailing whitespace lines, not the last line's content
    let content = this.currentSlide.content.join('\n');
    // Remove leading empty lines
    content = content.replace(/^\n+/, '');
    // Remove trailing empty lines
    content = content.replace(/\n+$/, '');

    // Ensure slide is saved even if content is short (e.g., title slide)
    // Check if we have either content OR a title (for title-only slides)
    if (content.length > 0 || this.currentSlide.title) {
      this.slides.push({
        title: this.currentSlide.title,
        content: content
      });
    }
    this.currentSlide = { content: [], title: '' };
  }
}

// ============================================================================
// MARKDOWN GENERATOR
// ============================================================================

function compileSlidesToMarkdown(slides) {
  const parts = [];

  slides.forEach((slide, index) => {
    // Build slide content with layout frontmatter if needed
    let slideMarkdown = '';

    // Detect if this is a title slide (H1 heading or first slide with minimal content)
    const isTitleSlide = index === 0 && (
      slide.content.match(/^#\s+/m) ||
      slide.content.split('\n').length < 10
    );

    // Separator logic for Slidev:
    // Format: ---[layout: xxx\n]---\n\nContent
    if (index === 0) {
      // First slide - no leading --- separator
      // Use 'center' layout for title slides, otherwise use specified layout
      if (isTitleSlide && !slide.layout) {
        slideMarkdown += `---\nlayout: center\nclass: text-center\n---\n\n`;
      } else if (slide.layout) {
        slideMarkdown += `---\nlayout: ${slide.layout}\n---\n\n`;
      }
    } else {
      // Other slides - always start with ---
      slideMarkdown += `---\n`;
      if (slide.layout) {
        slideMarkdown += `layout: ${slide.layout}\n---\n\n`;
      } else {
        slideMarkdown += `\n`;
      }
    }

    // Add the actual content
    // Ensure content ends with newline for proper formatting
    let content = slide.content;
    if (!content.endsWith('\n')) {
      content += '\n';
    }
    slideMarkdown += content;

    // Add any custom styling wrapper
    if (slide.fontSize) {
      slideMarkdown = slideMarkdown.replace(/^##\s+(.+)$/m, (match, p1) => {
        return `## ${p1}\n<div style="font-size: ${slide.fontSize};">`;
      });
      // Add closing div at the end
      slideMarkdown += '\n</div>';
    }

    // Ensure slide ends with newline (but not double newline)
    if (!slideMarkdown.endsWith('\n')) {
      slideMarkdown += '\n';
    }

    parts.push(slideMarkdown);
  });

  // Join with empty string to avoid double newlines
  // Each part already has proper newline handling
  return parts.join('');
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

async function generateSlidevMarkdown(inputPath, outputPath, options = {}) {
  // Resolve paths relative to project root
  const scriptDir = __dirname;
  const baseDir = path.dirname(path.dirname(path.dirname(scriptDir)));

  let resolvedInputPath;
  if (path.isAbsolute(inputPath)) {
    resolvedInputPath = inputPath;
  } else {
    resolvedInputPath = path.resolve(baseDir, inputPath);
  }

  let resolvedOutputPath;
  if (outputPath) {
    if (path.isAbsolute(outputPath)) {
      resolvedOutputPath = outputPath;
    } else {
      resolvedOutputPath = path.resolve(baseDir, outputPath);
    }
  }

  console.log(`📖 Reading: ${resolvedInputPath}`);

  const markdown = fs.readFileSync(resolvedInputPath, 'utf-8');

  console.log(`🔄 Processing slides...`);

  const processor = new SlideProcessor(options);
  const slides = await processor.process(markdown);

  console.log(`✅ Generated ${slides.length} slides`);
  console.log(`📝 Slide titles:`);
  slides.forEach((slide, index) => {
    const title = slide.title || '(untitled)';
    const preview = title.length > 40 ? title.substring(0, 40) + '...' : title;
    console.log(`   ${index + 1}. ${preview}`);
  });

  const frontmatter = generateFrontmatter();
  const slidevMarkdown = frontmatter + compileSlidesToMarkdown(slides);

  if (resolvedOutputPath) {
    fs.writeFileSync(resolvedOutputPath, slidevMarkdown, 'utf-8');
    console.log(`💾 Saved: ${resolvedOutputPath}`);
  }

  return slidevMarkdown;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Slidev Markdown Generator v2.0.0

Usage:
  node slidev-generator.js <input.md> [output.md]

Arguments:
  input.md   Path to source markdown file
  output.md  Path to output Slidev markdown (optional, defaults to stdout)

Features:
  - Removes existing --- separators
  - Smart slide splitting based on H1 and H2 headings
  - Detects major sections automatically
  - Preserves code blocks

Example:
  node slidev-generator.js "陈乐宁技术洞察/异构编程技术洞察.md" "陈乐宁技术洞察/slidev-deck.md"
    `);
    process.exit(0);
  }

  const inputPath = args[0];
  const outputPath = args[1] || null;

  generateSlidevMarkdown(inputPath, outputPath);
}

module.exports = { generateSlidevMarkdown };

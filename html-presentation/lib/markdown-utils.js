/**
 * Markdown Utilities
 * Markdown 解析和构建工具
 */

const fs = require('fs');

// ============================================================================
// MARKDOWN PARSER
// ============================================================================

class MarkdownParser {
  /**
   * 解析 Markdown 内容
   * @param {string} content - 原始 Markdown 内容
   * @returns {Object} 解析结果
   */
  static parse(content) {
    const lines = content.split('\n');
    const result = {
      frontmatter: null,
      slides: [],
      info: {
        totalLines: lines.length,
        codeBlocks: [],
        headings: [],
        tables: [],
        images: []
      }
    };

    let currentSlide = null;
    let inCodeBlock = false;
    let codeBlockInfo = null;
    let codeBlockLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 检测代码块开始
      if (!inCodeBlock && line.trim().startsWith('```')) {
        const language = line.trim().substring(3).trim() || 'text';
        inCodeBlock = true;
        codeBlockInfo = {
          language,
          startLine: lineNum,
          code: ''
        };
        codeBlockLines = [];
        continue;
      }

      // 检测代码块结束
      if (inCodeBlock && line.trim().startsWith('```')) {
        inCodeBlock = false;
        codeBlockInfo.endLine = lineNum;
        codeBlockInfo.code = codeBlockLines.join('\n');
        result.info.codeBlocks.push(codeBlockInfo);

        if (currentSlide) {
          currentSlide.content.push(line);
        }
        codeBlockInfo = null;
        codeBlockLines = [];
        continue;
      }

      // 在代码块中
      if (inCodeBlock) {
        codeBlockLines.push(line);
        if (currentSlide) {
          currentSlide.content.push(line);
        }
        continue;
      }

      // 检测幻灯片分隔符
      if (line.trim() === '---') {
        if (currentSlide) {
          currentSlide.endLine = lineNum;
          result.slides.push(currentSlide);
        }
        currentSlide = {
          lineNumber: lineNum + 1,
          content: [],
          type: 'content'
        };
        continue;
      }

      // 检测 Frontmatter
      if (lineNum === 1 && line.trim() === '---') {
        let frontmatterLines = [];
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '---') {
          frontmatterLines.push(lines[j]);
          j++;
        }
        if (j < lines.length) {
          result.frontmatter = this.parseFrontmatter(frontmatterLines.join('\n'));
          i = j;
          continue;
        }
      }

      // 检测标题
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        result.info.headings.push({
          level,
          text,
          line: lineNum
        });
      }

      // 检测图片
      const imageMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/);
      if (imageMatch) {
        result.info.images.push({
          alt: imageMatch[1],
          url: imageMatch[2],
          line: lineNum
        });
      }

      // 检测表格（简化版）
      if (line.includes('|') && line.trim().startsWith('|')) {
        result.info.tables.push({
          line: lineNum,
          content: line
        });
      }

      // 添加到当前幻灯片
      if (!currentSlide) {
        currentSlide = {
          lineNumber: lineNum,
          content: [],
          type: 'content'
        };
      }
      currentSlide.content.push(line);
    }

    // 添加最后一张幻灯片
    if (currentSlide && currentSlide.content.length > 0) {
      currentSlide.endLine = lines.length;
      result.slides.push(currentSlide);
    }

    return result;
  }

  /**
   * 解析 Frontmatter
   */
  static parseFrontmatter(text) {
    const frontmatter = {};
    const lines = text.split('\n');

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();

        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        frontmatter[key] = value;
      }
    }

    return frontmatter;
  }

  /**
   * 提取所有代码块
   */
  static extractCodeBlocks(content) {
    const parsed = this.parse(content);
    return parsed.info.codeBlocks;
  }

  /**
   * 提取所有标题
   */
  static extractHeadings(content) {
    const parsed = this.parse(content);
    return parsed.info.headings;
  }

  /**
   * 按幻灯片分割内容
   */
  static splitSlides(content) {
    const parsed = this.parse(content);
    return parsed.slides.map(slide => ({
      start: slide.lineNumber,
      end: slide.endLine,
      content: slide.content.join('\n')
    }));
  }
}

// ============================================================================
// MARKDOWN BUILDER
// ============================================================================

class MarkdownBuilder {
  constructor() {
    this.lines = [];
  }

  /**
   * 添加 Frontmatter
   */
  frontmatter(data) {
    this.lines.push('---');
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        this.lines.push(`${key}: "${value}"`);
      } else {
        this.lines.push(`${key}: ${JSON.stringify(value)}`);
      }
    }
    this.lines.push('---');
    this.lines.push('');
    return this;
  }

  /**
   * 添加原始内容
   */
  raw(text) {
    this.lines.push(text);
    return this;
  }

  /**
   * 添加标题
   */
  heading(text, level = 2) {
    const hashes = '#'.repeat(level);
    this.lines.push(`${hashes} ${text}`);
    this.lines.push('');
    return this;
  }

  /**
   * 添加段落
   */
  paragraph(text) {
    this.lines.push(text);
    this.lines.push('');
    return this;
  }

  /**
   * 添加列表项
   */
  item(text, level = 0) {
    const indent = '  '.repeat(level);
    this.lines.push(`${indent}- ${text}`);
    return this;
  }

  /**
   * 添加代码块
   */
  codeBlock(code, language = 'text', highlights = []) {
    const highlightStr = highlights.length > 0 ? ` {${highlights.join(',')}}` : '';
    this.lines.push(`\`\`\`${language}${highlightStr}`);
    this.lines.push(code);
    this.lines.push('```');
    this.lines.push('');
    return this;
  }

  /**
   * 添加图片
   */
  image(url, alt = '') {
    this.lines.push(`![${alt}](${url})`);
    this.lines.push('');
    return this;
  }

  /**
   * 添加表格
   */
  table(headers, rows) {
    this.lines.push('| ' + headers.join(' | ') + ' |');
    this.lines.push('| ' + headers.map(() => '---').join(' | ') + ' |');
    for (const row of rows) {
      this.lines.push('| ' + row.join(' | ') + ' |');
    }
    this.lines.push('');
    return this;
  }

  /**
   * 添加分隔符
   */
  separator() {
    this.lines.push('---');
    this.lines.push('');
    return this;
  }

  /**
   * 添加注释
   */
  comment(text) {
    this.lines.push(`<!-- ${text} -->`);
    return this;
  }

  /**
   * 构建最终 Markdown
   */
  build() {
    return this.lines.join('\n');
  }

  /**
   * 清空构建器
   */
  clear() {
    this.lines = [];
    return this;
  }
}

// ============================================================================
// CONTENT ANALYZER
// ============================================================================

class ContentAnalyzer {
  /**
   * 分析内容类型
   */
  static analyzeContentType(content) {
    const types = {
      code: 0,
      list: 0,
      table: 0,
      image: 0,
      heading: 0
    };

    const lines = content.split('\n');

    for (const line of lines) {
      if (line.trim().startsWith('```')) types.code++;
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) types.list++;
      if (line.includes('|') && line.trim().startsWith('|')) types.table++;
      if (line.match(/!\[([^\]]*)\]\(([^)]+)\)/)) types.image++;
      if (line.match(/^#{1,6}\s/)) types.heading++;
    }

    // 找出最多的类型
    let maxType = 'text';
    let maxCount = 0;

    for (const [type, count] of Object.entries(types)) {
      if (count > maxCount) {
        maxCount = count;
        maxType = type;
      }
    }

    return maxType;
  }

  /**
   * 计算内容指标
   */
  static calculateMetrics(content) {
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(w => w.length > 0);

    return {
      lineCount: lines.length,
      wordCount: words.length,
      charCount: content.length,
      avgWordsPerLine: words.length / Math.max(lines.length, 1),
      density: words.length / Math.max(content.length, 1)
    };
  }

  /**
   * 评估内容重要性
   */
  static assessImportance(content, context = {}) {
    let score = 0.5; // 基础分数

    // 包含代码块
    if (content.includes('```')) {
      score += 0.2;
    }

    // 包含关键词
    const keywords = ['重要', '核心', '关键', '必须', '应该', '注意', '警告'];
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        score += 0.05;
      }
    }

    // 包含标题
    if (content.match(/^#{1,6}\s/m)) {
      score += 0.1;
    }

    // 根据位置调整
    if (context.position === 'first') {
      score += 0.2; // 第一张幻灯片通常重要
    } else if (context.position === 'last') {
      score += 0.1; // 最后一张幻灯片（总结）
    }

    return Math.min(score, 1.0);
  }

  /**
   * 检测内容结构
   */
  static detectStructure(content) {
    const parsed = MarkdownParser.parse(content);
    const structure = [];

    for (const slide of parsed.slides) {
      const slideContent = slide.content.join('\n');
      const headingMatch = slideContent.match(/^#{1,6}\s+(.+)$/m);
      const title = headingMatch ? headingMatch[1].trim() : 'Untitled';
      const type = this.analyzeContentType(slideContent);

      structure.push({
        title,
        type,
        startLine: slide.lineNumber,
        endLine: slide.endLine,
        metrics: this.calculateMetrics(slideContent)
      });
    }

    return structure;
  }

  /**
   * 生成内容摘要
   */
  static summarize(content, maxLength = 200) {
    // 移除代码块
    let summary = content.replace(/```[\s\S]*?```/g, '[代码块]');

    // 移除 Markdown 格式
    summary = summary
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    // 截断
    if (summary.length > maxLength) {
      summary = summary.substring(0, maxLength - 3) + '...';
    }

    return summary;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  MarkdownParser,
  MarkdownBuilder,
  ContentAnalyzer
};

/**
 * Code Enhancer - 代码块增强工具
 * 为代码块添加注释、高亮建议、分步展示等功能
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CODE COMMENT STYLES
// ============================================================================

const COMMENT_STYLES = {
  python: {
    line: '#',
    blockStart: '"""',
    blockEnd: '"""',
    docstring: '"""',
  },
  javascript: {
    line: '//',
    blockStart: '/*',
    blockEnd: '*/',
    docstring: '/**',
  },
  typescript: {
    line: '//',
    blockStart: '/*',
    blockEnd: '*/',
    docstring: '/**',
  },
  java: {
    line: '//',
    blockStart: '/*',
    blockEnd: '*/',
    docstring: '/**',
  },
  go: {
    line: '//',
    blockStart: '/*',
    blockEnd: '*/',
    docstring: '/**',
  },
  bash: {
    line: '#',
    blockStart: null,
    blockEnd: null,
    docstring: null,
  },
  shell: {
    line: '#',
    blockStart: null,
    blockEnd: null,
    docstring: null,
  },
  yaml: {
    line: '#',
    blockStart: null,
    blockEnd: null,
    docstring: null,
  },
};

// ============================================================================
// CODE ENHANCER CLASS
// ============================================================================

class CodeEnhancer {
  constructor(language) {
    this.language = language.toLowerCase();
    this.style = this.getCommentStyle();
  }

  /**
   * 获取注释风格
   */
  getCommentStyle() {
    // 语言别名映射
    const aliases = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      sh: 'shell',
    };

    const lang = aliases[this.language] || this.language;
    return COMMENT_STYLES[lang] || COMMENT_STYLES.javascript;
  }

  /**
   * 添加行注释
   * @param {string} code - 代码内容
   * @param {string} comment - 注释内容
   * @returns {string} 带注释的代码
   */
  addLineComment(code, comment) {
    const { line } = this.style;
    return `${line} ${comment}\n${code}`;
  }

  /**
   * 在代码块前添加说明
   */
  addDescription(code, description) {
    const { line } = this.style;
    return `${line} ${description}\n\n${code}`;
  }

  /**
   * 生成带注释的代码
   * @param {string} code - 原始代码
   * @param {Array<Object>} comments - 注释数组 [{line: 1, text: "注释"}]
   * @returns {string} 带注释的代码
   */
  addComments(code, comments) {
    const lines = code.split('\n');
    const { line } = this.style;

    // 创建注释映射
    const commentMap = new Map();
    comments.forEach(c => {
      commentMap.set(c.line, c.text);
    });

    // 添加注释
    const result = lines.map((original, index) => {
      const lineNum = index + 1;
      if (commentMap.has(lineNum)) {
        const comment = commentMap.get(lineNum);
        // 如果原行已有内容，保留缩进
        const indent = original.match(/^(\s*)/)[1];
        return `${indent}${line} ${comment}\n${original}`;
      }
      return original;
    });

    return result.join('\n');
  }

  /**
   * 建议需要高亮的行
   * @param {string} code - 代码内容
   * @returns {Array<number>} 需要高亮的行号
   */
  suggestHighlightLines(code) {
    const lines = code.split('\n');
    const highlights = [];

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();

      // 高亮函数/类定义
      if (this.matchFunctionDefinition(trimmed)) {
        highlights.push(lineNum);
      }

      // 高亮返回语句
      if (this.matchReturnStatement(trimmed)) {
        highlights.push(lineNum);
      }

      // 高亮控制流语句
      if (this.matchControlFlow(trimmed)) {
        highlights.push(lineNum);
      }

      // 高亮重要的赋值
      if (this.matchImportantAssignment(trimmed)) {
        highlights.push(lineNum);
      }
    });

    return highlights;
  }

  /**
   * 匹配函数/类定义
   */
  matchFunctionDefinition(line) {
    const patterns = [
      /^function\s+\w+/,
      /^const\s+\w+\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>)/,
      /^class\s+\w+/,
      /^def\s+\w+\s*\(/,
      /^interface\s+\w+/,
      /^type\s+\w+\s*=/,
    ];

    return patterns.some(p => p.test(line));
  }

  /**
   * 匹配返回语句
   */
  matchReturnStatement(line) {
    return /^return\b/.test(line);
  }

  /**
   * 匹配控制流语句
   */
  matchControlFlow(line) {
    const patterns = [
      /^if\s*\(/,
      /^else\s*(?:if\s*)?{/,
      /^for\s*\(/,
      /^while\s*\(/,
      /^do\s*{/,
      /^switch\s*\(/,
      /^case\s+/,
      /^try\s*{/,
      /^catch\s*\(/,
      /^finally\s*{/,
    ];

    return patterns.some(p => p.test(line));
  }

  /**
   * 匹配重要赋值
   */
  matchImportantAssignment(line) {
    const patterns = [
      /\bconst\s+\w+\s*=\s*require/,
      /\bconst\s+\w+\s*=\s*import/,
      /\bexport\s+(?:default\s+)?/,
      /\bclass\s+\w+\s*=/,
    ];

    return patterns.some(p => p.test(line));
  }

  /**
   * 生成分步展示代码
   * @param {string} code - 完整代码
   * @param {Array<Array<number>>} steps - 每步包含的行号
   * @returns {Array<string>} 分步代码数组
   */
  generateSteps(code, steps) {
    const lines = code.split('\n');
    const result = [];

    steps.forEach((stepLines, index) => {
      const stepCode = stepLines.map(n => lines[n - 1]).join('\n');
      result.push({
        step: index + 1,
        code: stepCode,
        description: `步骤 ${index + 1}`
      });
    });

    return result;
  }

  /**
   * 自动检测代码步骤
   * @param {string} code - 代码内容
   * @returns {Array<Array<number>>} 检测到的步骤
   */
  detectSteps(code) {
    const lines = code.split('\n');
    const steps = [];
    let currentStep = [];
    let emptyLineCount = 0;

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // 空行计数
      if (!trimmed) {
        emptyLineCount++;
        if (emptyLineCount >= 2 && currentStep.length > 0) {
          steps.push([...currentStep]);
          currentStep = [];
          emptyLineCount = 0;
        }
        return;
      }

      // 注释可能表示新步骤
      if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
        const comment = trimmed.replace(/^[/#]\s*/, '');
        if (comment.match(/步骤|step|阶段|phase/i)) {
          if (currentStep.length > 0) {
            steps.push([...currentStep]);
            currentStep = [];
          }
        }
      }

      currentStep.push(index + 1);
    });

    // 添加最后一步
    if (currentStep.length > 0) {
      steps.push(currentStep);
    }

    return steps;
  }

  /**
   * 为代码添加语法高亮标记
   * @param {string} code - 代码内容
   * @param {Array<number>} highlights - 需要高亮的行
   * @returns {Object} 包含标记信息的对象
   */
  addHighlightMarkers(code, highlights) {
    const lines = code.split('\n');
    const highlightSet = new Set(highlights);

    const result = lines.map((line, index) => {
      const lineNum = index + 1;
      return {
        line,
        highlight: highlightSet.has(lineNum),
        number: lineNum
      };
    });

    return {
      original: code,
      lines: result,
      highlights: highlightSet
    };
  }

  /**
   * 生成 Slidev 代码块
   * @param {string} code - 代码内容
   * @param {Array<number>} highlights - 高亮行
   * @param {string} language - 编程语言
   * @returns {string} Slidev 格式的代码块
   */
  generateSlidevCodeBlock(code, highlights, language) {
    // {1-3, 7-9} 格式指定高亮行
    const highlightRanges = this.mergeLineRanges(highlights);
    const highlightAttr = highlightRanges.length > 0 ? ` {${highlightRanges}}` : '';

    return `\`\`\`${language}${highlightAttr}\n${code}\n\`\`\``;
  }

  /**
   * 合并行号范围
   */
  mergeLineRanges(lines) {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(`${start}-${end}`);
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push(`${start}-${end}`);

    return ranges;
  }

  /**
   * 提取代码摘要
   * @param {string} code - 代码内容
   * @returns {string} 代码摘要
   */
  summarizeCode(code) {
    const lines = code.split('\n');
    const summary = [];

    // 提取函数/类定义
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const patterns = [
        { regex: /^(?:async\s+)?function\s+(\w+)/, template: '函数: $1' },
        { regex: /^const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*)?=>/, template: '箭头函数: $1' },
        { regex: /^class\s+(\w+)/, template: '类: $1' },
        { regex: /^def\s+(\w+)/, template: '函数: $1' },
        { regex: /^interface\s+(\w+)/, template: '接口: $1' },
        { regex: /^type\s+(\w+)\s*=/, template: '类型: $1' },
      ];

      for (const { regex, template } of patterns) {
        const match = trimmed.match(regex);
        if (match) {
          summary.push(template.replace('$1', match[1]));
          break;
        }
      }
    });

    return summary.length > 0 ? summary.join(', ') : '代码块';
  }

  /**
   * 检测代码复杂度
   * @param {string} code - 代码内容
   * @returns {Object} 复杂度信息
   */
  analyzeComplexity(code) {
    const lines = code.split('\n');
    const info = {
      totalLines: lines.length,
      emptyLines: 0,
      commentLines: 0,
      codeLines: 0,
      maxIndent: 0,
      hasLoops: false,
      hasConditionals: false,
      complexity: 'low'
    };

    lines.forEach(line => {
      const trimmed = line.trim();

      if (!trimmed) {
        info.emptyLines++;
      } else if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        info.commentLines++;
      } else {
        info.codeLines++;
      }

      // 检测循环
      if (/\b(for|while|do)\b/.test(line)) {
        info.hasLoops = true;
      }

      // 检测条件
      if (/\b(if|else|case|switch)\b/.test(line)) {
        info.hasConditionals = true;
      }

      // 计算缩进
      const indent = line.match(/^(\s*)/)[0].length;
      info.maxIndent = Math.max(info.maxIndent, indent);
    });

    // 计算复杂度
    if (info.codeLines > 20 || info.hasLoops || info.hasConditionals) {
      info.complexity = 'medium';
    }
    if (info.codeLines > 50 || (info.hasLoops && info.hasConditionals)) {
      info.complexity = 'high';
    }

    return info;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * 创建代码增强器
 */
function createEnhancer(language) {
  return new CodeEnhancer(language);
}

/**
 * 快捷函数：增强代码块
 */
function enhanceCode(code, language, options = {}) {
  const enhancer = new CodeEnhancer(language);
  const result = {
    original: code,
    language,
    comments: options.comments || [],
    highlights: options.highlights || enhancer.suggestHighlightLines(code),
    summary: enhancer.summarizeCode(code),
    complexity: enhancer.analyzeComplexity(code),
  };

  // 添加注释
  if (options.addComments && options.comments.length > 0) {
    result.codeWithComments = enhancer.addComments(code, options.comments);
  }

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CodeEnhancer,
  createEnhancer,
  enhanceCode,
  COMMENT_STYLES,
};

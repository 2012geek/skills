/**
 * TOC Optimizer - LLM-powered Table of Contents layout optimizer
 * 智能分析目录结构并决定最佳布局策略
 */

const fs = require('fs');
const path = require('path');
const { LLMOptimizer } = require('./llm-optimizer.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  model: process.env.CLAUDE_MODEL || 'GLM-4.7',
  maxTokens: 2000,
  temperature: 0.3,
};

// ============================================================================
// TOC ANALYZER
// ============================================================================

/**
 * 分析 TOC 结构和指标
 */
class TOCAnalyzer {
  /**
   * 分析 TOC 内容
   * @param {string} tocContent - TOC markdown 内容
   * @returns {Object} 分析结果
   */
  analyze(tocContent) {
    const lines = tocContent.split('\n');
    const items = [];
    const mainSections = [];
    const subSections = [];

    let inMainSection = false;
    let currentMainSection = null;

    for (const line of lines) {
      // 匹配列表项
      const listMatch = line.match(/^\s*[-*]\s+\[(.+)\]\(#.+\)/);
      if (!listMatch) continue;

      const title = listMatch[1];
      const indent = line.match(/^(\s*)/)[1].length;
      const isSubItem = indent >= 2;

      items.push({ title, indent, isSubItem });

      if (isSubItem) {
        subSections.push(title);
      } else {
        mainSections.push(title);
        currentMainSection = title;
      }
    }

    // 计算平均项长度
    const avgItemLength = items.reduce((sum, item) => sum + item.title.length, 0) / Math.max(items.length, 1);

    // 检测是否有中文数字章节（一、二、三、等）
    const hasChineseNumbers = tocContent.match(/[一二三四五六七八九十]+、/);

    return {
      totalItems: items.length,
      mainSectionCount: mainSections.length,
      subSectionCount: subSections.length,
      hasSubsections: subSections.length > 0,
      avgItemLength: Math.round(avgItemLength),
      maxItemLength: Math.max(...items.map(i => i.title.length)),
      hasChineseNumbers: !!hasChineseNumbers,
      content: tocContent,
      items
    };
  }

  /**
   * 判断是否为 TOC 幻灯片
   * @param {string} content - 幻灯片内容
   * @returns {boolean}
   */
  isTOCSlide(content) {
    if (typeof content !== 'string') return false;
    // Match ## 目录 at the start of a line (after optional whitespace)
    return !!content.match(/^\s*##\s*目录|^##\s*目录表|^##\s*Table of Contents|^##\s*TOC/m);
  }
}

// ============================================================================
// TOC LLM DECIDER
// ============================================================================

/**
 * 使用 LLM 决定 TOC 布局策略
 */
class TOCLLMMDecider extends LLMOptimizer {
  constructor(options = {}) {
    super({ ...CONFIG, ...options });
  }

  /**
   * 决定 TOC 布局策略
   * @param {Object} analysis - TOC 分析结果
   * @returns {Promise<Object>} 决策对象
   */
  async decideLayout(analysis) {
    // 检查缓存
    const cacheKey = `toc-layout-${JSON.stringify(analysis)}`;
    const cached = this.memoryCache.get(cacheKey);
    if (cached) {
      console.log('💾 Using cached TOC layout decision');
      return cached;
    }

    try {
      const prompt = this.buildDecisionPrompt(analysis);
      const result = await this.callLLM(prompt, 'toc-layout');

      // 缓存结果
      this.memoryCache.set(cacheKey, result);

      return result;
    } catch (error) {
      // Handle LLM errors with fallback
      console.warn(`⚠️  LLM decision failed: ${error.message}`);
      console.warn(`   Using fallback strategy based on content analysis...`);

      // Generate fallback strategy based on analysis
      return this.getFallbackStrategyFromAnalysis(analysis);
    }
  }

  /**
   * 基于分析结果生成回退策略
   * @param {Object} analysis - TOC 分析结果
   * @returns {Object} 决策对象
   */
  getFallbackStrategyFromAnalysis(analysis) {
    const { totalItems, mainSectionCount, subSectionCount, avgItemLength } = analysis;

    // Simple rule-based fallback
    if (totalItems <= 8) {
      return {
        strategy: 'two-column',
        reasoning: `Fallback: Short TOC with ${totalItems} items`,
        config: { columns: 2, fontSize: '1em', lineHeight: '1.3' }
      };
    } else if (totalItems <= 20) {
      return {
        strategy: 'two-column-compact',
        reasoning: `Fallback: Medium TOC with ${totalItems} items`,
        config: { columns: 2, fontSize: '0.95em', lineHeight: '1.2' }
      };
    } else {
      return {
        strategy: 'two-column-compact',
        reasoning: `Fallback: Long TOC with ${totalItems} items, using compact layout`,
        config: { columns: 2, fontSize: '0.9em', lineHeight: '1.15', maxItemsPerColumn: 15 },
        splits: []
      };
    }
  }

  /**
   * 构建决策提示词
   * @param {Object} analysis - TOC 分析结果
   * @returns {string}
   */
  buildDecisionPrompt(analysis) {
    return `You are a presentation layout expert. Analyze this Table of Contents and recommend the best layout strategy.

TOC Analysis:
- Total items: ${analysis.totalItems}
- Main sections: ${analysis.mainSectionCount}
- Subsections: ${analysis.subSectionCount}
- Has subsections: ${analysis.hasSubsections}
- Average item length: ${analysis.avgItemLength} characters
- Max item length: ${analysis.maxItemLength} characters
- Has Chinese numbering: ${analysis.hasChineseNumbers}

Available strategies:
1. "single-column" - Standard vertical list (use for very short TOCs, < 8 items)
2. "two-column" - Split into two columns (good for medium TOCs, 8-15 items)
3. "two-column-compact" - Two columns with smaller font and tighter spacing (for longer TOCs, 15-25 items)
4. "multi-slide" - Split into multiple slides (for very long TOCs, > 25 items)
5. "main-sections-only" - Show only main sections, omit subsections (for very long/complex TOCs)

Recommendations:
- If TOC has many subsections (15+), consider "two-column-compact" or "multi-slide"
- If items are very long (avg > 30 chars), use fewer items per column
- If there are 7-8 main sections with 2-3 subsections each, "two-column-compact" is ideal
- Prioritize readability over fitting everything on one slide
- For Chinese content, maintain good character spacing

Return your decision as JSON:
{
  "strategy": "two-column-compact",
  "reasoning": "Brief explanation of why this strategy is best",
  "config": {
    "fontSize": "0.95em",
    "columns": 2,
    "maxItemsPerColumn": 12,
    "lineHeight": "1.2"
  },
  "splits": []
}

For multi-slide strategy, include splits:
{
  "strategy": "multi-slide",
  "reasoning": "...",
  "splits": [
    { "slide": 1, "fromSection": 0, "toSection": 3, "title": "目录 (1/2)" },
    { "slide": 2, "fromSection": 4, "toSection": 6, "title": "目录 (2/2)" }
  ]
}`;
  }

  /**
   * 解析 LLM 响应
   * @param {string} response - 原始响应
   * @returns {Object} 决策对象
   */
  parseDecision(response) {
    // Handle null/undefined response
    if (!response) {
      console.log('⚠️  LLM returned null response, using default strategy');
      return this.getDefaultStrategy('');
    }

    // Handle object response (from parent parseResponse)
    if (typeof response === 'object') {
      if (response.strategy) {
        // Already parsed correctly
        return response;
      }
      if (response.text) {
        // Extract text from object and re-parse
        response = response.text;
      } else {
        console.log('⚠️  LLM returned invalid object response, using default strategy');
        return this.getDefaultStrategy('');
      }
    }

    // Handle string response
    if (typeof response !== 'string') {
      console.log('⚠️  LLM returned invalid response type:', typeof response);
      return this.getDefaultStrategy('');
    }

    // 提取 JSON from markdown code blocks
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.log('⚠️  Failed to parse JSON from code block:', e.message);
      }
    }

    // 尝试直接解析
    try {
      return JSON.parse(response);
    } catch (e) {
      console.log('⚠️  Failed to parse as direct JSON:', e.message);
      // 返回默认策略
      return this.getDefaultStrategy(response);
    }
  }

  /**
   * 获取默认策略（回退）
   * @param {string} response - 响应内容（用于分析）
   * @returns {Object} 默认策略
   */
  getDefaultStrategy(response) {
    console.log('⚠️  LLM response parsing failed, using default strategy');

    return {
      strategy: 'two-column-compact',
      reasoning: 'Default fallback due to parsing error',
      config: {
        fontSize: '0.95em',
        columns: 2,
        maxItemsPerColumn: 12,
        lineHeight: '1.2'
      },
      splits: []
    };
  }

  /**
   * 调用 LLM（重写以使用正确的响应解析）
   */
  async callLLM(prompt, taskType) {
    const result = await super.callLLM(prompt, taskType);
    return this.parseDecision(result);
  }
}

// ============================================================================
// TOC GENERATOR
// ============================================================================

/**
 * 根据策略生成 TOC markdown
 */
class TOCGenerator {
  /**
   * 应用策略生成 TOC
   * @param {string} content - 原始 TOC 内容
   * @param {Object} decision - LLM 决策
   * @returns {string} 优化后的 markdown
   */
  applyStrategy(content, decision) {
    switch (decision.strategy) {
      case 'single-column':
        return this.generateSingleColumn(content, decision.config);

      case 'two-column':
        return this.generateTwoColumn(content, decision.config);

      case 'two-column-compact':
        return this.generateCompactTwoColumn(content, decision.config);

      case 'multi-slide':
        return this.generateMultiSlide(content, decision);

      case 'main-sections-only':
        return this.generateMainSectionsOnly(content, decision.config);

      default:
        return this.generateCompactTwoColumn(content, decision.config);
    }
  }

  /**
   * 生成单列布局
   */
  generateSingleColumn(content, config) {
    return content;
  }

  /**
   * 生成双列布局
   */
  generateTwoColumn(content, config) {
    const items = this.extractListItemsWithIndent(content);

    // Find the best split point at a main section boundary
    const mid = Math.ceil(items.length / 2);
    let splitIdx = mid;

    // Look for a main section (no indent) near the midpoint
    for (let i = mid; i < items.length && i < mid + 5; i++) {
      if (items[i].indent === 0) {
        splitIdx = i;
        break;
      }
    }

    // Also look before the midpoint
    if (splitIdx === mid) {
      for (let i = mid - 1; i >= mid - 5 && i >= 0; i--) {
        if (items[i].indent === 0) {
          splitIdx = i;
          break;
        }
      }
    }

    const left = items.slice(0, splitIdx).map(i => i.line);
    const right = items.slice(splitIdx).map(i => i.line);

    return `---
layout: two-cols
---

## 目录

${left.join('\n')}

<template v-slot:right>

${right.join('\n')}

</template>
`;
  }

  /**
   * 生成紧凑双列布局
   */
  generateCompactTwoColumn(content, config) {
    const items = this.extractListItemsWithIndent(content);

    // Find the best split point at a main section boundary
    const mid = Math.ceil(items.length / 2);
    let splitIdx = mid;

    // Look for a main section (no indent) near the midpoint
    for (let i = mid; i < items.length && i < mid + 5; i++) {
      if (items[i].indent === 0) {
        splitIdx = i;
        break;
      }
    }

    // Also look before the midpoint
    if (splitIdx === mid) {
      for (let i = mid - 1; i >= mid - 5 && i >= 0; i--) {
        if (items[i].indent === 0) {
          splitIdx = i;
          break;
        }
      }
    }

    const left = items.slice(0, splitIdx).map(i => i.line);
    const right = items.slice(splitIdx).map(i => i.line);

    // For compact, just use the same as two-column - styling will be handled by CSS
    return `---
layout: two-cols
---

## 目录

${left.join('\n')}

<template v-slot:right>

${right.join('\n')}

</template>
`;
  }

  /**
   * 生成多幻灯片布局（返回数组）
   */
  generateMultiSlide(content, decision) {
    const items = this.extractListItems(content);
    const splits = decision.splits || this.calculateSplits(items, decision.config);

    const slides = [];
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const slideItems = items.slice(split.fromSection, split.toSection + 1);
      const title = split.title || `目录 (${i + 1}/${splits.length})`;

      // 对于多幻灯片，使用双列布局
      const mid = Math.ceil(slideItems.length / 2);
      const left = slideItems.slice(0, mid);
      const right = slideItems.slice(mid);

      const slideContent = `---
layout: two-cols
---

## ${title}

${left.join('\n')}

<template v-slot:right>

${right.join('\n')}

</template>
`;

      slides.push(slideContent);
    }

    return slides;
  }

  /**
   * 生成仅主章节布局
   */
  generateMainSectionsOnly(content, config) {
    const lines = content.split('\n');
    const mainItems = lines.filter(line => {
      const match = line.match(/^\s*[-*]\s+\[/);
      if (!match) return false;
      // 检查是否为子项（缩进）
      return !line.match(/^\s{2,}[-*]/);
    });

    return `## 目录\n\n${mainItems.join('\n')}`;
  }

  /**
   * 提取列表项
   */
  extractListItems(content) {
    const lines = content.split('\n');
    return lines.filter(line => line.match(/^\s*[-*]\s+\[/));
  }

  /**
   * 提取列表项及缩进信息
   */
  extractListItemsWithIndent(content) {
    const lines = content.split('\n');
    const items = [];

    for (const line of lines) {
      const match = line.match(/^(\s*)[-*]\s+\[/);
      if (match) {
        items.push({
          line: line,
          indent: match[1].length
        });
      }
    }

    return items;
  }

  /**
   * 计算分割点
   */
  calculateSplits(items, config) {
    const maxPerSlide = config.maxItemsPerSlide || 12;
    const slides = [];
    let currentIdx = 0;

    while (currentIdx < items.length) {
      const endIdx = Math.min(currentIdx + maxPerSlide, items.length);
      slides.push({
        fromSection: currentIdx,
        toSection: endIdx - 1,
        title: `目录 (${slides.length + 1})`
      });
      currentIdx = endIdx;
    }

    return slides;
  }

  /**
   * 检查是否需要多幻灯片
   */
  needsMultipleSlides(content, decision) {
    return decision.strategy === 'multi-slide';
  }
}

// ============================================================================
// MAIN TOC OPTIMIZER
// ============================================================================

/**
 * TOC 优化器主类
 */
class TOCOptimizer {
  constructor(options = {}) {
    this.options = options;
    this.analyzer = new TOCAnalyzer();
    this.decider = new TOCLLMMDecider(options);
    this.generator = new TOCGenerator();
  }

  /**
   * 优化 TOC 幻灯片
   * @param {string} content - 幻灯片内容
   * @returns {Promise<string|string[]>} 优化后的内容（可能返回多个幻灯片）
   */
  async optimize(content) {
    // 检查是否为 TOC 幻灯片
    if (!this.analyzer.isTOCSlide(content)) {
      return content;
    }

    console.log('🔍 Analyzing TOC structure...');

    // 分析 TOC
    const analysis = this.analyzer.analyze(content);
    console.log(`📊 TOC: ${analysis.totalItems} items (${analysis.mainSectionCount} main, ${analysis.subSectionCount} subs)`);

    // LLM 决策
    console.log('🤖 LLM deciding layout strategy...');
    const decision = await this.decider.decideLayout(analysis);
    console.log(`✅ Strategy: ${decision.strategy}`);
    console.log(`   Reasoning: ${decision.reasoning}`);

    // 应用策略
    const result = this.generator.applyStrategy(content, decision);

    return result;
  }

  /**
   * 检查是否为 TOC 幻灯片
   */
  isTOCSlide(content) {
    return this.analyzer.isTOCSlide(content);
  }

  /**
   * 获取默认策略（无 API 密钥时使用）
   */
  getFallbackStrategy(content) {
    const analysis = this.analyzer.analyze(content);

    if (analysis.totalItems <= 8) {
      return {
        strategy: 'two-column',
        reasoning: 'Fallback: short TOC',
        config: { columns: 2, fontSize: '1em' }
      };
    } else if (analysis.totalItems <= 20) {
      return {
        strategy: 'two-column-compact',
        reasoning: 'Fallback: medium TOC',
        config: { columns: 2, fontSize: '0.95em', lineHeight: '1.2' }
      };
    } else {
      return {
        strategy: 'multi-slide',
        reasoning: 'Fallback: long TOC',
        config: { maxItemsPerColumn: 12 },
        splits: this.generator.calculateSplits(
          this.generator.extractListItems(content),
          { maxItemsPerColumn: 12 }
        )
      };
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  TOCOptimizer,
  TOCAnalyzer,
  TOCLLMMDecider,
  TOCGenerator
};

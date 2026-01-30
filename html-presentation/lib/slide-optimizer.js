/**
 * LLM-Powered Slide Optimizer
 * 智能优化所有幻灯片，使用 LLM 决策布局策略
 */

const fs = require('fs');
const path = require('path');
const { LLMOptimizer } = require('./llm-optimizer.js');
const { SlideAnalyzer } = require('./slide-analyzer.js');

/**
 * LLM-powered slide optimizer for ALL slides
 */
class SlideOptimizer extends LLMOptimizer {
  constructor(options = {}) {
    super(options);
    this.analyzer = new SlideAnalyzer();
  }

  /**
   * Optimize all slides with LLM
   * @param {Array} slides - Array of slide objects
   * @returns {Promise<Array>} Optimized slides (may be more than input)
   */
  async optimizeAllSlides(slides) {
    console.log(`🤖 LLM optimizing ${slides.length} slides...`);

    const optimized = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const analysis = this.analyzer.analyzeSlide(slide);

      console.log(`📊 Slide ${i + 1}: ${analysis.slideType} (${analysis.metrics.density} density, ${analysis.metrics.listCount} lists)`);

      // Get LLM decision for this slide
      const decision = await this.getLLMDecision(analysis);

      console.log(`   → Strategy: ${decision.optimization}`);
      console.log(`   → Reasoning: ${decision.reasoning}`);

      // Apply the decision
      const result = await this.applyDecision(slide, analysis, decision);

      if (Array.isArray(result)) {
        // Slide was split into multiple slides
        optimized.push(...result);
        console.log(`   → Split into ${result.length} slides`);
      } else {
        optimized.push(result);
      }
    }

    console.log(`✅ Optimized to ${optimized.length} slides (was ${slides.length})`);
    return optimized;
  }

  /**
   * Get LLM decision for a slide
   */
  async getLLMDecision(analysis) {
    const prompt = this.buildDecisionPrompt(analysis);

    try {
      const result = await this.callLLM(prompt, 'slide-decision');
      return this.parseDecision(result);
    } catch (error) {
      console.warn(`   ⚠️  LLM decision failed: ${error.message}`);
      return this.getFallbackDecision(analysis);
    }
  }

  /**
   * Build prompt for LLM decision
   */
  buildDecisionPrompt(analysis) {
    return `You are a presentation layout expert. Analyze this slide and recommend the best optimization.

Slide Information:
- Title: ${analysis.title}
- Type: ${analysis.slideType}
- Visual Density: ${analysis.metrics.density}
- List Items: ${analysis.metrics.listCount}
- Code Blocks: ${analysis.metrics.codeBlockCount}
- Headings: ${analysis.metrics.headingCount}
- Content Length: ${analysis.metrics.charCount} characters
- Lines: ${analysis.metrics.lineCount}
- Average List Item Length: ${analysis.metrics.avgListLength} characters

Available Optimizations:
1. "keep-as-is" - No changes needed (good for short, simple slides under 1000 chars)
2. "two-column" - Split content into two columns (good for lists with 8-15 items)
3. "two-column-compact" - Two columns with smaller font (good for 15-25 items)
4. "shrink-font" - Reduce font size to 0.85em (good for content-heavy slides)
5. "add-scroll" - Enable scrolling for very long content (keeps one slide)
6. "split-slide" - Split into 2-3 slides (best for very long content > 2500 chars or > 30 items)
7. "main-sections-only" - Show only main sections, hide details (for complex TOCs with many subsections)

Decision Criteria:
- Very high density (>1.5x): prefer "split-slide" or "add-scroll"
- High density (1.0-1.5x): consider "two-column-compact" or "shrink-font"
- List items > 25: use "split-slide" or "two-column-compact"
- List items > 40: MUST use "split-slide"
- Code blocks > 2: use "keep-as-is" or "shrink-font" (don't break code)
- Content > 2500 chars: consider "split-slide"
- Content > 4000 chars: MUST use "split-slide" or "add-scroll"
- TOC with subsections: prefer "two-column-compact" or "main-sections-only"
- Priority: Readability > Single Slide. Multiple short slides better than one crowded slide.

For Chinese content:
- Chinese characters are visually larger, account for this
- Maintain good line spacing for readability
- 1.15-1.2 line-height is comfortable for Chinese text

Return your decision as JSON:
{
  "optimization": "two-column-compact",
  "reasoning": "Brief explanation of why this strategy is best for this specific slide",
  "config": {
    "fontSize": "0.9em",
    "lineHeight": "1.2",
    "layout": "two-cols",
    "maxItemsPerColumn": 12
  },
  "splits": []
}`;
  }

  /**
   * Parse LLM decision
   */
  parseDecision(response) {
    // Handle object response
    if (typeof response === 'object') {
      if (response.optimization) {
        return response;
      }
      if (response.text) {
        response = response.text;
      } else {
        throw new Error('Invalid response object');
      }
    }

    // Handle string response
    if (typeof response !== 'string') {
      throw new Error('Invalid response type');
    }

    // Extract JSON from markdown code blocks
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.log('⚠️  Failed to parse JSON from code block');
      }
    }

    // Try direct JSON parse
    try {
      return JSON.parse(response);
    } catch (e) {
      throw new Error('Failed to parse as JSON');
    }
  }

  /**
   * Get fallback decision when LLM fails
   */
  getFallbackDecision(analysis) {
    const { metrics, slideType } = analysis;

    // Rule-based fallback
    if (slideType === 'toc') {
      if (metrics.listCount > 25) {
        return {
          optimization: 'split-slide',
          reasoning: 'Fallback: TOC has too many items',
          config: {},
          splits: []
        };
      }
      return {
        optimization: 'two-column-compact',
        reasoning: 'Fallback: TOC with moderate items',
        config: { fontSize: '0.85em', lineHeight: '1.15' }
      };
    }

    if (metrics.density === 'very-high' || metrics.charCount > 3000) {
      return {
        optimization: 'split-slide',
        reasoning: 'Fallback: Very high density',
        config: {}
      };
    }

    if (metrics.listCount > 15) {
      return {
        optimization: 'two-column-compact',
        reasoning: 'Fallback: Many list items',
        config: { fontSize: '0.9em', lineHeight: '1.2' }
      };
    }

    if (metrics.density === 'high' || metrics.charCount > 1500) {
      return {
        optimization: 'shrink-font',
        reasoning: 'Fallback: High density',
        config: { fontSize: '0.9em' }
      };
    }

    return {
      optimization: 'keep-as-is',
      reasoning: 'Fallback: Standard slide',
      config: {}
    };
  }

  /**
   * Apply LLM decision to slide
   */
  async applyDecision(slide, analysis, decision) {
    switch (decision.optimization) {
      case 'keep-as-is':
        return slide;

      case 'two-column':
        return this.transformToTwoColumn(slide, analysis, decision.config);

      case 'two-column-compact':
        return this.transformToTwoColumnCompact(slide, analysis, decision.config);

      case 'shrink-font':
        return this.transformWithShrinkFont(slide, decision.config);

      case 'add-scroll':
        return this.transformWithScroll(slide, decision.config);

      case 'split-slide':
        return await this.transformSplitSlide(slide, analysis, decision);

      case 'main-sections-only':
        return this.transformMainSectionsOnly(slide, analysis, decision.config);

      default:
        return slide;
    }
  }

  /**
   * Transform slide to two-column layout
   */
  transformToTwoColumn(slide, analysis, config = {}) {
    const items = this.extractListItems(slide.content);
    if (items.length === 0) return slide;

    const mid = Math.ceil(items.length / 2);
    const left = items.slice(0, mid);
    const right = items.slice(mid);

    return {
      ...slide,
      layout: 'two-cols',
      content: `## ${slide.title}

${left.join('\n')}

<template v-slot:right>

${right.join('\n')}

</template>
`
    };
  }

  /**
   * Transform slide to compact two-column layout
   * NOTE: Cannot use global div wrapper because <template v-slot> must be top-level
   */
  transformToTwoColumnCompact(slide, analysis, config = {}) {
    const items = this.extractListItemsWithIndent(slide.content);
    if (items.length === 0) return slide;

    // Find best split point at main section boundary
    const mid = Math.ceil(items.length / 2);
    let splitIdx = mid;

    for (let i = mid; i < items.length && i < mid + 5; i++) {
      if (items[i].indent === 0) {
        splitIdx = i;
        break;
      }
    }

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

    // Use compact styling - but apply it as inline styles on items, not as a wrapper
    // because <template v-slot> must be a top-level element
    return {
      ...slide,
      layout: 'two-cols',
      content: `## ${slide.title}

<div style="font-size: 0.9em; line-height: 1.2;">

${left.join('\n')}

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

${right.join('\n')}

</div>

</template>
`
    };
  }

  /**
   * Transform with smaller font
   */
  transformWithShrinkFont(slide, config = {}) {
    const fontSize = config.fontSize || '0.85em';

    return {
      ...slide,
      fontSize: fontSize,
      content: `## ${slide.title}

${slide.content}
`
    };
  }

  /**
   * Transform with scroll enabled
   */
  transformWithScroll(slide, config = {}) {
    return {
      ...slide,
      scroll: true,
      content: `## ${slide.title}

${slide.content}
`
    };
  }

  /**
   * Transform by splitting into multiple slides
   * Implements LLM-driven recursive optimization
   */
  async transformSplitSlide(slide, analysis, decision) {
    // For TOC slides, use existing TOC logic
    if (analysis.slideType === 'toc') {
      const { TOCOptimizer } = require('./toc-optimizer.js');
      const tocOptimizer = new TOCOptimizer(this.options);
      const result = await tocOptimizer.optimize(slide.content);
      if (Array.isArray(result)) {
        return result.map((content, idx) => ({
          title: this.extractTitle(content) || `${slide.title} (${idx + 1})`,
          content
        }));
      }
      return { ...slide, content: result };
    }

    // Step 1: Split by headings (H1→H2→H3 fallback)
    const splitSlides = this.splitByHeadings(slide);

    // Step 2: If no split happened, return as-is (shouldn't happen if LLM chose split-slide)
    if (splitSlides.length <= 1) {
      return [slide];
    }

    // Step 3: ✨ LLM-driven recursive optimization for each sub-slide
    const reoptimizedSlides = [];

    for (const subSlide of splitSlides) {
      // Re-analyze the sub-slide
      const subAnalysis = this.analyzer.analyzeSlide(subSlide);

      console.log(`🔄 Re-analyzing sub-slide: "${subSlide.title}"`);
      console.log(`   → ${subAnalysis.metrics.charCount} chars, ${subAnalysis.metrics.listCount} lists`);

      // Get LLM decision for this sub-slide (no thresholds, full LLM control)
      const subDecision = await this.getLLMDecision(subAnalysis);

      console.log(`   → LLM Strategy: ${subDecision.optimization}`);
      console.log(`   → Reasoning: ${subDecision.reasoning}`);

      // Apply the LLM decision
      const subResult = await this.applyDecision(subSlide, subAnalysis, subDecision);

      if (Array.isArray(subResult)) {
        // Sub-slide was split further
        console.log(`   → Split into ${subResult.length} sub-slides`);
        reoptimizedSlides.push(...subResult);
      } else {
        reoptimizedSlides.push(subResult);
      }
    }

    return reoptimizedSlides;
  }

  /**
   * Split slide by specific heading level (helper function)
   */
  splitByHeadingLevel(lines, targetLevel) {
    const slides = [];
    let currentSlide = [];
    let currentTitle = 'Content';
    let contentCount = 0;
    let inCodeBlock = false;
    let targetHeadingCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Track code block state
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        currentSlide.push(line);
        continue;
      }

      // Only process headings outside code blocks
      if (!inCodeBlock) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
          const level = headingMatch[1].length;

          if (level === targetLevel) {
            targetHeadingCount++;

            // First target-level heading becomes the title
            if (targetHeadingCount === 1) {
              currentTitle = headingMatch[2];
            } else if (contentCount > 1) {
              // Split on subsequent target-level headings (need at least some content)
              slides.push({
                title: currentTitle,
                content: currentSlide.join('\n')
              });
              currentSlide = [];
              contentCount = 0;
              currentTitle = headingMatch[2];
            }
          }

          currentSlide.push(line);
          contentCount++;
          continue;
        }
      }

      // Non-heading lines
      currentSlide.push(line);
      if (line.trim()) contentCount++;
    }

    // Don't forget last slide
    if (currentSlide.length > 0) {
      slides.push({
        title: currentTitle,
        content: currentSlide.join('\n')
      });
    }

    // Return slides without adding part numbers to titles
    // This keeps titles clean and consistent
    return slides;
  }

  /**
   * Split slide by headings (respecting code block boundaries)
   */
  splitByHeadings(slide) {
    const lines = slide.content.split('\n');
    const slides = [];
    let currentSlide = [];
    let currentTitle = slide.title;
    let currentHeadingLevel = null;
    let contentCount = 0;
    let inCodeBlock = false;

    // Don't skip any lines - preserve all content including H1
    let startIndex = 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];

      // Track code block state
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        currentSlide.push(line);
        continue;
      }

      // Only process headings outside code blocks
      if (!inCodeBlock) {
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headingMatch) {
          const level = headingMatch[1].length;

          // Initialize heading level on first heading
          if (currentHeadingLevel === null) {
            currentHeadingLevel = level;
            currentTitle = headingMatch[2];
          }

          // Start new slide if:
          // 1. This is a same-level or higher heading as current
          // 2. Current slide has significant content
          if (level <= currentHeadingLevel && contentCount > 5) {
            slides.push({
              title: currentTitle,
              content: currentSlide.join('\n')
            });
            currentSlide = [];
            contentCount = 0;
            currentHeadingLevel = level;
            currentTitle = headingMatch[2];
          }

          currentSlide.push(line);
          contentCount++;
          continue;
        }
      }

      // Non-heading lines
      currentSlide.push(line);
      if (line.trim()) contentCount++;
    }

    // Don't forget last slide
    if (currentSlide.length > 0) {
      slides.push({
        title: currentTitle,
        content: currentSlide.join('\n')
      });
    }

    // If only one slide, try splitting by next heading level (H1→H2→H3→H4→H5→H6)
    if (slides.length <= 1 && currentHeadingLevel !== null) {
      // Try splitting by the next level down
      const nextLevel = currentHeadingLevel + 1;
      console.log(`   → Checking fallback: slides.length=${slides.length}, currentHeadingLevel=${currentHeadingLevel}, nextLevel=${nextLevel}`);

      if (nextLevel <= 6) {
        console.log(`   → Trying to split by H${nextLevel}...`);
        const result = this.splitByHeadingLevel(lines, nextLevel);
        console.log(`   → H${nextLevel} split resulted in ${result.length} slides`);

        // If H3 split still resulted in 1 slide, try H4
        if (result.length <= 1 && nextLevel + 1 <= 6) {
          console.log(`   → H${nextLevel} split failed, trying H${nextLevel + 1}...`);
          const result2 = this.splitByHeadingLevel(lines, nextLevel + 1);
          console.log(`   → H${nextLevel + 1} split resulted in ${result2.length} slides`);
          return result2;
        }

        return result;
      } else {
        console.log(`   → Cannot split: nextLevel (${nextLevel}) > 6`);
      }
    } else {
      console.log(`   → No fallback: slides.length=${slides.length}, currentHeadingLevel=${currentHeadingLevel}`);
    }

    // If still only one slide, return original
    if (slides.length <= 1) {
      return [slide];
    }

    // Add part numbers to titles
    return slides.map((s, idx) => ({
      ...s,
      title: slides.length > 1 ? `${s.title} (${idx + 1}/${slides.length})` : s.title
    }));
  }

  /**
   * Transform to show only main sections
   */
  transformMainSectionsOnly(slide, analysis, config = {}) {
    const lines = slide.content.split('\n');
    const mainItems = lines.filter(line => {
      const match = line.match(/^\s*[-*]\s+\[/);
      if (!match) return false;
      // Check if it's a sub-item (indented)
      return !line.match(/^\s{2,}[-*]/);
    });

    return {
      ...slide,
      content: `## ${slide.title}

${mainItems.join('\n')}
`
    };
  }

  /**
   * Extract list items from content
   */
  extractListItems(content) {
    const lines = content.split('\n');
    return lines.filter(line => line.match(/^\s*[-*+]\s+/));
  }

  /**
   * Extract list items with indent info
   */
  extractListItemsWithIndent(content) {
    const lines = content.split('\n');
    const items = [];

    for (const line of lines) {
      const match = line.match(/^(\s*)[-*+]\s+/);
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
   * Extract title from content
   */
  extractTitle(content) {
    const match = content.match(/^##\s+(.+)$/m);
    return match ? match[1] : null;
  }
}

module.exports = { SlideOptimizer };

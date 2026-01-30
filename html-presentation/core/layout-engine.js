#!/usr/bin/env node

/**
 * Layout Engine
 * 布局决策引擎
 * @version 1.0.0
 */

const { ContentMeasurer } = require('./content-measurer.js')

/**
 * 布局引擎类
 */
class LayoutEngine {
  constructor(measurer = null) {
    this.measurer = measurer || new ContentMeasurer()

    // 布局规则
    this.layoutRules = [
      // 封面检测
      {
        name: 'cover',
        priority: 100,
        condition: (slide, analysis) => {
          return slide.isFirst ||
                 (analysis.headings.length === 1 && analysis.totalLines < 8)
        }
      },

      // 目录检测
      {
        name: 'toc',
        priority: 90,
        condition: (slide, analysis) => {
          return slide.title?.includes('目录') ||
                 slide.title?.includes('目录') ||
                 analysis.links > 5
        }
      },

      // 章节分隔
      {
        name: 'section',
        priority: 80,
        condition: (slide, analysis) => {
          return analysis.headings.some(h => h.level === 1) &&
                 analysis.totalLines < 10
        }
      },

      // 代码聚焦
      {
        name: 'code-focus',
        priority: 70,
        condition: (slide, analysis) => {
          if (!analysis.hasCode) return false
          const codeLines = analysis.codeBlocks.reduce((sum, cb) => sum + cb.lines, 0)
          const codeRatio = codeLines / analysis.totalLines
          return codeRatio > 0.4 || analysis.codeBlocks.some(cb => cb.lines > 15)
        }
      },

      // 代码对比
      {
        name: 'code-comparison',
        priority: 69,
        condition: (slide, analysis) => {
          return analysis.codeBlocks.length >= 2
        }
      },

      // 图文混排
      {
        name: 'image-right',
        priority: 60,
        condition: (slide, analysis) => {
          return analysis.images === 1 && analysis.textLines > 5
        }
      },

      // 双栏布局
      {
        name: 'two-col',
        priority: 50,
        condition: (slide, analysis) => {
          return analysis.lists >= 2 ||
                 (analysis.tables >= 1 && analysis.textLines > 3) ||
                 (analysis.hasCode && analysis.textLines > 3)
        }
      },

      // 卡片网格
      {
        name: 'card-grid',
        priority: 45,
        condition: (slide, analysis) => {
          return (analysis.lists >= 3 || analysis.items >= 6) &&
                 analysis.totalLines < 25
        }
      },

      // 时间线
      {
        name: 'timeline',
        priority: 55,
        condition: (slide, analysis) => {
          return slide.title?.includes('路线') ||
                 slide.title?.includes('时间') ||
                 slide.title?.includes('Timeline')
        }
      },

      // 默认单栏
      {
        name: 'single-col',
        priority: 0,
        condition: () => true
      }
    ]
  }

  /**
   * 决定布局
   * @param {Object} slide - 幻灯片对象
   * @param {Object} analysis - 内容分析结果（可选）
   * @returns {Object} 布局决策
   */
  decideLayout(slide, analysis = null) {
    // 如果没有提供分析结果，进行简单分析
    if (!analysis) {
      analysis = this.analyzeSlide(slide)
    }

    // 按优先级排序
    const sorted = [...this.layoutRules].sort((a, b) => b.priority - a.priority)

    // 找到第一个匹配的规则
    for (const rule of sorted) {
      if (rule.condition(slide, analysis)) {
        return {
          layout: rule.name,
          confidence: this.calculateConfidence(rule, slide, analysis),
          reasoning: this.getReasoning(rule, slide, analysis)
        }
      }
    }

    return {
      layout: 'single-col',
      confidence: 0.5,
      reasoning: '默认布局'
    }
  }

  /**
   * 分析幻灯片
   * @param {Object} slide - 幻灯片对象
   * @returns {Object} 分析结果
   */
  analyzeSlide(slide) {
    const content = slide.content || ''
    const breakdown = this.measurer.analyzeContent(content)

    return {
      headings: breakdown.filter(e => e.type === 'heading'),
      hasCode: breakdown.some(e => e.type === 'code'),
      codeBlocks: breakdown.filter(e => e.type === 'code'),
      hasImages: breakdown.some(e => e.type === 'image'),
      images: breakdown.filter(e => e.type === 'image').length,
      hasTables: breakdown.some(e => e.type === 'table'),
      tables: breakdown.filter(e => e.type === 'table').length,
      lists: breakdown.filter(e => e.type === 'listItem').length,
      items: breakdown.filter(e => e.type === 'listItem').length,
      totalLines: content.split('\n').length,
      textLines: breakdown.filter(e => e.type === 'paragraph' || e.type === 'listItem').length,
      links: (content.match(/\[[^\]]+\]\(/g) || []).length
    }
  }

  /**
   * 计算置信度
   * @param {Object} rule - 匹配的规则
   * @param {Object} slide - 幻灯片对象
   * @param {Object} analysis - 分析结果
   * @returns {number} 置信度 (0-1)
   */
  calculateConfidence(rule, slide, analysis) {
    // 高优先级规则有更高置信度
    const baseConfidence = Math.min(rule.priority / 100, 0.95)

    // 根据内容特征调整
    let adjustment = 0

    if (rule.name === 'code-focus' && analysis.hasCode) {
      const codeRatio = analysis.codeBlocks.reduce((sum, cb) => sum + cb.lines, 0) / analysis.totalLines
      if (codeRatio > 0.5) adjustment += 0.05
    }

    if (rule.name === 'two-col' && analysis.lists >= 3) {
      adjustment += 0.05
    }

    return Math.min(baseConfidence + adjustment, 1.0)
  }

  /**
   * 获取决策理由
   * @param {Object} rule - 匹配的规则
   * @param {Object} slide - 幻灯片对象
   * @param {Object} analysis - 分析结果
   * @returns {string} 决策理由
   */
  getReasoning(rule, slide, analysis) {
    const reasons = {
      'cover': '封面页，仅包含标题',
      'toc': '目录页，包含多个链接',
      'section': '章节分隔页',
      'code-focus': `代码为主（${analysis.codeBlocks.length} 个代码块）`,
      'code-comparison': `多个代码块对比（${analysis.codeBlocks.length} 个）`,
      'image-right': '图文混排',
      'two-col': '双栏布局，适合列表或表格',
      'card-grid': '卡片网格布局',
      'timeline': '时间线布局',
      'single-col': '默认单栏布局'
    }

    return reasons[rule.name] || '自动选择布局'
  }

  /**
   * 获取所有可用布局
   * @returns {Array} 布局列表
   */
  getAvailableLayouts() {
    return [
      { id: 'cover', name: '封面页', description: '标题 + 副标题' },
      { id: 'toc', name: '目录页', description: '链接列表' },
      { id: 'section', name: '章节分隔', description: '大标题' },
      { id: 'single-col', name: '单栏', description: '默认布局' },
      { id: 'two-col', name: '双栏', description: '左右两栏' },
      { id: 'three-col', name: '三栏', description: '三栏布局' },
      { id: 'image-left', name: '图左文右', description: '图片在左' },
      { id: 'image-right', name: '图右文左', description: '图片在右' },
      { id: 'code-focus', name: '代码聚焦', description: '大代码块' },
      { id: 'code-comparison', name: '代码对比', description: '多个代码块' },
      { id: 'card-grid', name: '卡片网格', description: '网格布局' },
      { id: 'timeline', name: '时间线', description: '时间轴' }
    ]
  }
}

module.exports = { LayoutEngine }

// 如果直接运行，执行测试
if (require.main === module) {
  const engine = new LayoutEngine()

  // 测试用例
  const testSlides = [
    {
      name: '封面页',
      content: '# 演示标题\n\n副标题'
    },
    {
      name: '代码页',
      content: `# 代码示例

\`\`\`javascript
function hello() {
  console.log('Hello');
  console.log('World');
}
\`\`\`
`
    },
    {
      name: '双列页',
      content: `# 特性列表

- 特性 1
- 特性 2
- 特性 3

## 说明

这里是详细说明。`
    }
  ]

  console.log('🎯 Layout Engine 测试\n')

  testSlides.forEach((slide, i) => {
    console.log(`--- 测试 ${i + 1}: ${slide.name} ---`)

    const decision = engine.decideLayout(slide)
    console.log(`布局: ${decision.layout}`)
    console.log(`置信度: ${Math.round(decision.confidence * 100)}%`)
    console.log(`理由: ${decision.reasoning}\n`)
  })

  console.log('📋 可用布局:')
  engine.getAvailableLayouts().forEach(layout => {
    console.log(`  - ${layout.name}: ${layout.description}`)
  })
}

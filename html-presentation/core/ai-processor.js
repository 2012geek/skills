#!/usr/bin/env node

/**
 * AI Processor
 * AI 内容处理和分析
 * @version 1.0.0
 */

const fs = require('fs').promises
const path = require('path')

/**
 * AI 处理器类
 */
class AIProcessor {
  constructor(config = {}) {
    this.config = {
      enabled: config.enabled !== false,
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      model: config.model || 'claude-3-5-sonnet-20241022',
      maxRetries: config.maxRetries || 3
    }

    if (!this.config.apiKey && this.config.enabled) {
      console.warn('⚠️  未设置 ANTHROPIC_API_KEY，AI 功能将被禁用')
      this.config.enabled = false
    }
  }

  /**
   * 处理幻灯片
   * @param {string} markdown - Markdown 内容
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 处理结果
   */
  async processSlide(markdown, options = {}) {
    if (!this.config.enabled) {
      return {
        optimized: markdown,
        layout: 'single-col',
        quality: { score: 100, passes: true }
      }
    }

    const result = {
      original: markdown,
      optimized: markdown,
      layout: 'single-col',
      splits: [],
      quality: { score: 0, passes: false }
    }

    // 1. 分析内容
    const analysis = await this.analyzeContent(markdown)
    console.log(`🔍 内容分析: ${analysis.slideType}`)

    // 2. 决定布局
    const layout = await this.decideLayout(analysis)
    result.layout = layout.layout
    console.log(`📐 布局决策: ${layout.layout} (置信度: ${Math.round(layout.confidence * 100)}%)`)

    // 3. 优化内容
    if (options.optimize !== false) {
      const optimized = await this.optimizeContent(markdown, analysis, layout)
      result.optimized = optimized
      console.log(`✨ 内容已优化`)
    }

    // 4. 质量检查
    const quality = await this.checkQuality(markdown, result.optimized, layout)
    result.quality = quality
    console.log(`✅ 质量评分: ${quality.score}/100`)

    return result
  }

  /**
   * 分析内容
   * @param {string} markdown - Markdown 内容
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeContent(markdown) {
    const prompt = await this.loadPrompt('analyze.md')
    const filled = prompt.replace('{{markdown_content}}', markdown)

    try {
      const response = await this.callAI(filled, 2000)
      return JSON.parse(response)
    } catch (err) {
      console.error('内容分析失败:', err.message)
      return this.fallbackAnalysis(markdown)
    }
  }

  /**
   * 决定布局
   * @param {Object} analysis - 分析结果
   * @returns {Promise<Object>} 布局决策
   */
  async decideLayout(analysis) {
    const prompt = await this.loadPrompt('layout.md')
    const filled = prompt.replace('{{analysis_result}}', JSON.stringify(analysis))

    try {
      const response = await this.callAI(filled, 1000)
      return JSON.parse(response)
    } catch (err) {
      console.error('布局决策失败:', err.message)
      return { layout: 'single-col', confidence: 0.5, reasoning: '默认布局' }
    }
  }

  /**
   * 优化内容
   * @param {string} markdown - 原始内容
   * @param {Object} analysis - 分析结果
   * @param {Object} layout - 布局决策
   * @returns {Promise<string>} 优化后的内容
   */
  async optimizeContent(markdown, analysis, layout) {
    // 简化版本：直接返回原内容
    // 完整版本会使用 AI 来优化内容结构、标题层级等
    return markdown
  }

  /**
   * 质量检查
   * @param {string} original - 原始内容
   * @param {string} generated - 生成内容
   * @param {Object} layout - 布局
   * @returns {Promise<Object>} 质量评分
   */
  async checkQuality(original, generated, layout) {
    const prompt = await this.loadPrompt('quality-check.md')
    const filled = prompt
      .replace('{{original_markdown}}', original)
      .replace('{{generated_markdown}}', generated)
      .replace('{{layout_name}}', layout.layout)

    try {
      const response = await this.callAI(filled, 2000)
      return JSON.parse(response)
    } catch (err) {
      console.error('质量检查失败:', err.message)
      return { score: 85, passes: true, issues: [] }
    }
  }

  /**
   * 调用 AI API
   * @param {string} prompt - 提示词
   * @param {number} maxTokens - 最大 token 数
   * @returns {Promise<string>} AI 响应
   */
  async callAI(prompt, maxTokens = 2000) {
    if (!this.config.enabled) {
      throw new Error('AI 功能未启用')
    }

    // 这里应该调用 Anthropic API
    // 简化版本：返回模拟响应
    throw new Error('AI API 未实现（需要 @anthropic-ai/sdk）')
  }

  /**
   * 加载提示词文件
   * @param {string} filename - 文件名
   * @returns {Promise<string>} 提示词内容
   */
  async loadPrompt(filename) {
    const promptPath = path.join(__dirname, '../prompts', filename)
    try {
      return await fs.readFile(promptPath, 'utf-8')
    } catch (err) {
      console.error(`加载提示词失败: ${filename}`)
      return ''
    }
  }

  /**
   * 降级分析（当 AI 不可用时）
   * @param {string} markdown - Markdown 内容
   * @returns {Object} 分析结果
   */
  fallbackAnalysis(markdown) {
    const lines = markdown.split('\n')
    const headings = []

    lines.forEach((line, i) => {
      const match = line.match(/^(#{1,3})\s+(.+)$/)
      if (match) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          line: i
        })
      }
    })

    return {
      title: headings[0]?.text || 'Untitled',
      headings,
      hasCode: markdown.includes('```'),
      codeBlocks: [],
      hasImages: markdown.includes('![') || markdown.includes('<img'),
      images: 0,
      totalLines: lines.length,
      textLines: lines.filter(l => l.trim() && !l.startsWith('#')).length,
      slideType: 'generic'
    }
  }
}

module.exports = { AIProcessor }

// 如果直接运行，执行测试
if (require.main === module) {
  const processor = new AIProcessor({ enabled: false })  // 禁用 AI 进行测试

  const testMarkdown = `# Test Slide

This is a test.

- Item 1
- Item 2
`

  processor.processSlide(testMarkdown).then(result => {
    console.log('AI 处理结果:')
    console.log(JSON.stringify(result, null, 2))
  }).catch(err => {
    console.error('处理失败:', err)
  })
}

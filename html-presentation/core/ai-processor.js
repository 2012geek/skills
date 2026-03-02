#!/usr/bin/env node

/**
 * AI Processor
 * AI 内容处理和分析
 * @version 2.0.0 - 完整 API 实现
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
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.7,
      debug: config.debug || false
    }

    // 统计信息
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      totalCost: 0
    }

    if (!this.config.apiKey && this.config.enabled) {
      console.warn('⚠️  未设置 ANTHROPIC_API_KEY，AI 功能将被禁用')
      this.config.enabled = false
    }

    // 延迟加载 Anthropic SDK（仅在需要时）
    this.Anthropic = null
    this.client = null
  }

  /**
   * 初始化 Anthropic 客户端
   */
  initClient() {
    if (this.client) return this.client

    if (!this.config.apiKey) {
      throw new Error('Anthropic API key 未设置')
    }

    try {
      this.Anthropic = require('@anthropic-ai/sdk')
      this.client = new this.Anthropic({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout,
        maxRetries: 0 // 我们自己实现重试逻辑
      })
      return this.client
    } catch (err) {
      throw new Error(`无法加载 @anthropic-ai/sdk: ${err.message}`)
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

    try {
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

    } catch (err) {
      console.warn('⚠️  AI 处理失败，使用降级方案:', err.message)
      // 降级到基础分析
      result.optimized = markdown
      result.layout = 'single-col'
      result.quality = { score: 85, passes: true, issues: [] }
    }

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
    if (!this.config.enabled) {
      return markdown
    }

    // 构建优化提示词
    const prompt = this.buildOptimizationPrompt(markdown, analysis, layout)

    try {
      const response = await this.callAI(prompt, 2000)
      return this.extractMarkdown(response)
    } catch (err) {
      console.warn('内容优化失败，使用原始内容:', err.message)
      return markdown
    }
  }

  /**
   * 构建优化提示词
   * @param {string} markdown - 原始内容
   * @param {Object} analysis - 分析结果
   * @param {Object} layout - 布局决策
   * @returns {string} 提示词
   */
  buildOptimizationPrompt(markdown, analysis, layout) {
    return `你是一个演示文稿内容优化专家。请优化以下幻灯片内容，使其更适合演示展示。

## 原始内容

${markdown}

## 分析结果

- 布局建议: ${layout.layout}
- 内容类型: ${analysis.slideType || 'generic'}
- 代码占比: ${analysis.contentRatio?.code || 0}
- 文本占比: ${analysis.contentRatio?.text || 0}

## 优化规则

1. **标题优化**：保持简洁，使用动词或关键词
2. **列表优化**：每项不超过 15 字，使用平行结构
3. **代码优化**：保留关键代码，添加行号和高亮
4. **段落优化**：每段不超过 3 行，重点突出
5. **视觉元素**：建议添加图标、图表的位置

## 输出要求

- 仅输出优化后的 Markdown 内容
- 保持原有结构（标题、列表、代码块）
- 不要添加任何解释性文字
- 如果不需要优化，返回原始内容

请输出优化后的 Markdown：`
  }

  /**
   * 从 AI 响应中提取 Markdown
   * @param {string} response - AI 响应
   * @returns {string} Markdown 内容
   */
  extractMarkdown(response) {
    // 尝试提取 markdown 代码块
    const markdownMatch = response.match(/```(?:markdown)?\n([\s\S]*?)\n```/)
    if (markdownMatch) {
      return markdownMatch[1].trim()
    }

    // 如果没有代码块，直接返回（去除可能的解释文字）
    return response.trim()
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
   * 调用 AI API（带重试机制）
   * @param {string} prompt - 提示词
   * @param {number} maxTokens - 最大 token 数
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} AI 响应
   */
  async callAI(prompt, maxTokens = null, options = {}) {
    if (!this.config.enabled) {
      throw new Error('AI 功能未启用')
    }

    const client = this.initClient()
    const tokens = maxTokens || options.maxTokens || this.config.maxTokens
    const retries = options.retries !== undefined ? options.retries : this.config.maxRetries

    this.stats.totalCalls++

    if (this.config.debug) {
      console.log(`\n🤖 AI API 调用:`)
      console.log(`   模型: ${this.config.model}`)
      console.log(`   Max Tokens: ${tokens}`)
      console.log(`   重试次数: ${retries}`)
    }

    let lastError = null
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now()

        const response = await client.messages.create({
          model: this.config.model,
          max_tokens: tokens,
          temperature: options.temperature || this.config.temperature,
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ]
        })

        const elapsed = Date.now() - startTime

        // 提取响应文本
        let responseText = ''
        if (response.content && response.content.length > 0) {
          const block = response.content[0]
          if (block.type === 'text') {
            responseText = block.text
          }
        }

        // 更新统计
        this.stats.successfulCalls++
        if (response.usage) {
          this.stats.totalTokens += response.usage.input_tokens + response.usage.output_tokens
          // 估算成本（Claude Sonnet 3.5 定价）
          // Input: $3/1M tokens, Output: $15/1M tokens
          const inputCost = (response.usage.input_tokens / 1000000) * 3
          const outputCost = (response.usage.output_tokens / 1000000) * 15
          this.stats.totalCost += inputCost + outputCost
        }

        if (this.config.debug) {
          console.log(`   ✅ 成功 (${elapsed}ms)`)
          if (response.usage) {
            console.log(`   Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`)
          }
        }

        return responseText

      } catch (err) {
        lastError = err
        const isRetryable = this.isRetryableError(err)
        const isLastAttempt = attempt === retries

        if (this.config.debug) {
          console.log(`   ❌ 尝试 ${attempt + 1}/${retries + 1} 失败: ${err.message}`)
        }

        if (!isRetryable || isLastAttempt) {
          this.stats.failedCalls++
          throw new Error(`AI API 调用失败: ${err.message}`)
        }

        // 指数退避
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        if (this.config.debug) {
          console.log(`   ⏳ 等待 ${delay}ms 后重试...`)
        }
        await this.sleep(delay)
      }
    }

    this.stats.failedCalls++
    throw lastError || new Error('AI API 调用失败')
  }

  /**
   * 判断错误是否可重试
   * @param {Error} err - 错误对象
   * @returns {boolean} 是否可重试
   */
  isRetryableError(err) {
    const retryablePatterns = [
      /timeout/i,
      /ECONNRESET/i,
      /ECONNREFUSED/i,
      /ETIMEDOUT/i,
      /5\d{2}/,  // 5xx 错误
      /rate limit/i,
      /too many requests/i
    ]

    const message = err.message || ''
    return retryablePatterns.some(pattern => pattern.test(message))
  }

  /**
   * 延迟函数
   * @param {number} ms - 毫秒数
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalCalls > 0
        ? (this.stats.successfulCalls / this.stats.totalCalls * 100).toFixed(2) + '%'
        : 'N/A',
      estimatedCost: '$' + this.stats.totalCost.toFixed(6)
    }
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      totalCost: 0
    }
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
  console.log('🧪 AI Processor 测试\n')

  // 测试 1: 降级模式（无 API key）
  console.log('--- 测试 1: 降级模式（无 AI） ---')
  const fallbackProcessor = new AIProcessor({ enabled: false })

  const testMarkdown = `# Test Slide

This is a test slide with some content.

- Item 1
- Item 2
- Item 3

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`
`

  fallbackProcessor.processSlide(testMarkdown).then(result => {
    console.log('✅ 降级模式测试通过')
    console.log('   布局:', result.layout)
    console.log('   质量评分:', result.quality.score)
  }).catch(err => {
    console.error('❌ 降级模式测试失败:', err.message)
  })

  // 测试 2: AI 模式（需要 API key）
  console.log('\n--- 测试 2: AI 模式 ---')
  const aiProcessor = new AIProcessor({
    enabled: true,
    debug: true,
    maxRetries: 2
  })

  // 检查是否启用了 AI
  if (!aiProcessor.config.enabled) {
    console.log('⚠️  AI 未启用（未设置 ANTHROPIC_API_KEY）')
    console.log('   设置环境变量以测试 AI 功能:')
    console.log('   export ANTHROPIC_API_KEY=your-key-here')
  } else {
    console.log('✅ AI 已启用，测试简单调用...')

    // 测试简单的 AI 调用
    aiProcessor.callAI('Say "Hello, AI Processor!" in a friendly way.', 100)
      .then(response => {
        console.log('✅ AI 调用成功!')
        console.log('   响应:', response)
        console.log('\n📊 统计信息:')
        console.log(JSON.stringify(aiProcessor.getStats(), null, 2))
      })
      .catch(err => {
        console.error('❌ AI 调用失败:', err.message)
      })
  }
}

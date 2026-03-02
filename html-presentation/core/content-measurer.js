#!/usr/bin/env node

/**
 * Content Measurer
 * 基于实际渲染高度的内容测量引擎
 * @version 2.0.0 - 支持浏览器测量模式
 */

// 延迟加载 BrowserMeasurer（仅在需要时）
let BrowserMeasurer = null

/**
 * 内容测量器类
 * 用于估算幻灯片内容的实际渲染高度
 * 支持两种模式：
 * - 'estimate': 基于 CSS 估算（快速，不需要浏览器）
 * - 'browser': 基于真实浏览器渲染（准确，需要 Playwright）
 */
class ContentMeasurer {
  constructor(config = {}) {
    // 测量模式
    this.mode = config.mode || 'estimate'  // 'estimate' 或 'browser'

    // 基础测量配置
    this.config = {
      slideHeight: config.slideHeight || 720,        // 标准幻灯片高度（px）
      slideWidth: config.slideWidth || 1280,        // 标准幻灯片宽度（px）
      padding: config.padding || { top: 60, bottom: 60, left: 80, right: 80 },
      safeHeight: config.safeHeight || 0.85         // 安全系数（保留 15% 余量）
    }

    // 浏览器测量器（延迟初始化）
    this.browserMeasurer = null

    // 浏览器测量器配置
    this.browserConfig = {
      timeout: config.timeout || 10000,
      headless: config.headless !== false,
      screenshot: config.screenshot || false,
      debug: config.debug || false
    }

    // 元素高度估算（基于 CSS 样式）
    this.elementHeights = {
      // 标题
      h1: { minHeight: 80, lineHeight: 1.2 },
      h2: { minHeight: 60, lineHeight: 1.3 },
      h3: { minHeight: 50, lineHeight: 1.4 },
      h4: { minHeight: 40, lineHeight: 1.4 },

      // 文本
      paragraph: { minHeight: 24, lineHeight: 1.6 },
      listItem: { minHeight: 28, lineHeight: 1.5 },

      // 代码块
      codeBlock: {
        minHeight: 40,
        lineHeight: 1.4,
        padding: 24,
        fontSize: 14
      },

      // 图片
      image: { maxHeight: 400, aspectRatio: 16/9 },

      // 表格
      table: { rowHeight: 44, headerHeight: 50 },

      // 引用块
      blockquote: { minHeight: 60, padding: 20 },

      // 分隔线
      hr: { height: 20 }
    }
  }

  /**
   * 测量幻灯片内容高度
   * @param {string} markdown - Markdown 内容
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} { height, percentage, fits, breakdown }
   */
  async measureSlide(markdown, options = {}) {
    // 浏览器模式：使用真实渲染
    if (this.mode === 'browser' || options.mode === 'browser') {
      return await this.measureWithBrowser(markdown, options)
    }

    // 估算模式：使用 CSS 估算（默认，兼容旧代码）
    return this.measureByEstimate(markdown)
  }

  /**
   * 使用浏览器进行测量
   * @param {string} markdown - Markdown 内容
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 测量结果
   */
  async measureWithBrowser(markdown, options = {}) {
    try {
      // 延迟加载 BrowserMeasurer
      if (!BrowserMeasurer) {
        BrowserMeasurer = require('./browser-measurer.js').BrowserMeasurer
      }

      // 初始化浏览器测量器
      if (!this.browserMeasurer) {
        this.browserMeasurer = new BrowserMeasurer({
          slideWidth: this.config.slideWidth,
          slideHeight: this.config.slideHeight,
          ...this.browserConfig
        })
      }

      // 使用浏览器测量
      const result = await this.browserMeasurer.measureSlide(markdown, {
        theme: options.theme || 'seriph',
        useCache: options.useCache !== false
      })

      return result

    } catch (err) {
      console.warn(`⚠️  浏览器测量失败，降级到估算模式: ${err.message}`)

      // 降级到估算模式
      const estimateResult = this.measureByEstimate(markdown)
      estimateResult.mode = 'estimate (fallback)'
      return estimateResult
    }
  }

  /**
   * 使用估算进行测量
   * @param {string} markdown - Markdown 内容
   * @returns {Object} 测量结果
   */
  measureByEstimate(markdown) {
    const breakdown = this.analyzeContent(markdown)
    const totalHeight = this.calculateHeight(breakdown)
    const availableHeight = this.getAvailableHeight()
    const percentage = (totalHeight / availableHeight) * 100
    const fits = percentage <= 100

    return {
      height: Math.round(totalHeight),
      available: Math.round(availableHeight),
      percentage: Math.round(percentage),
      fits,
      breakdown,
      overflow: Math.round(totalHeight - availableHeight),
      mode: 'estimate'
    }
  }

  /**
   * 分析内容结构
   * @param {string} markdown - Markdown 内容
   * @returns {Array} 元素列表
   */
  analyzeContent(markdown) {
    const elements = []
    const lines = markdown.split('\n')

    let inCodeBlock = false
    let codeLang = ''
    let codeLines = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // 代码块处理
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          // 代码块结束
          elements.push({
            type: 'code',
            language: codeLang,
            lines: codeLines.length,
            startLine: i - codeLines.length,
            content: codeLines.join('\n')
          })
          codeLines = []
          inCodeBlock = false
        } else {
          // 代码块开始
          inCodeBlock = true
          codeLang = line.match(/```(\w+)?/)?.[1] || 'text'
        }
        continue
      }

      if (inCodeBlock) {
        codeLines.push(line)
        continue
      }

      // 标题
      if (line.startsWith('#')) {
        const match = line.match(/^(#{1,4})\s/)
        if (match) {
          const level = match[1].length
          elements.push({
            type: 'heading',
            level,
            text: line.replace(/^#+\s/, '').trim(),
            line: i
          })
        }
        continue
      }

      // 图片
      const imgMatch = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
      if (imgMatch) {
        elements.push({
          type: 'image',
          alt: imgMatch[1],
          url: imgMatch[2],
          line: i
        })
        continue
      }

      // HTML img 标签
      const htmlImgMatch = line.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i)
      if (htmlImgMatch) {
        elements.push({
          type: 'image',
          url: htmlImgMatch[1],
          line: i,
          isHtml: true
        })
        continue
      }

      // 表格
      if (line.includes('|') && line.trim().length > 0) {
        elements.push({
          type: 'table',
          line: i,
          content: line
        })
        continue
      }

      // 列表项
      if (line.match(/^\s*[-*+]\s/) || line.match(/^\s*\d+\.\s/)) {
        elements.push({
          type: 'listItem',
          text: line.trim(),
          line: i,
          indent: line.match(/^\s*/)[0].length
        })
        continue
      }

      // 引用
      if (line.startsWith('>')) {
        elements.push({
          type: 'blockquote',
          text: line.replace(/^>\s?/, '').trim(),
          line: i
        })
        continue
      }

      // 分隔线
      if (line.trim() === '---' || line.trim() === '***') {
        elements.push({
          type: 'hr',
          line: i
        })
        continue
      }

      // 普通段落
      if (line.trim() && !line.startsWith('#')) {
        elements.push({
          type: 'paragraph',
          text: line.trim(),
          line: i
        })
      }
    }

    // 合并连续的段落
    return this.mergeParagraphs(elements)
  }

  /**
   * 合并连续的段落为一块
   * @param {Array} elements - 原始元素列表
   * @returns {Array} 合并后的元素列表
   */
  mergeParagraphs(elements) {
    const merged = []
    let currentParagraph = null

    for (const elem of elements) {
      if (elem.type === 'paragraph') {
        if (!currentParagraph) {
          currentParagraph = {
            type: 'paragraph',
            lines: 1,
            startLine: elem.line,
            text: [elem.text]
          }
        } else {
          currentParagraph.lines++
          currentParagraph.text.push(elem.text)
        }
      } else {
        if (currentParagraph) {
          merged.push(currentParagraph)
          currentParagraph = null
        }
        merged.push(elem)
      }
    }

    if (currentParagraph) {
      merged.push(currentParagraph)
    }

    return merged
  }

  /**
   * 计算总高度
   * @param {Array} breakdown - 内容元素列表
   * @returns {number} 总高度（px）
   */
  calculateHeight(breakdown) {
    let total = 0

    for (const elem of breakdown) {
      total += this.estimateElementHeight(elem)
    }

    // 元素间距（约 12px）
    total += (breakdown.length - 1) * 12

    return total
  }

  /**
   * 估算单个元素高度
   * @param {Object} elem - 元素对象
   * @returns {number} 估算高度（px）
   */
  estimateElementHeight(elem) {
    const config = this.elementHeights

    switch (elem.type) {
      case 'heading': {
        const hConfig = config[`h${elem.level}`] || config.h4
        return hConfig.minHeight + this.estimateTextHeight(elem.text, hConfig.lineHeight)
      }

      case 'paragraph': {
        const text = Array.isArray(elem.text) ? elem.text.join(' ') : elem.text
        return config.paragraph.minHeight +
               (elem.lines - 1) * config.paragraph.lineHeight * 16
      }

      case 'listItem': {
        return config.listItem.minHeight +
               this.estimateTextHeight(elem.text, config.listItem.lineHeight)
      }

      case 'code': {
        const codeConfig = config.codeBlock
        const codeHeight = elem.lines * codeConfig.lineHeight * codeConfig.fontSize
        return codeConfig.minHeight + codeConfig.padding * 2 + codeHeight
      }

      case 'image': {
        // 假设图片宽度占 60%，按比例计算高度
        const imgWidth = this.config.slideWidth * 0.6
        const imgHeight = imgWidth / config.image.aspectRatio
        return Math.min(imgHeight, config.image.maxHeight)
      }

      case 'table': {
        // 简化：假设表格有表头 + 数据行
        const rows = elem.lines || 1
        return config.table.headerHeight + rows * config.table.rowHeight
      }

      case 'blockquote': {
        return config.blockquote.minHeight +
               this.estimateTextHeight(elem.text, 1.5) +
               config.blockquote.padding * 2
      }

      case 'hr': {
        return config.hr.height
      }

      default: {
        return 30
      }
    }
  }

  /**
   * 估算文本高度
   * @param {string} text - 文本内容
   * @param {number} lineHeight - 行高倍数
   * @returns {number} 估算高度（px）
   */
  estimateTextHeight(text, lineHeight) {
    if (!text) return 0

    const chars = text.length
    const avgCharWidth = 14  // 中英文平均字符宽度（px）
    const containerWidth = this.config.slideWidth -
                           this.config.padding.left -
                           this.config.padding.right
    const charsPerLine = Math.floor(containerWidth / avgCharWidth)
    const lines = Math.ceil(chars / charsPerLine)

    return lines * lineHeight * 16
  }

  /**
   * 获取可用高度
   * @returns {number} 可用高度（px）
   */
  getAvailableHeight() {
    const { slideHeight, padding, safeHeight } = this.config
    return (slideHeight - padding.top - padding.bottom) * safeHeight
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * 关闭测量器（释放浏览器资源）
   */
  async close() {
    if (this.browserMeasurer) {
      await this.browserMeasurer.close()
      this.browserMeasurer = null
    }
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    if (this.browserMeasurer) {
      await this.browserMeasurer.clearCache()
    }
  }

  /**
   * 获取内容统计信息
   * @param {string} markdown - Markdown 内容
   * @returns {Object} 统计信息
   */
  getContentStats(markdown) {
    const breakdown = this.analyzeContent(markdown)

    const stats = {
      totalElements: breakdown.length,
      headings: 0,
      paragraphs: 0,
      codeBlocks: 0,
      images: 0,
      tables: 0,
      listItems: 0,
      blockquotes: 0
    }

    for (const elem of breakdown) {
      if (elem.type === 'heading') stats.headings++
      else if (elem.type === 'paragraph') stats.paragraphs++
      else if (elem.type === 'code') stats.codeBlocks++
      else if (elem.type === 'image') stats.images++
      else if (elem.type === 'table') stats.tables++
      else if (elem.type === 'listItem') stats.listItems++
      else if (elem.type === 'blockquote') stats.blockquotes++
    }

    return stats
  }
}

module.exports = { ContentMeasurer }

// 如果直接运行此文件，执行测试
if (require.main === module) {
  (async () => {
    // 测试估算模式
    console.log('📏 Content Measurer 测试\n')

    console.log('=== 估算模式测试 ===')
    const estimateMeasurer = new ContentMeasurer({ mode: 'estimate' })

    const testCases = [
      {
        name: '简单标题',
        content: '# Hello World'
      },
      {
        name: '标题+段落',
        content: `# Introduction

This is a test paragraph with some text.

Another paragraph here.`
      },
      {
        name: '代码块',
        content: `# Code Example

\`\`\`javascript
function hello() {
  console.log('Hello');
  console.log('World');
  console.log('Test');
}
\`\`\`
`
      },
      {
        name: '混合内容',
        content: `# Complete Example

## Features

- Feature 1
- Feature 2
- Feature 3

\`\`\`javascript
const x = 1;
const y = 2;
console.log(x + y);
\`\`\`

## Conclusion

This is the end.`
      }
    ]

    for (const testCase of testCases) {
      console.log(`--- ${testCase.name} ---`)
      const result = await estimateMeasurer.measureSlide(testCase.content)
      console.log(`高度: ${result.height}px / ${result.available}px (${result.percentage}%)`)
      console.log(`适配: ${result.fits ? '✅' : '❌'}`)
      console.log(`模式: ${result.mode}`)
      console.log(`元素: ${result.breakdown?.length || 'N/A'} 个`)
      console.log()
    }

    const stats = estimateMeasurer.getContentStats(testCases[3].content)
    console.log('📊 内容统计:')
    console.log(JSON.stringify(stats, null, 2))

    // 测试浏览器模式（可选）
    console.log('\n=== 浏览器模式测试 ===')
    const browserMeasurer = new ContentMeasurer({
      mode: 'browser',
      debug: false
    })

    try {
      console.log('测试简单内容...')
      const browserResult = await browserMeasurer.measureSlide('# Hello from Browser')
      console.log(`高度: ${browserResult.height}px / ${browserResult.available}px (${browserResult.percentage}%)`)
      console.log(`适配: ${browserResult.fits ? '✅' : '❌'}`)
      console.log(`模式: ${browserResult.mode}`)
    } catch (err) {
      console.warn(`浏览器模式跳过: ${err.message}`)
    }

    // 清理
    await browserMeasurer.close()
    console.log('\n✅ 测试完成')
  })().catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
}

#!/usr/bin/env node

/**
 * Browser Content Measurer
 * 使用 Playwright 进行真实的浏览器渲染测量
 * @version 2.0.0
 */

const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs').promises

/**
 * 浏览器内容测量器类
 */
class BrowserMeasurer {
  constructor(config = {}) {
    this.config = {
      slideWidth: config.slideWidth || 1280,
      slideHeight: config.slideHeight || 720,
      timeout: config.timeout || 10000,
      headless: config.headless !== false,  // 默认无头模式
      screenshot: config.screenshot || false,  // 是否保存截图
      screenshotDir: config.screenshotDir || '.screenshots',
      cacheDir: config.cacheDir || '.cache/measurements',
      enableCache: config.enableCache !== false,
      debug: config.debug || false
    }

    this.browser = null
    this.page = null
    this.context = null
  }

  /**
   * 初始化浏览器
   */
  async init() {
    if (this.browser) {
      return
    }

    if (this.config.debug) {
      console.log('🌐 初始化浏览器测量器...')
      console.log(`   分辨率: ${this.config.slideWidth}x${this.config.slideHeight}`)
      console.log(`   模式: ${this.config.headless ? '无头' : '有头'}`)
    }

    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      })

      this.context = await this.browser.newContext({
        viewport: {
          width: this.config.slideWidth,
          height: this.config.slideHeight
        },
        deviceScaleFactor: 1
      })

      this.page = await this.context.newPage()

      // 设置默认超时
      this.page.setDefaultTimeout(this.config.timeout)

      if (this.config.debug) {
        console.log('✅ 浏览器初始化完成')
      }
    } catch (err) {
      throw new Error(`浏览器初始化失败: ${err.message}`)
    }
  }

  /**
   * 测量幻灯片内容
   * @param {string} markdown - Markdown 内容
   * @param {Object} options - 额外选项
   * @returns {Promise<Object>} 测量结果
   */
  async measureSlide(markdown, options = {}) {
    const theme = options.theme || 'seriph'
    const useCache = options.useCache !== false && this.config.enableCache

    // 检查缓存
    if (useCache) {
      const cached = await this.loadFromCache(markdown, theme)
      if (cached) {
        if (this.config.debug) {
          console.log('💨 使用缓存结果')
        }
        return cached
      }
    }

    await this.init()

    try {
      // 创建测试 HTML
      const html = await this.createTestHTML(markdown, theme)

      // 加载到浏览器
      await this.page.setContent(html, {
        waitUntil: 'networkidle',
        timeout: this.config.timeout
      })

      // 等待内容渲染完成
      await this.page.waitForSelector('.slide-content', {
        state: 'attached',
        timeout: 5000
      }).catch(() => {
        // 容器可能不存在，继续执行
      })

      // 测量实际尺寸
      const measurements = await this.page.evaluate(() => {
        const content = document.querySelector('.slide-content') || document.body

        // 获取滚动高度
        const scrollHeight = content.scrollHeight
        const clientHeight = content.clientHeight

        // 检测溢出
        const isOverflowing = scrollHeight > clientHeight

        // 计算每个主要元素的高度
        const elements = Array.from(content.children).map(el => ({
          tagName: el.tagName,
          className: el.className,
          offsetHeight: el.offsetHeight,
          scrollHeight: el.scrollHeight,
          textContent: el.textContent?.substring(0, 50)
        }))

        return {
          height: scrollHeight,
          clientHeight: clientHeight,
          fits: !isOverflowing,
          overflow: isOverflowing ? scrollHeight - clientHeight : 0,
          elements: elements,
          elementCount: elements.length
        }
      })

      // 计算百分比
      const availableHeight = measurements.clientHeight
      const percentage = (measurements.height / availableHeight) * 100

      const result = {
        height: Math.round(measurements.height),
        available: Math.round(availableHeight),
        percentage: Math.round(percentage),
        fits: measurements.fits,
        overflow: Math.round(measurements.overflow),
        breakdown: measurements.elements,
        elementCount: measurements.elementCount,
        mode: 'browser'
      }

      // 保存截图（如果启用）
      if (this.config.screenshot) {
        await this.saveScreenshot(markdown, result)
      }

      // 缓存结果
      if (useCache) {
        await this.saveToCache(markdown, theme, result)
      }

      if (this.config.debug) {
        console.log(`📏 测量结果: ${result.height}px / ${result.available}px (${result.percentage}%)`)
        console.log(`   适配: ${result.fits ? '✅' : '❌'}`)
      }

      return result

    } catch (err) {
      throw new Error(`浏览器测量失败: ${err.message}`)
    }
  }

  /**
   * 创建测试 HTML
   * @param {string} markdown - Markdown 内容
   * @param {string} theme - 主题名称
   * @returns {Promise<string>} HTML 内容
   */
  async createTestHTML(markdown, theme) {
    // 使用 Slidev 的基本 HTML 结构
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Slide Measurement</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #fff;
      color: #333;
      overflow: hidden;
    }

    .slide-content {
      width: ${this.config.slideWidth}px;
      height: ${this.config.slideHeight}px;
      padding: 60px 80px;
      overflow: hidden;
      position: relative;
      background: #fff;
    }

    /* Markdown 样式 */
    h1 { font-size: 3em; font-weight: 900; margin-bottom: 0.5em; line-height: 1.2; }
    h2 { font-size: 2.2em; font-weight: 700; margin-bottom: 0.4em; line-height: 1.3; }
    h3 { font-size: 1.8em; font-weight: 600; margin-bottom: 0.3em; line-height: 1.4; }
    h4 { font-size: 1.4em; font-weight: 600; margin-bottom: 0.2em; line-height: 1.4; }

    p { font-size: 1em; line-height: 1.6; margin-bottom: 1em; }

    ul, ol { margin-left: 1.5em; margin-bottom: 1em; }
    li { font-size: 1em; line-height: 1.5; margin-bottom: 0.5em; }

    pre {
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 1em;
      margin: 1em 0;
      overflow-x: auto;
      font-size: 0.9em;
      line-height: 1.4;
    }

    code {
      font-family: "Consolas", "Monaco", "Courier New", monospace;
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }

    pre code {
      background: transparent;
      padding: 0;
    }

    blockquote {
      border-left: 4px solid #ddd;
      padding-left: 1em;
      margin: 1em 0;
      color: #666;
      font-style: italic;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }

    th {
      background: #f5f5f5;
      font-weight: 600;
    }

    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 1em 0;
    }

    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 1.5em 0;
    }
  </style>
</head>
<body>
  <div class="slide-content">
    ${await this.renderMarkdown(markdown)}
  </div>
</body>
</html>`

    return html
  }

  /**
   * 渲染 Markdown 为 HTML
   * @param {string} markdown - Markdown 内容
   * @returns {Promise<string>} HTML 内容
   */
  async renderMarkdown(markdown) {
    // 简单的 Markdown 转 HTML（生产环境应使用 marked）
    let html = markdown

    // 代码块
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${this.escapeHtml(code.trim())}</code></pre>`
    })

    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

    // 标题
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

    // 图片
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')

    // 引用
    html = html.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')

    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // 斜体
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

    // 水平线
    html = html.replace(/^---$/gm, '<hr>')

    // 无序列表
    html = html.replace(/^\-\s+(.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>\n${match}</ul>`)

    // 有序列表
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')

    // 段落
    html = html.replace(/\n\n/g, '</p><p>')
    html = '<p>' + html + '</p>'

    // 清理空段落
    html = html.replace(/<p>\s*<\/p>/g, '')
    html = html.replace(/<\/p><p>/g, '</p>\n<p>')

    return html
  }

  /**
   * 转义 HTML
   * @param {string} text - 文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }
    return text.replace(/[&<>"']/g, m => map[m])
  }

  /**
   * 保存截图
   * @param {string} markdown - Markdown 内容
   * @param {Object} result - 测量结果
   */
  async saveScreenshot(markdown, result) {
    try {
      await fs.mkdir(this.config.screenshotDir, { recursive: true })

      const hash = this.hash(markdown)
      const filename = `slide-${hash}-${result.fits ? 'fit' : 'overflow'}.png`
      const filepath = path.join(this.config.screenshotDir, filename)

      await this.page.screenshot({
        path: filepath,
        fullPage: false
      })

      if (this.config.debug) {
        console.log(`📸 截图已保存: ${filepath}`)
      }
    } catch (err) {
      console.warn(`截图保存失败: ${err.message}`)
    }
  }

  /**
   * 从缓存加载
   * @param {string} markdown - Markdown 内容
   * @param {string} theme - 主题名称
   * @returns {Promise<Object|null>} 缓存的结果
   */
  async loadFromCache(markdown, theme) {
    try {
      const hash = this.hash(markdown)
      const cacheFile = path.join(this.config.cacheDir, `${theme}-${hash}.json`)

      const data = await fs.readFile(cacheFile, 'utf-8')
      return JSON.parse(data)
    } catch {
      return null
    }
  }

  /**
   * 保存到缓存
   * @param {string} markdown - Markdown 内容
   * @param {string} theme - 主题名称
   * @param {Object} result - 测量结果
   */
  async saveToCache(markdown, theme, result) {
    try {
      await fs.mkdir(this.config.cacheDir, { recursive: true })

      const hash = this.hash(markdown)
      const cacheFile = path.join(this.config.cacheDir, `${theme}-${hash}.json`)

      await fs.writeFile(cacheFile, JSON.stringify(result, null, 2))
    } catch (err) {
      console.warn(`缓存保存失败: ${err.message}`)
    }
  }

  /**
   * 计算内容的哈希值
   * @param {string} content - 内容
   * @returns {string} 哈希值
   */
  hash(content) {
    // 简单的哈希函数
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    try {
      const { rm } = require('fs').promises
      await rm(this.config.cacheDir, { recursive: true, force: true })
      console.log('✅ 缓存已清除')
    } catch (err) {
      console.warn(`缓存清除失败: ${err.message}`)
    }
  }

  /**
   * 关闭浏览器
   */
  async close() {
    if (this.context) {
      await this.context.close()
      this.context = null
    }

    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }

    if (this.config.debug) {
      console.log('🔚 浏览器已关闭')
    }
  }
}

module.exports = { BrowserMeasurer }

// 如果直接运行，执行测试
if (require.main === module) {
  const testCases = [
    {
      name: '简单内容',
      markdown: `# Hello World

This is a simple slide.`
    },
    {
      name: '长内容',
      markdown: `# Long Content

## Section 1

This is a long slide with lots of content.

- Item 1
- Item 2
- Item 3
- Item 4
- Item 5
- Item 6

## Section 2

\`\`\`javascript
function hello() {
  console.log('Line 1');
  console.log('Line 2');
  console.log('Line 3');
  console.log('Line 4');
  console.log('Line 5');
}
\`\`\`

## Section 3

More content here.

And even more content.`
    },
    {
      name: '代码块',
      markdown: `# Code Example

\`\`\`javascript
function example() {
  return true;
}
\`\`\``
    }
  ]

  async function runTests() {
    const measurer = new BrowserMeasurer({
      debug: true,
      screenshot: false
    })

    console.log('🧪 Browser Measurer 测试\n')

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i]
      console.log(`\n--- ${testCase.name} ---`)

      try {
        const result = await measurer.measureSlide(testCase.markdown)
        console.log(`结果:`)
        console.log(`  高度: ${result.height}px`)
        console.log(`  可用: ${result.available}px`)
        console.log(`  占比: ${result.percentage}%`)
        console.log(`  适配: ${result.fits ? '✅' : '❌'}`)
      } catch (err) {
        console.error(`❌ 失败: ${err.message}`)
      }
    }

    await measurer.close()
    console.log('\n✅ 测试完成')
    process.exit(0)
  }

  runTests().catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
}

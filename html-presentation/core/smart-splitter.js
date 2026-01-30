#!/usr/bin/env node

/**
 * Smart Splitter
 * 基于内容高度测量的智能拆分系统
 * @version 1.0.0
 */

const { ContentMeasurer } = require('./content-measurer.js')

/**
 * 智能拆分器类
 * 用于判断内容是否需要拆分，并生成拆分方案
 */
class SmartSplitter {
  constructor(measurer = null) {
    this.measurer = measurer || new ContentMeasurer()
  }

  /**
   * 判断是否需要拆分
   * @param {string} markdown - Markdown 内容
   * @returns {Object} 拆分决策结果
   */
  shouldSplit(markdown) {
    const measurement = this.measurer.measureSlide(markdown)

    return {
      shouldSplit: !measurement.fits,
      reason: this.getReason(measurement),
      measurement,
      suggestedSplits: measurement.fits ? [] : this.suggestSplits(markdown, measurement)
    }
  }

  /**
   * 获取拆分原因
   * @param {Object} measurement - 测量结果
   * @returns {string} 拆分原因描述
   */
  getReason(measurement) {
    if (measurement.percentage > 150) {
      return `内容超出页面 ${Math.round(measurement.percentage - 100)}%，必须拆分`
    }
    if (measurement.percentage > 120) {
      return `内容超出页面 ${Math.round(measurement.percentage - 100)}%，建议拆分`
    }
    if (measurement.percentage > 100) {
      return `内容略超页面 (${measurement.percentage}%)，可以考虑拆分`
    }
    return '内容适配良好，无需拆分'
  }

  /**
   * 建议拆分方案
   * @param {string} markdown - Markdown 内容
   * @param {Object} measurement - 测量结果
   * @returns {Array} 拆分方案列表
   */
  suggestSplits(markdown, measurement) {
    const { breakdown } = measurement

    // 策略 1: 按 H2 标题拆分
    const h2Splits = this.splitByHeadings(markdown, breakdown, 2)
    if (h2Splits.length > 1) {
      return h2Splits.map((split, index) => ({
        ...split,
        confidence: 0.95,
        reason: '按 H2 标题拆分',
        splitIndex: index + 1
      }))
    }

    // 策略 2: 按 H3 标题拆分
    const h3Splits = this.splitByHeadings(markdown, breakdown, 3)
    if (h3Splits.length > 1) {
      return h3Splits.map((split, index) => ({
        ...split,
        confidence: 0.85,
        reason: '按 H3 标题拆分',
        splitIndex: index + 1
      }))
    }

    // 策略 3: 代码块独立
    const codeSplit = this.splitCodeBlocks(markdown, breakdown)
    if (codeSplit && codeSplit.length > 1) {
      return codeSplit.map((split, index) => ({
        ...split,
        confidence: 0.90,
        reason: '代码块独立成页',
        splitIndex: index + 1
      }))
    }

    // 策略 4: 大段文字拆分
    const textSplit = this.splitLongText(markdown, breakdown)
    if (textSplit && textSplit.length > 1) {
      return textSplit.map((split, index) => ({
        ...split,
        confidence: 0.75,
        reason: '按内容比例拆分',
        splitIndex: index + 1
      }))
    }

    // 策略 5: 按比例拆分（最后手段）
    return this.splitByRatio(markdown, measurement)
  }

  /**
   * 按标题拆分
   * @param {string} markdown - Markdown 内容
   * @param {Array} breakdown - 内容分析结果
   * @param {number} level - 标题级别 (1-4)
   * @returns {Array} 拆分方案
   */
  splitByHeadings(markdown, breakdown, level) {
    const headingKey = `h${level}`
    const headings = breakdown.filter(e => e.type === 'heading' && e.level === level)

    if (headings.length < 2) {
      return []
    }

    const lines = markdown.split('\n')
    const splits = []

    for (let i = 0; i < headings.length; i++) {
      const start = headings[i].line
      const end = headings[i + 1]?.line || lines.length

      const title = headings[i].text
      const content = lines.slice(start, end).join('\n').trim()

      if (content.length > 0) {
        splits.push({
          title,
          content,
          suggestedLayout: this.guessLayout(content)
        })
      }
    }

    return splits
  }

  /**
   * 代码块独立拆分
   * @param {string} markdown - Markdown 内容
   * @param {Array} breakdown - 内容分析结果
   * @returns {Array|null} 拆分方案
   */
  splitCodeBlocks(markdown, breakdown) {
    const codeBlocks = breakdown.filter(e => e.type === 'code')

    if (codeBlocks.length === 0) {
      return null
    }

    const availableHeight = this.measurer.getAvailableHeight()
    const largeCodeBlocks = codeBlocks.filter(code => {
      const codeHeight = this.measurer.estimateElementHeight(code)
      return codeHeight > availableHeight * 0.5
    })

    if (largeCodeBlocks.length === 0) {
      return null
    }

    const lines = markdown.split('\n')
    const splits = []

    // 找出所有代码块的位置
    for (const codeBlock of largeCodeBlocks) {
      const start = codeBlock.startLine
      const end = start + codeBlock.lines + 1

      const codeContent = lines.slice(start, end).join('\n').trim()

      splits.push({
        title: '代码实现',
        content: codeContent,
        suggestedLayout: 'code-focus'
      })
    }

    // 提取非代码内容
    const nonCodeContent = this.extractNonCode(markdown, largeCodeBlocks)
    if (nonCodeContent.trim().length > 50) {
      splits.push({
        title: '说明',
        content: nonCodeContent,
        suggestedLayout: 'single-col'
      })
    }

    return splits.length > 1 ? splits : null
  }

  /**
   * 提取非代码内容
   * @param {string} markdown - Markdown 内容
   * @param {Array} codeBlocks - 代码块列表
   * @returns {string} 非代码内容
   */
  extractNonCode(markdown, codeBlocks) {
    const lines = markdown.split('\n')
    const excludeRanges = []

    for (const codeBlock of codeBlocks) {
      excludeRanges.push({
        start: codeBlock.startLine,
        end: codeBlock.startLine + codeBlock.lines + 1
      })
    }

    const result = []
    for (let i = 0; i < lines.length; i++) {
      const isExcluded = excludeRanges.some(range =>
        i >= range.start && i < range.end
      )
      if (!isExcluded) {
        result.push(lines[i])
      }
    }

    return result.join('\n').trim()
  }

  /**
   * 大段文字拆分
   * @param {string} markdown - Markdown 内容
   * @param {Array} breakdown - 内容分析结果
   * @returns {Array|null} 拆分方案
   */
  splitLongText(markdown, breakdown) {
    const paragraphs = breakdown.filter(e => e.type === 'paragraph')
    const totalParagraphs = paragraphs.length

    if (totalParagraphs < 4) {
      return null
    }

    // 计算每个段落的位置
    const lines = markdown.split('\n')
    const midPoint = Math.floor(lines.length / 2)

    // 寻找最近的空行作为拆分点
    let splitPoint = midPoint
    for (let i = midPoint; i > midPoint - 10 && i > 0; i--) {
      if (lines[i].trim() === '') {
        splitPoint = i
        break
      }
    }

    const part1 = lines.slice(0, splitPoint).join('\n').trim()
    const part2 = lines.slice(splitPoint).join('\n').trim()

    return [
      {
        title: '内容（第一部分）',
        content: part1,
        suggestedLayout: 'single-col'
      },
      {
        title: '内容（第二部分）',
        content: part2,
        suggestedLayout: 'single-col'
      }
    ]
  }

  /**
   * 按比例拆分（最后手段）
   * @param {string} markdown - Markdown 内容
   * @param {Object} measurement - 测量结果
   * @returns {Array} 拆分方案
   */
  splitByRatio(markdown, measurement) {
    const targetSplitCount = Math.ceil(measurement.percentage / 100)
    const lines = markdown.split('\n')
    const linesPerSplit = Math.ceil(lines.length / targetSplitCount)

    const splits = []

    for (let i = 0; i < targetSplitCount; i++) {
      const start = i * linesPerSplit
      let end = Math.min((i + 1) * linesPerSplit, lines.length)

      // 尝试在段落边界拆分
      end = this.findNearestBreakPoint(lines, start, end)

      const content = lines.slice(start, end).join('\n').trim()

      if (content.length > 0) {
        splits.push({
          title: `内容 ${i + 1}`,
          content,
          suggestedLayout: this.guessLayout(content)
        })
      }
    }

    return splits
  }

  /**
   * 寻找最近的拆分点（段落边界）
   * @param {Array} lines - 行数组
   * @param {number} start - 起始位置
   * @param {number} end - 结束位置
   * @returns {number} 调整后的结束位置
   */
  findNearestBreakPoint(lines, start, end) {
    // 从 end 向前查找空行
    const searchRange = Math.min(15, end - start - 1)
    for (let i = end; i > end - searchRange && i > start + 1; i--) {
      if (lines[i].trim() === '') {
        return i
      }
    }
    return end
  }

  /**
   * 猜测布局
   * @param {string} content - 内容
   * @returns {string} 布局名称
   */
  guessLayout(content) {
    const analysis = this.measurer.analyzeContent(content)

    // 代码为主
    const codeCount = analysis.filter(e => e.type === 'code').length
    const codeLines = analysis
      .filter(e => e.type === 'code')
      .reduce((sum, e) => sum + e.lines, 0)

    if (codeCount > 0 && codeLines > 10) {
      return 'code-focus'
    }

    // 多个列表项
    const listCount = analysis.filter(e => e.type === 'listItem').length
    if (listCount >= 6) {
      return 'card-grid'
    }
    if (listCount >= 2) {
      return 'two-col'
    }

    // 有图片
    const hasImage = analysis.some(e => e.type === 'image')
    if (hasImage) {
      return 'image-right'
    }

    // 默认
    return 'single-col'
  }

  /**
   * 自动拆分并返回拆分后的内容
   * @param {string} markdown - Markdown 内容
   * @returns {Object} { splits, original }
   */
  autoSplit(markdown) {
    const decision = this.shouldSplit(markdown)

    if (!decision.shouldSplit) {
      return {
        split: false,
        content: markdown,
        measurement: decision.measurement
      }
    }

    const splits = decision.suggestedSplits

    // 验证每个拆分是否适配
    const validatedSplits = splits.map(split => {
      const measurement = this.measurer.measureSlide(split.content)
      return {
        ...split,
        measurement,
        fits: measurement.fits
      }
    })

    return {
      split: true,
      splits: validatedSplits,
      reason: decision.reason
    }
  }
}

module.exports = { SmartSplitter }

// 如果直接运行此文件，执行测试
if (require.main === module) {
  const splitter = new SmartSplitter()

  // 测试用例
  const testCases = [
    {
      name: '简单内容（无需拆分）',
      content: `# Title

This is a simple slide.`
    },
    {
      name: '长内容（需要拆分）',
      content: `# Complete Guide

## Introduction

This is a long introduction paragraph with lots of text that spans multiple lines. It contains detailed information about the topic.

## Features

Here are the main features:
- Feature 1 with detailed description
- Feature 2 with detailed explanation
- Feature 3 with detailed information
- Feature 4 with detailed notes
- Feature 5 with detailed details
- Feature 6 with detailed content

## Code Example

\`\`\`javascript
function example() {
  console.log('Line 1');
  console.log('Line 2');
  console.log('Line 3');
  console.log('Line 4');
  console.log('Line 5');
  console.log('Line 6');
  console.log('Line 7');
  console.log('Line 8');
  return true;
}
\`\`\`

## More Content

This is additional content that makes the slide even longer and requires splitting.

## Conclusion

Final conclusion paragraph.`
    }
  ]

  console.log('🔪 Smart Splitter 测试\n')

  for (const testCase of testCases) {
    console.log(`--- ${testCase.name} ---`)

    const result = splitter.autoSplit(testCase.content)

    if (result.split) {
      console.log(`✂️  需要拆分: ${result.reason}`)
      console.log(`📦 拆分为 ${result.splits.length} 部分:\n`)

      result.splits.forEach((split, i) => {
        console.log(`  ${i + 1}. ${split.title}`)
        console.log(`     布局: ${split.suggestedLayout}`)
        console.log(`     适配: ${split.fits ? '✅' : '❌'} (${split.measurement.percentage}%)`)
        console.log(`     置信度: ${split.confidence || 'N/A'}\n`)
      })
    } else {
      console.log(`✅ 无需拆分`)
      console.log(`   占用: ${result.measurement.percentage}%\n`)
    }
  }
}

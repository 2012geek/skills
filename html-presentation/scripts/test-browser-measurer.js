#!/usr/bin/env node

/**
 * Browser Measurer 综合测试脚本
 * 测试浏览器测量模式、缓存、截图等功能
 */

const { ContentMeasurer } = require('../core/content-measurer.js')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function success(message) { log(`✅ ${message}`, 'green') }
function error(message) { log(`❌ ${message}`, 'red') }
function warn(message) { log(`⚠️  ${message}`, 'yellow') }
function info(message) { log(`ℹ️  ${message}`, 'blue') }
function dim(message) { log(message, 'gray') }
function header(message) { log(message, 'cyan') }

// 测试内容
const testSlides = {
  simple: {
    name: '简单内容',
    markdown: `# Hello World

This is a simple slide with minimal content.

- Point 1
- Point 2`
  },

  medium: {
    name: '中等内容',
    markdown: `# Medium Content

## Overview

This slide has a moderate amount of content.

### Key Points

- First important point
- Second important point
- Third important point

### Details

Some additional details here.`
  },

  long: {
    name: '长内容（超出）',
    markdown: `# Long Content Slide

## Section One

This is the first section with quite a bit of content that should exceed the slide height.

- Item 1 with description
- Item 2 with description
- Item 3 with description
- Item 4 with description
- Item 5 with description

## Section Two

More content here to make the slide even longer.

\`\`\`javascript
function longFunction() {
  console.log('Line 1');
  console.log('Line 2');
  console.log('Line 3');
  console.log('Line 4');
  console.log('Line 5');
  console.log('Line 6');
  return true;
}
\`\`\`

## Section Three

Even more content!

And a final paragraph to ensure overflow.`
  },

  code: {
    name: '代码为主',
    markdown: `# Code Example

\`\`\`javascript
class Calculator {
  constructor() {
    this.result = 0;
  }

  add(a, b) {
    this.result = a + b;
    return this;
  }

  subtract(a, b) {
    this.result = a - b;
    return this;
  }

  multiply(a, b) {
    this.result = a * b;
    return this;
  }

  getResult() {
    return this.result;
  }
}
\`\`\`
`
  },

  mixed: {
    name: '混合内容',
    markdown: `# Mixed Content

## Text Section

Some introductory text with a list:

- Feature A
- Feature B
- Feature C

## Code Section

\`\`\`python
def example():
    return "Hello, World!"
\`\`\`

## Image Section

![Example Image](https://via.placeholder.com/600x400)

## Conclusion

Final thoughts here.`
  }
}

// 测试套件
async function runTests() {
  header('\n🧪 Browser Measurer 综合测试\n')
  header('='.repeat(70))

  console.log('测试环境:')
  dim(`   Node.js: ${process.version}`)
  dim(`   Playwright: ${require('playwright').version || 'installed'}`)
  dim(`   工作目录: ${process.cwd()}`)
  console.log()

  const results = {
    estimate: { passed: 0, failed: 0 },
    browser: { passed: 0, failed: 0, skipped: false },
    comparison: { different: 0, same: 0 }
  }

  // ========================================
  // 测试 1: 估算模式（基准测试）
  // ========================================
  header('\n📊 测试 1: 估算模式（基准）')
  header('-'.repeat(70))

  const estimateMeasurer = new ContentMeasurer({
    mode: 'estimate',
    slideWidth: 1280,
    slideHeight: 720
  })

  const estimateResults = {}

  for (const [key, slide] of Object.entries(testSlides)) {
    try {
      const startTime = Date.now()
      const result = await estimateMeasurer.measureSlide(slide.markdown)
      const elapsed = Date.now() - startTime

      estimateResults[key] = result
      results.estimate.passed++

      dim(`\n${slide.name}:`)
      dim(`   高度: ${result.height}px / ${result.available}px`)
      dim(`   占比: ${result.percentage}%`)
      dim(`   适配: ${result.fits ? '✅' : '❌'}`)
      dim(`   耗时: ${elapsed}ms`)

    } catch (err) {
      results.estimate.failed++
      error(`${slide.name} 失败: ${err.message}`)
    }
  }

  success(`\n估算模式测试完成: ${results.estimate.passed}/${results.estimate.passed + results.estimate.failed}`)

  // ========================================
  // 测试 2: 浏览器模式（核心功能）
  // ========================================
  header('\n🌐 测试 2: 浏览器模式（核心）')
  header('-'.repeat(70))

  const browserMeasurer = new ContentMeasurer({
    mode: 'browser',
    slideWidth: 1280,
    slideHeight: 720,
    debug: false,
    headless: true
  })

  const browserResults = {}

  for (const [key, slide] of Object.entries(testSlides)) {
    try {
      const startTime = Date.now()
      const result = await browserMeasurer.measureSlide(slide.markdown, {
        theme: 'seriph',
        useCache: true
      })
      const elapsed = Date.now() - startTime

      browserResults[key] = result
      results.browser.passed++

      dim(`\n${slide.name}:`)
      dim(`   高度: ${result.height}px / ${result.available}px`)
      dim(`   占比: ${result.percentage}%`)
      dim(`   适配: ${result.fits ? '✅' : '❌'}`)
      dim(`   模式: ${result.mode}`)
      dim(`   耗时: ${elapsed}ms`)

      // 对比结果
      if (estimateResults[key]) {
        const diff = Math.abs(result.percentage - estimateResults[key].percentage)
        if (diff > 10) {
          results.comparison.different++
          dim(`   ⚠️  与估算差异: ${diff}%`, 'yellow')
        } else {
          results.comparison.same++
        }
      }

    } catch (err) {
      results.browser.failed++
      error(`${slide.name} 失败: ${err.message}`)

      if (err.message.includes('初始化失败') || err.message.includes('Playwright')) {
        results.browser.skipped = true
        warn('浏览器模式不可用，跳过后续测试')
        break
      }
    }
  }

  // 清理浏览器资源
  await browserMeasurer.close()

  if (!results.browser.skipped) {
    success(`\n浏览器模式测试完成: ${results.browser.passed}/${results.browser.passed + results.browser.failed}`)
  }

  // ========================================
  // 测试 3: 缓存性能
  // ========================================
  if (!results.browser.skipped && results.browser.passed > 0) {
    header('\n💾 测试 3: 缓存性能')
    header('-'.repeat(70))

    const cacheTestSlide = testSlides.medium

    // 第一次调用（未缓存）
    const start1 = Date.now()
    await browserMeasurer.measureSlide(cacheTestSlide.markdown, { useCache: true })
    const time1 = Date.now() - start1

    // 第二次调用（使用缓存）
    const start2 = Date.now()
    await browserMeasurer.measureSlide(cacheTestSlide.markdown, { useCache: true })
    const time2 = Date.now() - start2

    info(`首次调用: ${time1}ms`)
    info(`缓存调用: ${time2}ms`)
    info(`加速比: ${(time1 / time2).toFixed(1)}x`)

    if (time2 < time1) {
      success('缓存功能正常')
    } else {
      warn('缓存可能未生效')
    }
  }

  // ========================================
  // 汇总结果
  // ========================================
  header('\n' + '='.repeat(70))
  header('📋 测试汇总')
  header('='.repeat(70))

  console.log('\n估算模式:')
  dim(`   通过: ${results.estimate.passed}`)
  dim(`   失败: ${results.estimate.failed}`)

  console.log('\n浏览器模式:')
  if (results.browser.skipped) {
    warn('   跳过（Playwright 不可用）')
  } else {
    dim(`   通过: ${results.browser.passed}`)
    dim(`   失败: ${results.browser.failed}`)
  }

  console.log('\n结果对比:')
  dim(`   一致: ${results.comparison.same}`)
  dim(`   差异较大: ${results.comparison.different}`)

  // 总结
  console.log()
  if (results.browser.skipped) {
    warn('⚠️  浏览器模式未测试（Playwright 安装问题）')
    info('   检查: npx playwright install chromium')
  } else if (results.browser.passed > 0) {
    success('✅ 浏览器测量功能正常')
  } else {
    error('❌ 浏览器测量功能失败')
  }

  console.log()
}

// 运行测试
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0)
    })
    .catch(err => {
      error(`\n测试套件失败: ${err.message}`)
      console.error(err.stack)
      process.exit(1)
    })
}

module.exports = { runTests }

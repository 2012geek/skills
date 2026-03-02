#!/usr/bin/env node

/**
 * AI Processor 测试脚本
 * 测试 AI API 调用、重试机制、统计功能
 */

const { AIProcessor } = require('../core/ai-processor.js')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function success(message) { log(`✅ ${message}`, 'green') }
function error(message) { log(`❌ ${message}`, 'red') }
function warn(message) { log(`⚠️  ${message}`, 'yellow') }
function info(message) { log(`ℹ️  ${message}`, 'blue') }
function dim(message) { log(message, 'gray') }

// 测试用例
const tests = [
  {
    name: '测试 1: 降级模式（无 AI）',
    processor: { enabled: false },
    markdown: `# Test Slide

- Item 1
- Item 2`,
    expectsFallback: true
  },
  {
    name: '测试 2: 内容分析',
    processor: { enabled: true, debug: false },
    markdown: `# Code Example

This is a code slide.

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\``,
    testAnalysis: true
  },
  {
    name: '测试 3: 布局决策',
    processor: { enabled: true, debug: false },
    markdown: `# Features

- Feature 1
- Feature 2
- Feature 3
- Feature 4`,
    testLayout: true
  }
]

async function runTest(test, index) {
  console.log(`\n${'='.repeat(60)}`)
  info(`${index + 1}. ${test.name}`)
  console.log('='.repeat(60))

  const processor = new AIProcessor(test.processor)

  // 检查是否启用了 AI
  if (test.processor.enabled && !processor.config.enabled) {
    warn('AI 未启用（未设置 ANTHROPIC_API_KEY）')
    dim('   设置环境变量以测试 AI 功能:')
    dim('   export ANTHROPIC_API_KEY=your-key-here')
    return { skipped: true }
  }

  try {
    const startTime = Date.now()
    const result = await processor.processSlide(test.markdown, { optimize: false })
    const elapsed = Date.now() - startTime

    success(`处理完成 (${elapsed}ms)`)

    // 显示结果
    if (test.testAnalysis) {
      dim(`   布局: ${result.layout}`)
      dim(`   质量: ${result.quality.score}/100`)
    }

    if (test.testLayout) {
      dim(`   推荐布局: ${result.layout}`)
    }

    // 显示统计
    const stats = processor.getStats()
    if (stats.totalCalls > 0) {
      info('\n📊 统计信息:')
      dim(`   总调用: ${stats.totalCalls}`)
      dim(`   成功: ${stats.successfulCalls}`)
      dim(`   失败: ${stats.failedCalls}`)
      dim(`   成功率: ${stats.successRate}`)
      dim(`   Token 使用: ${stats.totalTokens}`)
      dim(`   预估成本: ${stats.estimatedCost}`)
    }

    return { success: true, result, stats }

  } catch (err) {
    error(`测试失败: ${err.message}`)
    return { success: false, error: err.message }
  }
}

async function runAllTests() {
  console.log('\n🧪 AI Processor 测试套件\n')
  console.log('测试环境:')
  dim(`   Node.js: ${process.version}`)
  dim(`   ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '已设置' : '未设置'}`)

  const results = []

  for (let i = 0; i < tests.length; i++) {
    const result = await runTest(tests[i], i)
    results.push(result)
  }

  // 汇总
  console.log(`\n${'='.repeat(60)}`)
  info('测试汇总')
  console.log('='.repeat(60))

  const passed = results.filter(r => r.success).length
  const failed = results.filter(r => r.success === false).length
  const skipped = results.filter(r => r.skipped).length

  success(`通过: ${passed}`)
  if (failed > 0) error(`失败: ${failed}`)
  if (skipped > 0) warn(`跳过: ${skipped}`)

  // 总统计
  const totalStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalTokens: 0,
    totalCost: 0
  }

  results.forEach(r => {
    if (r.stats) {
      totalStats.totalCalls += r.stats.totalCalls
      totalStats.successfulCalls += r.stats.successfulCalls
      totalStats.failedCalls += r.stats.failedCalls
      totalStats.totalTokens += r.stats.totalTokens
      totalStats.totalCost += r.stats.totalCost
    }
  })

  if (totalStats.totalCalls > 0) {
    info('\n💰 总体成本估算:')
    dim(`   总调用: ${totalStats.totalCalls}`)
    dim(`   Token 使用: ${totalStats.totalTokens}`)
    dim(`   预估成本: $${totalStats.totalCost.toFixed(6)}`)
  }

  console.log()

  return {
    passed,
    failed,
    skipped,
    results
  }
}

// 运行测试
if (require.main === module) {
  runAllTests()
    .then(summary => {
      if (summary.failed > 0) {
        process.exit(1)
      }
    })
    .catch(err => {
      error(`测试套件失败: ${err.message}`)
      console.error(err.stack)
      process.exit(1)
    })
}

module.exports = { runAllTests }

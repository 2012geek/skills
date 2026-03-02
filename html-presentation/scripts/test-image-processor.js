#!/usr/bin/env node

/**
 * Image Processor 测试脚本
 * 测试图片优化、格式转换、元数据提取等功能
 */

const { ImageProcessor } = require('../core/image-processor.js')
const { ImageAnalyzer } = require('../core/image-analyzer.js')
const fs = require('fs').promises
const path = require('path')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
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
function highlight(message) { log(message, 'magenta') }

// 创建测试图片目录
async function setupTestEnvironment() {
  const testDir = path.join(process.cwd(), '.test-images')
  await fs.mkdir(testDir, { recursive: true })
  return testDir
}

// 测试数据
const testImages = {
  // 本地生成测试图片（使用 Canvas 或占位符）
  remote: [
    'https://via.placeholder.com/1920x1080.png',
    'https://via.placeholder.com/800x600.jpg',
    'https://via.placeholder.com/300x200.gif',
    'https://via.placeholder.com/2560x1440.png'
  ]
}

// 测试套件
async function runTests() {
  header('\n🖼️  Image Processor 测试套件\n')
  header('='.repeat(70))

  console.log('测试环境:')
  dim(`   Node.js: ${process.version}`)
  dim(`   Sharp: ${require('sharp') ? 'installed' : 'NOT installed'}`)
  dim(`   工作目录: ${process.cwd()}`)
  console.log()

  const results = {
    download: { passed: 0, failed: 0 },
    optimize: { passed: 0, failed: 0 },
    analyze: { passed: 0, failed: 0 },
    batch: { passed: 0, failed: 0 }
  }

  // ========================================
  // 测试 1: 图片下载
  // ========================================
  header('\n📥 测试 1: 图片下载')
  header('-'.repeat(70))

  try {
    const testDir = await setupTestEnvironment()
    const processor = new ImageProcessor({
      cacheDir: path.join(testDir, 'images'),
      skipExisting: true
    })

    const testMarkdown = `# Test Slide

Remote image:
![Remote Image](https://via.placeholder.com/800x600)

Another remote:
<img src="https://via.placeholder.com/400x300/6366f1/ffffff?text=Test" alt="HTML Image">
`

    const { updatedMarkdown, stats } = await processor.processImages(
      testMarkdown,
      testDir
    )

    if (stats.errors.length === 0) {
      results.download.passed++
      success('图片下载测试通过')
      dim(`   处理: ${stats.processed} 张`)
      dim(`   已缓存: ${stats.cached} 张`)
    } else {
      results.download.failed++
      warn(`部分图片下载失败: ${stats.errors.length} 张`)
    }

  } catch (err) {
    results.download.failed++
    error(`图片下载测试失败: ${err.message}`)
  }

  // ========================================
  // 测试 2: 图片优化
  // ========================================
  header('\n⚡ 测试 2: 图片优化')
  header('-'.repeat(70))

  try {
    const processor = new ImageProcessor()
    const testDir = await setupTestEnvironment()
    const testImagePath = path.join(testDir, 'test-large.png')

    // 创建一个测试图片（使用 Sharp 绘制）
    await createTestImage(testImagePath, 1920, 1080)

    dim('原始图片:')
    dim(`   路径: ${testImagePath}`)
    const originalStats = await fs.stat(testImagePath)
    dim(`   大小: ${formatBytes(originalStats.size)}`)

    // 测试 WebP 转换
    const optimizeResult = await processor.optimizeImage(testImagePath, {
      format: 'webp',
      quality: 85,
      maxWidth: 1280,
      maxHeight: 720
    })

    if (optimizeResult.optimized) {
      results.optimize.passed++
      success('图片优化测试通过')

      dim('优化结果:')
      dim(`   格式: ${optimizeResult.original.format} → ${optimizeResult.optimized.format}`)
      dim(`   尺寸: ${optimizeResult.original.width}x${optimizeResult.original.height} → ${optimizeResult.optimized.width}x${optimizeResult.optimized.height}`)
      dim(`   大小: ${optimizeResult.original.sizeFormatted} → ${optimizeResult.optimized.sizeFormatted}`)
      highlight(`   节省: ${optimizeResult.savings.formatted}`)

      if (optimizeResult.savings.percent > 10) {
        success(`显著节省空间: ${optimizeResult.savings.percent.toFixed(1)}%`)
      }
    } else {
      results.optimize.failed++
      error('图片优化失败')
    }

  } catch (err) {
    results.optimize.failed++
    error(`图片优化测试失败: ${err.message}`)

    if (err.message.includes('sharp')) {
      warn('Sharp 可能未正确安装')
    }
  }

  // ========================================
  // 测试 3: 图片分析
  // ========================================
  header('\n🔍 测试 3: 图片元数据分析')
  header('-'.repeat(70))

  try {
    const analyzer = new ImageAnalyzer()
    const testDir = await setupTestEnvironment()
    const testImagePath = path.join(testDir, 'test-analyze.png')

    // 创建测试图片
    await createTestImage(testImagePath, 1200, 800)

    const metadata = await analyzer.analyzeImage(testImagePath)

    results.analyze.passed++
    success('图片分析测试通过')

    dim('元数据:')
    dim(`   格式: ${metadata.format}`)
    dim(`   尺寸: ${metadata.size.width}x${metadata.size.height}`)
    dim(`   宽高比: ${metadata.size.aspectRatio}`)
    dim(`   百万像素: ${metadata.size.megapixels}MP`)
    dim(`   文件大小: ${metadata.file.sizeFormatted}`)

    dim('色彩信息:')
    dim(`   通道: ${metadata.color.channels}`)
    dim(`   Alpha通道: ${metadata.color.hasAlpha ? '是' : '否'}`)

    dim('质量评估:')
    dim(`   清晰度: ${metadata.quality.sharpness.toFixed(1)}/100`)
    dim(`   亮度: ${metadata.quality.brightness}/100`)
    dim(`   对比度: ${metadata.quality.contrast.toFixed(1)}/100`)
    dim(`   总体质量: ${metadata.quality.overall}/100`)

    dim('幻灯片建议:')
    dim(`   类型: ${metadata.type}`)
    dim(`   缩放比例: ${metadata.recommendations.scale}x`)
    dim(`   建议布局: ${metadata.recommendations.layout}`)
    dim(`   放置位置: ${metadata.recommendations.suggestedPlacement}`)

  } catch (err) {
    results.analyze.failed++
    error(`图片分析测试失败: ${err.message}`)
  }

  // ========================================
  // 测试 4: 批量处理
  // ========================================
  header('\n📦 测试 4: 批量处理')
  header('-'.repeat(70))

  try {
    const processor = new ImageProcessor()
    const testDir = await setupTestEnvironment()

    // 创建多个测试图片
    const testImages = []
    for (let i = 1; i <= 3; i++) {
      const imagePath = path.join(testDir, `batch-${i}.png`)
      await createTestImage(imagePath, 800 + i * 200, 600 + i * 150)
      testImages.push(imagePath)
    }

    const batchResults = await processor.optimizeBatch(testImages, {
      format: 'webp',
      quality: 80
    })

    const successful = batchResults.filter(r => r.success).length
    results.batch.passed += successful
    results.batch.failed += batchResults.length - successful

    success(`批量处理完成: ${successful}/${batchResults.length}`)

    let totalSaved = 0
    batchResults.forEach(r => {
      if (r.savings) totalSaved += r.savings.bytes
    })

    if (totalSaved > 0) {
      highlight(`总节省: ${formatBytes(totalSaved)}`)
    }

  } catch (err) {
    results.batch.failed++
    error(`批量处理测试失败: ${err.message}`)
  }

  // ========================================
  // 测试汇总
  // ========================================
  header('\n' + '='.repeat(70))
  header('📋 测试汇总')
  header('='.repeat(70))

  console.log('\n图片下载:')
  dim(`   通过: ${results.download.passed}`)
  dim(`   失败: ${results.download.failed}`)

  console.log('\n图片优化:')
  dim(`   通过: ${results.optimize.passed}`)
  dim(`   失败: ${results.optimize.failed}`)

  console.log('\n图片分析:')
  dim(`   通过: ${results.analyze.passed}`)
  dim(`   失败: ${results.analyze.failed}`)

  console.log('\n批量处理:')
  dim(`   通过: ${results.batch.passed}`)
  dim(`   失败: ${results.batch.failed}`)

  // 总结
  console.log()
  const totalPassed = results.download.passed +
                       results.optimize.passed +
                       results.analyze.passed +
                       results.batch.passed
  const totalFailed = results.download.failed +
                       results.optimize.failed +
                       results.analyze.failed +
                       results.batch.failed

  if (totalFailed === 0) {
    success('✅ 所有测试通过!')
  } else {
    warn(`⚠️  部分测试失败: ${totalFailed}/${totalPassed + totalFailed}`)
  }

  console.log()
}

// 辅助函数：创建测试图片
async function createTestImage(filePath, width, height) {
  const sharp = require('sharp')

  // 创建一个简单的渐变图片作为测试
  await sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: { r: 100, g: 150, b: 200 }
    }
  })
  .png()
  .toFile(filePath)
}

// 辅助函数：格式化字节
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
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

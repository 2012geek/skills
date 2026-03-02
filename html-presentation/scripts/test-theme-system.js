#!/usr/bin/env node

/**
 * Theme System 测试脚本
 * 测试主题下载、管理、切换等功能
 */

const { ThemeManager } = require('../core/theme-manager.js')
const { ThemeSystem } = require('../core/theme-system.js')

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

// 测试套件
function runTests() {
  header('\n🎨 Theme System 测试套件\n')
  header('='.repeat(70))

  console.log('测试环境:')
  dim(`   Node.js: ${process.version}`)
  dim(`   工作目录: ${process.cwd()}`)
  console.log()

  const results = {
    list: { passed: 0, failed: 0 },
    info: { passed: 0, failed: 0 },
    config: { passed: 0, failed: 0 },
    css: { passed: 0, failed: 0 },
    validate: { passed: 0, failed: 0 },
    switch: { passed: 0, failed: 0 }
  }

  return async () => {
    await runTests()
  }
}

  // ========================================
  // 测试 1: 列出主题
  // ========================================
  header('\n📋 测试 1: 列出主题')
  header('-'.repeat(70))

  try {
    const manager = new ThemeManager({ debug: false })
    await manager.init()

    const list = await manager.listThemes()

    results.list.passed++
    success('主题列表获取成功')

    dim(`总计: ${list.total} 个`)
    dim(`官方: ${list.official} 个`)
    dim(`自定义: ${list.custom} 个`)
    dim(`内置: ${list.builtin.length} 个`)
    dim(`已安装: ${list.installed.length} 个`)
    dim(`可下载: ${list.downloadable.length} 个`)

  } catch (err) {
    results.list.failed++
    error(`主题列表获取失败: ${err.message}`)
  }

  // ========================================
  // 测试 2: 获取主题信息
  // ========================================
  header('\nℹ️  测试 2: 获取主题信息')
  header('-'.repeat(70))

  try {
    const manager = new ThemeManager({ debug: false })
    await manager.init()

    const testThemes = ['seriph', 'dracula', 'nonexistent']

    for (const theme of testThemes) {
      const info = await manager.getThemeInfo(theme)

      if (info) {
        results.info.passed++
        dim(`${theme}:`)
        dim(`   类型: ${info.type}`)
        dim(`   官方: ${info.official}`)
        dim(`   已安装: ${info.installed}`)
      } else {
        results.info.passed++
        dim(`${theme}: 未找到`)
      }
    }

    success('主题信息查询完成')

  } catch (err) {
    results.info.failed++
    error(`主题信息查询失败: ${err.message}`)
  }

  // ========================================
  // 测试 3: 主题配置
  // ========================================
  header('\n⚙️  测试 3: 主题配置生成')
  header('-'.repeat(70))

  try {
    const themeSystem = new ThemeSystem()

    const testThemes = ['seriph', 'dracula', 'default']

    for (const theme of testThemes) {
      const config = themeSystem.getSlidevConfig(theme)

      results.config.passed++
      dim(`${theme}:`)
      dim(`   theme: ${config.theme}`)
      dim(`   highlighter: ${config.highlighter}`)
      dim(`   transition: ${config.transition}`)
    }

    success('配置生成完成')

  } catch (err) {
    results.config.failed++
    error(`配置生成失败: ${err.message}`)
  }

  // ========================================
  // 测试 4: 主题 CSS 变量
  // ========================================
  header('\n🎨 测试 4: CSS 变量生成')
  header('-'.repeat(70))

  try {
    const themeSystem = new ThemeSystem()

    const testThemes = ['seriph', 'dracula']

    for (const theme of testThemes) {
      const css = themeSystem.getThemeCSS(theme)

      results.css.passed++
      dim(`${theme}:`)
      dim(`   --theme-primary: ${css['--theme-primary']}`)
      dim(`   --theme-background: ${css['--theme-background']}`)
      dim(`   --theme-text: ${css['--theme-text']}`)
      dim(`   --theme-accent: ${css['--theme-accent']}`)
    }

    success('CSS 变量生成完成')

  } catch (err) {
    results.css.failed++
    error(`CSS 变量生成失败: ${err.message}`)
  }

  // ========================================
  // 测试 5: 主题验证
  // ========================================
  header('\n✅ 测试 5: 主题验证')
  header('-'.repeat(70))

  try {
    const themeSystem = new ThemeSystem()

    const testCases = [
      { name: 'seriph', valid: true },
      { name: 'invalid@theme', valid: false },
      { name: '123theme', valid: false }
    ]

    for (const testCase of testCases) {
      const validation = themeSystem.validateTheme(testCase.name)

      if (validation.valid === testCase.valid) {
        results.validate.passed++
        success(`${testCase.name}: ${validation.valid ? '有效' : '无效'}`)
      } else {
        results.validate.failed++
        error(`${testCase.name}: 预期 ${testCase.valid}, 实际 ${validation.valid}`)
      }

      if (validation.warnings.length > 0) {
        for (const warning of validation.warnings) {
          warn(`   警告: ${warning}`)
        }
      }
    }

  } catch (err) {
    results.validate.failed++
    error(`主题验证失败: ${err.message}`)
  }

  // ========================================
  // 测试 6: 切换主题
  // ========================================
  header('\n🔄 测试 6: 主题切换')
  header('-'.repeat(70))

  try {
    const themeSystem = new ThemeSystem()

    const switchResult = themeSystem.switchTheme('dracula')

    results.switch.passed++
    success('主题切换成功')

    dim(`配置:`)
    dim(`   theme: ${switchResult.theme}`)
    dim(`   highlighter: ${switchResult.config.highlighter}`)

  } catch (err) {
    results.switch.failed++
    error(`主题切换失败: ${err.message}`)
  }

  // ========================================
  // 测试 7: 缓存管理
  // ========================================
  header('\n💾 测试 7: 缓存管理')
  header('-'.repeat(70))

  try {
    const themeSystem = new ThemeSystem()

    // 添加到缓存
    themeSystem.configCache.set('test-theme', { cached: true })
    dim('缓存设置: test-theme')

    // 检查缓存
    const hasCache = themeSystem.configCache.has('test-theme')
    dim(`缓存存在: ${hasCache}`)

    // 清除缓存
    themeSystem.clearCache()
    const afterClear = themeSystem.configCache.has('test-theme')
    dim(`清除后存在: ${afterClear}`)

    success('缓存管理正常')

  } catch (err) {
    error(`缓存管理失败: ${err.message}`)
  }

  // ========================================
  // 测试 8: 统计信息
  // ========================================
  header('\n📊 测试 8: 统计信息')
  header('-'.repeat(70))

  try {
    const manager = new ThemeManager({ debug: false })
    await manager.init()

    const stats = await manager.getStats()

    success('统计获取成功')

    dim('主题统计:')
    dim(`   总数: ${stats.total}`)
    dim(`   官方: ${stats.official}`)
    dim(`   自定义: ${stats.custom}`)
    dim(`   内置: ${stats.builtin}`)
    dim(`   已安装: ${stats.installed}`)
    dim(`   可下载: ${stats.downloadable}`)

    if (stats.cacheUsage) {
      dim('\n缓存统计:')
      dim(`   文件数: ${stats.cacheUsage.files}`)
      dim(`   大小: ${stats.cacheUsage.totalSizeFormatted}`)
    }

  } catch (err) {
    error(`统计获取失败: ${err.message}`)
  }

  // ========================================
  // 测试汇总
  // ========================================
  header('\n' + '='.repeat(70))
  header('📋 测试汇总')
  header('='.repeat(70))

  console.log('\n列出主题:')
  dim(`   通过: ${results.list.passed}`)
  dim(`   失败: ${results.list.failed}`)

  console.log('\n主题信息:')
  dim(`   通过: ${results.info.passed}`)
  dim(`   失败: ${results.info.failed}`)

  console.log('\n配置生成:')
  dim(`   通过: ${results.config.passed}`)
  dim(`   失败: ${results.config.failed}`)

  console.log('\nCSS 变量:')
  dim(`   通过: ${results.css.passed}`)
  dim(`   失败: ${results.css.failed}`)

  console.log('\n主题验证:')
  dim(`   通过: ${results.validate.passed}`)
  dim(`   失败: ${results.validate.failed}`)

  console.log('\n主题切换:')
  dim(`   通过: ${results.switch.passed}`)
  dim(`   失败: ${results.switch.failed}`)

  // 总结
  console.log()
  const totalPassed = results.list.passed + results.info.passed +
                       results.config.passed + results.css.passed +
                       results.validate.passed + results.switch.passed
  const totalFailed = results.list.failed + results.info.failed +
                       results.config.failed + results.css.failed +
                       results.validate.failed + results.switch.failed

  if (totalFailed === 0) {
    success('✅ 所有测试通过!')
  } else {
    warn(`⚠️  部分测试失败: ${totalFailed}/${totalPassed + totalFailed}`)
  }

  console.log()
}

  // 包装为 async
  return (async () => {
    await runTests()
  })()
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


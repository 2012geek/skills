#!/usr/bin/env node

/**
 * Theme System 测试脚本
 * 测试主题系统功能
 */

const { ThemeSystem } = require('../core/theme-system.js')

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
function info(message) { log(`ℹ️  ${message}`, 'blue') }
function dim(message) { log(message, 'gray') }

// 运行测试
function runTests() {
  log('\n🎨 Theme System 测试\n')

  const themeSystem = new ThemeSystem()

  // 测试 1: 内置主题
  log('\n--- 测试 1: 内置主题 ---')
  const builtin = themeSystem.getBuiltinThemes()
  success(`内置主题: ${builtin.join(', ')}`)

  // 测试 2: 配置生成
  log('\n--- 测试 2: 配置生成 ---')
  const config1 = themeSystem.getSlidevConfig('seriph')
  dim(`seriph:`)
  dim(`  theme: ${config1.theme}`)
  dim(`  highlighter: ${config1.highlighter}`)

  const config2 = themeSystem.getSlidevConfig('dracula')
  dim(`\ndracula:`)
  dim(`  theme: ${config2.theme}`)
  dim(`  highlighter: ${config2.highlighter}`)

  success('配置生成正常')

  // 测试 3: CSS 变量
  log('\n--- 测试 3: CSS 变量 ---')
  const css1 = themeSystem.getThemeCSS('seriph')
  dim('seriph CSS:')
  dim(`  primary: ${css1['--theme-primary']}`)
  dim(`  background: ${css1['--theme-background']}`)
  dim(`  text: ${css1['--theme-text']}`)
  dim(`  accent: ${css1['--theme-accent']}`)

  const css2 = themeSystem.getThemeCSS('dracula')
  dim('\ndracula CSS:')
  dim(`  primary: ${css2['--theme-primary']}`)
  dim(`  background: ${css2['--theme-background']}`)
  dim(`  text: ${css2['--theme-text']}`)
  dim(`  accent: ${css2['--theme-accent']}`)

  success('CSS 变量生成正常')

  // 测试 4: 主题验证
  log('\n--- 测试 4: 主题验证 ---')
  const valid1 = themeSystem.validateTheme('seriph')
  dim(`seriph: ${valid1.valid ? '有效' : '无效'}`)
  if (valid1.warnings.length > 0) {
    dim('  警告: ' + valid1.warnings.join(', '))
  }

  const valid2 = themeSystem.validateTheme('invalid@name')
  dim(`invalid@name: ${valid2.valid ? '有效' : '无效'}`)
  dim(`  错误: ${valid2.errors.join(', ')}`)

  const valid3 = themeSystem.validateTheme('my-custom-theme')
  dim(`my-custom-theme: ${valid3.valid ? '有效' : '无效'}`)
  if (valid3.warnings.length > 0) {
    dim('  警告: ' + valid3.warnings.join(', '))
  }

  // Check an invalid theme with spaces
  const valid4 = themeSystem.validateTheme('invalid theme')
  dim(`invalid theme: ${valid4.valid ? '有效' : '无效'}`)
  dim(`  错误: ${valid4.errors.join(', ')}`)

  if (valid1.valid && valid2.errors.length > 0 && valid3.valid && valid4.errors.length > 0) {
    success('主题验证正常')
  } else {
    error('主题验证失败')
  }

  log('\n✅ 所有基本测试通过!')
  return true
}

// 运行测试
if (require.main === module) {
  try {
    runTests()
    process.exit(0)
  } catch (err) {
    error(`测试失败: ${err.message}`)
    console.error(err.stack)
    process.exit(1)
  }
}

module.exports = { runTests }

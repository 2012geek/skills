#!/usr/bin/env node

/**
 * Theme System
 * 主题管理系统
 * @version 1.0.0
 */

const fs = require('fs').promises
const path = require('path')
const yaml = require('js-yaml')

/**
 * 主题系统类
 */
class ThemeSystem {
  constructor(themesDir = null) {
    this.themesDir = themesDir || path.join(__dirname, '../themes')
    this.themes = new Map()
    this.currentTheme = null
  }

  /**
   * 加载所有主题
   */
  async loadThemes() {
    try {
      const files = await fs.readdir(this.themesDir)
      const yamlFiles = files.filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))

      for (const file of yamlFiles) {
        const filePath = path.join(this.themesDir, file)
        const content = await fs.readFile(filePath, 'utf-8')
        const theme = yaml.load(content)

        this.themes.set(theme.id, theme)
      }

      console.log(`🎨 已加载 ${this.themes.size} 个主题`)
      return this.themes
    } catch (err) {
      console.error('加载主题失败:', err.message)
      return new Map()
    }
  }

  /**
   * 获取主题
   */
  getTheme(themeId) {
    return this.themes.get(themeId)
  }

  /**
   * 获取所有主题
   */
  getAllThemes() {
    return Array.from(this.themes.values())
  }

  /**
   * 按类别获取主题
   */
  getThemesByCategory(category) {
    return this.getAllThemes().filter(t => t.category === category)
  }

  /**
   * 设置当前主题
   */
  setCurrentTheme(themeId) {
    const theme = this.getTheme(themeId)
    if (theme) {
      this.currentTheme = theme
      return theme
    }
    throw new Error(`主题不存在: ${themeId}`)
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme() {
    return this.currentTheme
  }

  /**
   * 生成 CSS 变量
   */
  generateCSSVars(theme = null) {
    const t = theme || this.currentTheme
    if (!t) return ''

    const vars = []

    // 背景色
    if (t.design?.background) {
      vars.push(`--bg-primary: ${t.design.background.primary}`)
      vars.push(`--bg-secondary: ${t.design.background.secondary}`)
      vars.push(`--bg-accent: ${t.design.background.accent}`)
    }

    // 文字色
    if (t.design?.text) {
      vars.push(`--text-primary: ${t.design.text.primary}`)
      vars.push(`--text-secondary: ${t.design.text.secondary}`)
      vars.push(`--text-muted: ${t.design.text.muted}`)
      vars.push(`--text-inverse: ${t.design.text.inverse}`)
    }

    // 品牌色
    if (t.design?.brand) {
      vars.push(`--brand-primary: ${t.design.brand.primary}`)
      vars.push(`--brand-secondary: ${t.design.brand.secondary}`)
      vars.push(`--brand-accent: ${t.design.brand.accent}`)
    }

    // 边框
    if (t.design?.layout?.border) {
      vars.push(`--border-color: ${t.design.layout.border.color}`)
      vars.push(`--border-radius: ${t.design.layout.border.radius}`)
      vars.push(`--border-width: ${t.design.layout.border.width}`)
    }

    // 阴影
    if (t.design?.layout?.shadow) {
      vars.push(`--shadow-small: ${t.design.layout.shadow.small}`)
      vars.push(`--shadow-medium: ${t.design.layout.shadow.medium}`)
      vars.push(`--shadow-large: ${t.design.layout.shadow.large}`)
    }

    return `:root {\n  ${vars.join(';\n  ')};\n}`
  }

  /**
   * 获取 Slidev 主题配置
   */
  getSlidevConfig(theme = null) {
    const t = theme || this.currentTheme
    if (!t) return {}

    return {
      theme: t.syntax?.theme || 'default',
      highlighter: 'shiki',
      lineNumbers: true
    }
  }

  /**
   * 获取 Reveal.js 主题配置
   */
  getRevealConfig(theme = null) {
    const t = theme || this.currentTheme
    if (!t) return {}

    return {
      theme: t.syntax?.hljsTheme || 'monokai'
    }
  }
}

module.exports = { ThemeSystem }

// 如果直接运行，执行测试
if (require.main === module) {
  const system = new ThemeSystem()

  system.loadThemes().then(() => {
    console.log('\n📋 可用主题:')
    const themes = system.getAllThemes()

    themes.forEach(theme => {
      console.log(`  - ${theme.name} (${theme.id})`)
      console.log(`    类别: ${theme.category}, 简称: ${theme.shortName}`)
    })

    console.log('\n🎨 CSS 变量示例:')
    const theme = themes[0]
    system.setCurrentTheme(theme.id)
    console.log(system.generateCSSVars())
  }).catch(err => {
    console.error('错误:', err)
  })
}

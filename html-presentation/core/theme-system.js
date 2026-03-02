#!/usr/bin/env node

/**
 * Theme System
 * Slidev 主题管理系统
 * @version 5.0.0 - 支持动态主题加载和验证
 */

const fs = require('fs').promises
const path = require('path')
const yaml = require('js-yaml')

/**
 * Slidev 主题系统类
 */
class ThemeSystem {
  constructor(themesDir = null) {
    this.themesDir = themesDir || path.join(__dirname, '../themes')
    this.themes = new Map()
    this.currentTheme = null
    this.configCache = new Map()
  }

  /**
   * 获取内置 Slidev 主题列表
   */
  getBuiltinThemes() {
    return [
      'default',
      'seriph',
      'apple-basic',
      'cb',
      'github',
      'shibainu',
      'simula',
      'dracula'
    ]
  }

  /**
   * 获取所有可用主题（包括已安装的）
   */
  async getAvailableThemes() {
    const themes = {}

    // 添加内置主题
    for (const theme of this.getBuiltinThemes()) {
      themes[theme] = {
        name: theme,
        type: 'builtin',
        official: true,
        builtin: true
      }
    }

    // 扫描已安装的主题
    try {
      const installed = await fs.readdir(this.themesDir)
      for (const themeDir of installed) {
        const themePath = path.join(this.themesDir, themeDir)
        const stats = await fs.stat(themePath)

        if (stats.isDirectory()) {
          themes[themeDir] = {
            name: themeDir,
            type: 'installed',
            path: themePath,
            official: this.isOfficialTheme(themeDir)
          }
        }
      }
    } catch (err) {
      // 目录不存在，忽略
    }

    return themes
  }

  /**
   * 判断是否为官方主题
   */
  isOfficialTheme(themeName) {
    const officialThemes = this.getBuiltinThemes()
    return officialThemes.includes(themeName)
  }

  /**
   * 加载主题配置
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 主题配置
   */
  async loadThemeConfig(themeName) {
    // 检查缓存
    if (this.configCache.has(themeName)) {
      return this.configCache.get(themeName)
    }

    let config = {}

    // 尝试从主题目录加载
    const themePath = path.join(this.themesDir, themeName)
    const configFile = path.join(themePath, 'theme.yml')

    try {
      const yamlContent = await fs.readFile(configFile, 'utf-8')
      config = yaml.load(yamlContent)
      config.source = 'file'
    } catch (err) {
      // 使用默认配置
      config = await this.getSlidevConfig(themeName)
      config.source = 'default'
    }

    // 缓存配置
    this.configCache.set(themeName, config)

    return config
  }

  /**
   * 获取 Slidev 配置
   */
  getSlidevConfig(theme = null) {
    const themeName = theme || 'seriph'
    return {
      theme: themeName,
      highlighter: 'shiki',
      lineNumbers: true,
      drawings: { persist: true },
      transition: 'slide'
    }
  }

  /**
   * 生成主题 CSS 变量
   * @param {string} themeName - 主题名称
   * @returns {Object} CSS 变量
   */
  getThemeCSS(themeName) {
    // 定义常见主题的颜色变量
    const themeColors = {
      seriph: {
        primary: '#5c6bc0',
        background: '#ffffff',
        text: '#1a1a1a',
        accent: '#7c3aed'
      },
      'apple-basic': {
        primary: '#000000',
        background: '#ffffff',
        text: '#1d1d1f',
        accent: '#0071e3'
      },
      dracula: {
        primary: '#bd93f9',
        background: '#282a36',
        text: '#f8f8f2',
        accent: '#ff79c6'
      },
      default: {
        primary: '#4a90e2',
        background: '#ffffff',
        text: '#1a1a1a',
        accent: '#58a6ff'
      }
    }

    const colors = themeColors[themeName] || themeColors.default

    return {
      '--theme-primary': colors.primary,
      '--theme-background': colors.background,
      '--theme-text': colors.text,
      '--theme-accent': colors.accent
    }
  }

  /**
   * 验证主题兼容性
   * @param {string} themeName - 主题名称
   * @returns {Object>} 验证结果
   */
  validateTheme(themeName) {
    const errors = []
    const warnings = []

    // 检查主题名称格式
    if (!/^[a-z0-9-]+$/i.test(themeName)) {
      errors.push('主题名称只能包含字母、数字和连字符')
    }

    // 检查是否为内置主题
    const builtin = this.getBuiltinThemes()
    const isBuiltin = builtin.includes(themeName)

    if (!isBuiltin && !this.themes.has(themeName)) {
      warnings.push('主题未安装，可能无法使用')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      isBuiltin,
      installed: isBuiltin || this.themes.has(themeName)
    }
  }

  /**
   * 清除配置缓存
   */
  clearCache() {
    this.configCache.clear()
  }
}

module.exports = { ThemeSystem }


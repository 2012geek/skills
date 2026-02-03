#!/usr/bin/env node

/**
 * Theme System
 * Slidev 主题管理系统
 * @version 4.0.0 - Slidev-only
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
   * 获取 Slidev 主题配置
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
   * 设置当前主题
   */
  setTheme(themeName) {
    const themes = this.getBuiltinThemes()
    if (!themes.includes(themeName)) {
      throw new Error(`Unknown theme: ${themeName}. Available: ${themes.join(', ')}`)
    }
    this.currentTheme = themeName
    return this.getSlidevConfig(themeName)
  }
}

module.exports = { ThemeSystem }

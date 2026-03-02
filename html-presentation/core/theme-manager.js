#!/usr/bin/env node

/**
 * Theme Manager
 * 主题管理系统：下载、安装、切换、验证
 * @version 2.0.0
 */

const fs = require('fs').promises
const path = require('path')
const yaml = require('js-yaml')

// 延迟加载依赖
let ThemeDownloader = null
let ThemeSystem = null

/**
 * 主题管理器类
 */
class ThemeManager {
  constructor(config = {}) {
    this.config = {
      themesDir: config.themesDir || 'themes',
      cacheDir: config.cacheDir || '.cache/themes',
      downloadOnDemand: config.downloadOnDemand !== false,
      autoDownload: config.autoDownload || false,
      debug: config.debug || false
    }

    // 延迟初始化
    this.downloader = null
    this.themeSystem = null
    this.installedThemes = new Map()
  }

  /**
   * 初始化管理器
   */
  async init() {
    if (this.config.debug) {
      console.log('🎨 初始化主题管理器...')
    }

    // 初始化下载器
    if (!this.downloader) {
      const { ThemeDownloader } = require('./theme-downloader.js')
      this.downloader = new ThemeDownloader({
        cacheDir: this.config.cacheDir,
        themesDir: this.config.themesDir,
        debug: this.config.debug
      })
    }

    // 初始化主题系统
    if (!this.themeSystem) {
      const { ThemeSystem } = require('./theme-system.js')
      this.themeSystem = new ThemeSystem(this.config.themesDir)
    }

    // 扫描已安装的主题
    await this.scanInstalledThemes()

    if (this.config.debug) {
      console.log(`✅ 初始化完成，找到 ${this.installedThemes.size} 个主题`)
    }
  }

  /**
   * 扫描已安装的主题
   */
  async scanInstalledThemes() {
    this.installedThemes.clear()

    try {
      const files = await fs.readdir(this.config.themesDir)

      for (const file of files) {
        const themePath = path.join(this.config.themesDir, file)
        const stats = await fs.stat(themePath)

        if (stats.isDirectory()) {
          const packageJson = path.join(themePath, 'package.json')
          try {
            const pkg = JSON.parse(await fs.readFile(packageJson, 'utf-8'))
            this.installedThemes.set(file, {
              name: file,
              path: themePath,
              version: pkg.version || '0.0.0',
              description: pkg.description || '',
              official: this.isOfficialTheme(file)
            })
          } catch {
            // 没有 package.json，可能是手动添加的
            this.installedThemes.set(file, {
              name: file,
              path: themePath,
              version: 'unknown',
              description: 'Custom theme',
              official: false
            })
          }
        }
      }
    } catch (err) {
      // 目录不存在，忽略
    }
  }

  /**
   * 判断是否为官方主题
   * @param {string} themeName - 主题名称
   * @returns {boolean}
   */
  isOfficialTheme(themeName) {
    const officialThemes = [
      'seriph', 'default', 'apple-basic', 'github',
      'dracula', 'shibainu', 'simula', 'cb'
    ]
    return officialThemes.includes(themeName)
  }

  /**
   * 获取所有可用主题
   * @returns {Promise<Object>} 主题列表
   */
  async getAvailableThemes() {
    await this.init()

    const builtinThemes = this.themeSystem.getBuiltinThemes()
    const available = {}

    // 内置主题
    for (const theme of builtinThemes) {
      available[theme] = {
        name: theme,
        type: 'builtin',
        official: true,
        installed: true,
        path: null,
        version: 'builtin'
      }
    }

    // 已安装的主题
    for (const [name, info] of this.installedThemes) {
      if (!available[name]) {
        available[name] = {
          name,
          type: 'installed',
          official: info.official,
          installed: true,
          path: info.path,
          version: info.version
        }
      }
    }

    // 官方可下载主题
    if (this.downloader) {
      const downloadableThemes = this.downloader.getAvailableThemes()
      for (const theme of downloadableThemes) {
        if (!available[theme.name]) {
          available[theme.name] = {
            name: theme.name,
            type: 'downloadable',
            official: theme.official,
            installed: false,
            path: null,
            url: theme.url,
            source: theme.source
          }
        }
      }
    }

    return available
  }

  /**
   * 安装主题
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 安装结果
   */
  async installTheme(themeName) {
    await this.init()

    if (this.config.debug) {
      console.log(`📦 安装主题: ${themeName}`)
    }

    // 检查是否已安装
    if (this.installedThemes.has(themeName)) {
      return {
        success: false,
        theme: themeName,
        message: '主题已安装',
        action: 'skip'
      }
    }

    // 下载主题
    const downloadResult = await this.downloader.downloadTheme(themeName)

    if (!downloadResult.success) {
      return {
        success: false,
        theme: themeName,
        error: downloadResult.error
      }
    }

    // 验证安装
    const isValid = await this.validateTheme(downloadResult.path)

    if (!isValid.valid) {
      return {
        success: false,
        theme: themeName,
        error: `主题验证失败: ${isValid.errors.join(', ')}`
      }
    }

    // 更新已安装列表
    await this.scanInstalledThemes()

    return {
      success: true,
      theme: themeName,
      path: downloadResult.path,
      method: downloadResult.method,
      elapsed: downloadResult.elapsed
    }
  }

  /**
   * 验证主题
   * @param {string} themePath - 主题路径
   * @returns {Promise<Object>} 验证结果
   */
  async validateTheme(themePath) {
    const errors = []
    const warnings = []

    try {
      // 检查必要文件
      const requiredFiles = ['package.json']
      for (const file of requiredFiles) {
        const filePath = path.join(themePath, file)
        try {
          await fs.access(filePath)
        } catch {
          errors.push(`缺少文件: ${file}`)
        }
      }

      // 验证 package.json
      const packageJson = path.join(themePath, 'package.json')
      try {
        const pkg = JSON.parse(await fs.readFile(packageJson, 'utf-8'))

        // 检查必要字段
        if (!pkg.name) errors.push('package.json 缺少 name 字段')
        if (!pkg.version) warnings.push('package.json 缺少 version 字段')

        // 检查 Slidev 主题标识
        if (!pkg.keywords || !pkg.keywords.includes('slidev-theme')) {
          warnings.push('可能不是 Slidev 主题（缺少 slidev-theme keyword）')
        }

      } catch (err) {
        errors.push(`package.json 无效: ${err.message}`)
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      }

    } catch (err) {
      return {
        valid: false,
        errors: [err.message],
        warnings: []
      }
    }
  }

  /**
   * 切换主题
   * @param {string} themeName - 主题名称
   * @returns {Object} Slidev 配置
   */
  switchTheme(themeName) {
    if (this.config.debug) {
      console.log(`🔄 切换主题: ${themeName}`)
    }

    const config = this.themeSystem.getSlidevConfig(themeName)

    return {
      theme: themeName,
      config,
      message: `已切换到主题: ${themeName}`
    }
  }

  /**
   * 获取主题信息
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 主题信息
   */
  async getThemeInfo(themeName) {
    await this.init()

    // 检查已安装的主题
    if (this.installedThemes.has(themeName)) {
      return this.installedThemes.get(themeName)
    }

    // 检查内置主题
    const builtin = this.themeSystem.getBuiltinThemes()
    if (builtin.includes(themeName)) {
      return {
        name: themeName,
        type: 'builtin',
        official: true,
        installed: true
      }
    }

    // 检查可下载主题
    if (this.downloader) {
      const themeInfo = this.downloader.findThemeInfo(themeName)
      if (themeInfo && themeInfo.url) {
        return {
          name: themeName,
          type: 'downloadable',
          official: themeInfo.source === 'github',
          installed: false,
          url: themeInfo.url,
          source: themeInfo.source
        }
      }
    }

    return null
  }

  /**
   * 卸载主题
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 卸载结果
   */
  async uninstallTheme(themeName) {
    if (this.config.debug) {
      console.log(`🗑️  卸载主题: ${themeName}`)
    }

    // 不能卸载内置主题
    const builtin = this.themeSystem.getBuiltinThemes()
    if (builtin.includes(themeName)) {
      return {
        success: false,
        theme: themeName,
        message: '不能卸载内置主题'
      }
    }

    if (!this.installedThemes.has(themeName)) {
      return {
        success: false,
        theme: themeName,
        message: '主题未安装'
      }
    }

    try {
      const themeInfo = this.installedThemes.get(themeName)
      const themePath = themeInfo.path

      // 删除主题目录
      await fs.rm(themePath, { recursive: true, force: true })

      // 更新已安装列表
      this.installedThemes.delete(themeName)

      return {
        success: true,
        theme: themeName,
        message: '主题已卸载'
      }

    } catch (err) {
      return {
        success: false,
        theme: themeName,
        error: err.message
      }
    }
  }

  /**
   * 更新主题
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 更新结果
   */
  async updateTheme(themeName) {
    if (this.config.debug) {
      console.log(`🔄 更新主题: ${themeName}`)
    }

    // 先卸载（如果已安装）
    if (this.installedThemes.has(themeName)) {
      await this.uninstallTheme(themeName)
    }

    // 重新安装
    return await this.installTheme(themeName)
  }

  /**
   * 列出所有主题（分类展示）
   * @returns {Promise<Object>} 分类主题列表
   */
  async listThemes() {
    const available = await this.getAvailableThemes()

    const categorized = {
      builtin: [],
      installed: [],
      downloadable: [],
      official: [],
      custom: []
    }

    for (const [name, info] of Object.entries(available)) {
      if (info.type === 'builtin') {
        categorized.builtin.push(info)
        if (info.official) categorized.official.push(info)
      } else if (info.type === 'installed') {
        categorized.installed.push(info)
        if (info.official) {
          categorized.official.push(info)
        } else {
          categorized.custom.push(info)
        }
      } else if (info.type === 'downloadable') {
        categorized.downloadable.push(info)
        if (info.official) categorized.official.push(info)
      }
    }

    return {
      total: Object.keys(available).length,
      official: categorized.official.length,
      custom: categorized.custom.length,
      builtin: categorized.builtin.length,
      categories: categorized
    }
  }

  /**
   * 搜索主题
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} 匹配的主题
   */
  async searchThemes(query) {
    const available = await this.getAvailableThemes()
    const results = []
    const lowerQuery = query.toLowerCase()

    for (const [name, info] of Object.entries(available)) {
      const searchText = `${name} ${info.description || ''} ${info.version || ''}`.toLowerCase()

      if (searchText.includes(lowerQuery)) {
        results.push({ name, ...info, match: searchText })
      }
    }

    return results
  }

  /**
   * 获取主题统计
   * @returns {Promise<Object>} 统计信息
   */
  async getStats() {
    const themes = await this.listThemes()

    return {
      total: themes.total,
      builtin: themes.builtin.length,
      installed: themes.installed.length,
      official: themes.official,
      custom: themes.custom,
      downloadable: themes.downloadable.length,
      cacheUsage: await this.getCacheUsage()
    }
  }

  /**
   * 获取缓存使用情况
   * @returns {Promise<Object>} 缓存统计
   */
  async getCacheUsage() {
    try {
      const cacheDir = this.config.cacheDir
      const files = await fs.readdir(cacheDir, { recursive: true })

      let totalSize = 0
      for (const file of files) {
        try {
          const filePath = path.join(cacheDir, file)
          const stats = await fs.stat(filePath)
          totalSize += stats.size
        } catch {
          // 忽略无法访问的文件
        }
      }

      return {
        files: files.length,
        totalSize: totalSize,
        totalSizeFormatted: this.formatBytes(totalSize),
        dir: cacheDir
      }
    } catch {
      return {
        files: 0,
        totalSize: 0,
        totalSizeFormatted: '0 B',
        dir: this.config.cacheDir
      }
    }
  }

  /**
   * 格式化字节大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化大小
   */
  formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  /**
   * 清除主题缓存
   */
  async clearCache() {
    if (this.downloader) {
      await this.downloader.clearCache()
    }
  }

  /**
   * 导出主题列表为 JSON
   * @param {string} outputPath - 输出路径
   * @returns {Promise}
   */
  async exportThemeList(outputPath) {
    const themes = await this.getAvailableThemes()

    const exportData = {
      exported: new Date().toISOString(),
      version: '2.0.0',
      count: Object.keys(themes).length,
      themes: Object.values(themes)
    }

    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2))
    console.log(`✅ 主题列表已导出到: ${outputPath}`)
  }
}

module.exports = { ThemeManager }

// 如果直接运行，执行测试
if (require.main === module) {
  const manager = new ThemeManager({
    debug: true
  })

  ;(async () => {
    console.log('🎨 Theme Manager 测试\n')

    await manager.init()

    // 测试 1: 列出主题
    console.log('\n--- 测试 1: 列出主题 ---')
    const list = await manager.listThemes()
    console.log(`总计: ${list.total} 个主题`)
    console.log(`官方: ${list.official} 个`)
    console.log(`自定义: ${list.custom} 个`)
    console.log(`可下载: ${list.downloadable.length} 个`)

    // 测试 2: 获取主题信息
    console.log('\n--- 测试 2: 获取主题信息 ---')
    const info = await manager.getThemeInfo('seriph')
    if (info) {
      console.log('seriph:')
      console.log(`   类型: ${info.type}`)
      console.log(`   官方: ${info.official}`)
    } else {
      console.log('未找到主题')
    }

    // 测试 3: 验证主题
    console.log('\n--- 测试 3: 验证主题 ---')
    const builtin = manager.themeSystem.getBuiltinThemes()
    console.log(`验证内置主题: ${builtin[0]}`)
    // 内置主题路径可能不存在，跳过实际验证

    // 测试 4: 搜索主题
    console.log('\n--- 测试 4: 搜索主题 ---')
    const searchResults = await manager.searchThemes('ser')
    console.log(`找到 ${searchResults.length} 个匹配的主题`)
    searchResults.forEach(r => {
      console.log(`  - ${r.name}`)
    })

    // 测试 5: 统计
    console.log('\n--- 测试 5: 统计信息 ---')
    const stats = await manager.getStats()
    console.log(JSON.stringify(stats, null, 2))
  })().catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
}

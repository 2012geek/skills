#!/usr/bin/env node

/**
 * Theme Downloader
 * 从官方 Slidev 源下载主题
 * @version 2.0.0
 */

const fs = require('fs').promises
const path = require('path')
const https = require('https')
const http = require('http')
const { promisify } = require('util')
const exec = promisify(require('child_process').exec)

/**
 * 主题下载器类
 */
class ThemeDownloader {
  constructor(config = {}) {
    this.config = {
      cacheDir: config.cacheDir || '.cache/themes',
      themesDir: config.themesDir || 'themes',
      timeout: config.timeout || 30000,
      force: config.force || false,  // 强制重新下载
      debug: config.debug || false
    }

    // 官方主题源
    this.sources = {
      // Slidev 官方主题 (GitHub)
      github: {
        base: 'https://github.com/slidevjs/themes/raw/main/packages',
        themes: [
          { name: 'seriph', repo: 'theme-seriph' },
          { name: 'default', repo: 'theme-default' },
          { name: 'apple-basic', repo: 'theme-apple-basic' },
          { name: 'github', repo: 'theme-github' },
          { name: 'dracula', repo: 'theme-dracula' },
          { name: 'shibainu', repo: 'theme-shibainu' }
        ]
      },
      // npm registry
      npm: {
        registry: 'https://registry.npmjs.org',
        scope: '@slidev/theme'
      }
    }
  }

  /**
   * 获取可用主题列表
   * @returns {Array<Object>} 主题列表
   */
  getAvailableThemes() {
    const themes = []

    // GitHub 主题
    for (const theme of this.sources.github.themes) {
      themes.push({
        name: theme.name,
        source: 'github',
        official: true,
        repo: `slidevjs/themes/${theme.repo}`,
        url: `${this.sources.github.base}/${theme.repo}/package.json`
      })
    }

    // 常见的社区主题
    const communityThemes = [
      'simula',
      'cb',
      'brAG'
    ]

    for (const theme of communityThemes) {
      themes.push({
        name: theme,
        source: 'community',
        official: false,
        url: null
      })
    }

    return themes
  }

  /**
   * 下载主题
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 下载结果
   */
  async downloadTheme(themeName) {
    const startTime = Date.now()

    try {
      // 检查主题是否已存在
      const themePath = path.join(this.config.themesDir, themeName)
      const exists = await this.themeExists(themePath)

      if (exists && !this.config.force) {
        if (this.config.debug) {
          console.log(`✓ 主题已存在: ${themeName}`)
        }
        return {
          success: true,
          theme: themeName,
          path: themePath,
          cached: true,
          elapsed: 0
        }
      }

      // 查找主题信息
      const themeInfo = this.findThemeInfo(themeName)
      if (!themeInfo) {
        throw new Error(`未知主题: ${themeName}`)
      }

      // 创建目标目录
      await fs.mkdir(this.config.themesDir, { recursive: true })
      await fs.mkdir(themePath, { recursive: true })

      if (this.config.debug) {
        console.log(`📥 下载主题: ${themeName}`)
        console.log(`   来源: ${themeInfo.source}`)
      }

      // 根据来源使用不同的下载方式
      let result
      if (themeInfo.source === 'github') {
        result = await this.downloadFromGitHub(themeInfo, themePath)
      } else if (themeInfo.source === 'npm') {
        result = await this.downloadFromNpm(themeInfo, themePath)
      } else {
        result = await this.downloadFromURL(themeInfo.url, themePath)
      }

      result.elapsed = Date.now() - startTime
      result.success = true
      result.theme = themeName

      if (this.config.debug) {
        console.log(`✅ 主题下载完成 (${result.elapsed}ms)`)
      }

      return result

    } catch (err) {
      return {
        success: false,
        theme: themeName,
        error: err.message,
        elapsed: Date.now() - startTime
      }
    }
  }

  /**
   * 查找主题信息
   * @param {string} themeName - 主题名称
   * @returns {Object|null>} 主题信息
   */
  findThemeInfo(themeName) {
    // 先在 GitHub 主题中查找
    const githubTheme = this.sources.github.themes.find(t => t.name === themeName)
    if (githubTheme) {
      return {
        ...githubTheme,
        source: 'github',
        url: `${this.sources.github.base}/${githubTheme.repo}`
      }
    }

    // 其他主题视为社区主题
    return {
      name: themeName,
      source: 'community',
      url: null
    }
  }

  /**
   * 从 GitHub 下载主题
   * @param {Object} themeInfo - 主题信息
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 下载结果
   */
  async downloadFromGitHub(themeInfo, targetDir) {
    const packageName = `@slidev/${themeInfo.repo}`
    const tarballUrl = `https://registry.npmjs.org/${packageName}/-/latest.tgz`

    if (this.config.debug) {
      console.log(`   下载: ${tarballUrl}`)
    }

    // 下载 tarball
    const tarballPath = path.join(this.config.cacheDir, `${themeInfo.name}.tgz`)
    await this.downloadFile(tarballUrl, tarballPath)

    // 解压
    await this.extractTarball(tarballPath, targetDir)

    // 清理 tarball
    await fs.unlink(tarballPath).catch(() => {})

    return {
      path: targetDir,
      method: 'npm-tarball',
      files: await this.listDownloadedFiles(targetDir)
    }
  }

  /**
   * 从 npm 下载主题
   * @param {Object} themeInfo - 主题信息
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 下载结果
   */
  async downloadFromNpm(themeInfo, targetDir) {
    const packageName = `${this.sources.npm.scope}/${themeInfo.name}`
    const tarballUrl = `${this.sources.npm.registry}/${packageName}/-/latest.tgz`

    if (this.config.debug) {
      console.log(`   从 npm 下载: ${packageName}`)
    }

    const tarballPath = path.join(this.config.cacheDir, `${themeInfo.name}.tgz`)
    await this.downloadFile(tarballUrl, tarballPath)

    await this.extractTarball(tarballPath, targetDir)
    await fs.unlink(tarballPath).catch(() => {})

    return {
      path: targetDir,
      method: 'npm',
      files: await this.listDownloadedFiles(targetDir)
    }
  }

  /**
   * 从 URL 下载
   * @param {string} url - 下载 URL
   * @param {string} targetDir - 目标目录
   * @returns {Promise<Object>} 下载结果
   */
  async downloadFromURL(url, targetDir) {
    if (!url) {
      throw new Error('没有提供下载 URL')
    }

    if (this.config.debug) {
      console.log(`   直接下载: ${url}`)
    }

    // 简化实现：只下载 package.json
    const packageJsonPath = path.join(targetDir, 'package.json')
    await this.downloadFile(url, packageJsonPath)

    return {
      path: targetDir,
      method: 'direct',
      files: ['package.json']
    }
  }

  /**
   * 下载文件
   * @param {string} url - URL
   * @param {string} destPath - 目标路径
   * @returns {Promise}
   */
  async downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http

      https.get(url, { timeout: this.config.timeout }, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        const file = require('fs').createWriteStream(destPath)
        res.pipe(file)

        file.on('finish', () => resolve())
        file.on('error', reject)
      }).on('error', reject)
    })
  }

  /**
   * 解压 tarball
   * @param {string} tarballPath - tarball 路径
   * @param {string} targetDir - 目标目录
   * @returns {Promise}
   */
  async extractTarball(tarballPath, targetDir) {
    try {
      // 使用 npm 的 tar 命令解压
      await fs.mkdir(path.dirname(tarballPath), { recursive: true })

      const command = `cd "${targetDir}" && tar -xzf "${tarballPath}" --strip-components=1`
      await exec(command)

    } catch (err) {
      throw new Error(`解压失败: ${err.message}`)
    }
  }

  /**
   * 列出下载的文件
   * @param {string} dir - 目录路径
   * @returns {Promise<Array>} 文件列表
   */
  async listDownloadedFiles(dir) {
    try {
      const files = await fs.readdir(dir, { recursive: true })
      return files.slice(0, 10)  // 限制返回的文件数
    } catch {
      return []
    }
  }

  /**
   * 检查主题是否存在
   * @param {string} themePath - 主题路径
   * @returns {Promise<boolean>}
   */
  async themeExists(themePath) {
    try {
      const stats = await fs.stat(themePath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * 批量下载主题
   * @param {Array<string>} themeNames - 主题名称列表
   * @returns {Promise<Array>} 下载结果
   */
  async downloadBatch(themeNames) {
    const results = []

    for (const themeName of themeNames) {
      const result = await this.downloadTheme(themeName)
      results.push(result)
    }

    return results
  }

  /**
   * 更新主题（强制重新下载）
   * @param {string} themeName - 主题名称
   * @returns {Promise<Object>} 更新结果
   */
  async updateTheme(themeName) {
    const downloader = new ThemeDownloader({
      ...this.config,
      force: true
    })

    return await downloader.downloadTheme(themeName)
  }

  /**
   * 清除缓存
   */
  async clearCache() {
    try {
      await fs.rm(this.config.cacheDir, { recursive: true, force: true })
      console.log('✅ 主题缓存已清除')
    } catch (err) {
      console.warn(`缓存清除失败: ${err.message}`)
    }
  }
}

module.exports = { ThemeDownloader }

// 如果直接运行，执行测试
if (require.main === module) {
  const downloader = new ThemeDownloader({
    debug: true
  })

  console.log('🎨 Theme Downloader 测试\n')

  // 测试 1: 列出可用主题
  console.log('\n--- 测试 1: 可用主题列表 ---')
  const themes = downloader.getAvailableThemes()
  console.log(`找到 ${themes.length} 个主题:`)
  themes.forEach(theme => {
    console.log(`  - ${theme.name} (${theme.source}${theme.official ? ', official' : ''})`)
  })

  // 测试 2: 下载主题
  console.log('\n--- 测试 2: 下载主题 ---')
  const testTheme = 'seriph'
  const result = await downloader.downloadTheme(testTheme)

  if (result.success) {
    console.log(`✅ 下载成功`)
    console.log(`   路径: ${result.path}`)
    console.log(`   方法: ${result.method}`)
    console.log(`   耗时: ${result.elapsed}ms`)
  } else {
    console.log(`❌ 下载失败: ${result.error}`)
  }
}

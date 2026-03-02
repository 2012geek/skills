#!/usr/bin/env node

/**
 * Image Analyzer
 * 图片元数据分析器
 * @version 2.0.0
 */

const sharp = require('sharp')
const fs = require('fs').promises
const path = require('path')

/**
 * 图片分析器类
 */
class ImageAnalyzer {
  constructor(config = {}) {
    this.config = {
      maxAnalysisSize: config.maxAnalysisSize || 50 * 1024 * 1024,  // 50MB
      cacheEnabled: config.cacheEnabled !== false,
      cacheDir: config.cacheDir || '.cache/image-analysis'
    }

    // 分析结果缓存
    this.cache = new Map()
  }

  /**
   * 分析图片文件
   * @param {string} imagePath - 图片路径
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeImage(imagePath) {
    try {
      const fileStats = await fs.stat(imagePath)
      const fileSize = fileStats.size

      // 检查文件大小
      if (fileSize > this.config.maxAnalysisSize) {
        throw new Error(`图片文件过大 (${(fileSize / 1024 / 1024).toFixed(2)}MB)`)
      }

      // 使用 Sharp 获取元数据
      const metadata = await sharp(imagePath).metadata()

      // 获取图片尺寸
      const image = sharp(imagePath)
      const { width, height } = metadata

      // 计算宽高比
      const aspectRatio = width / height

      // 获取主色调和图片统计
      const stats = await image.stats()

      // 检测图片类型
      const imageType = this.detectImageType(metadata)

      // 检测透明度
      const hasAlpha = this.hasTransparency(metadata)

      // 计算适合幻灯片的建议尺寸
      const slideRecommendations = this.getSlideRecommendations(width, height, aspectRatio)

      // 评估图片质量
      const quality = await this.assessQuality(imagePath, metadata)

      return {
        path: imagePath,
        filename: path.basename(imagePath),
        format: metadata.format,
        size: {
          width,
          height,
          aspectRatio: parseFloat(aspectRatio.toFixed(3)),
          megapixels: parseFloat((width * height / 1000000).toFixed(2))
        },
        file: {
          size: fileSize,
          sizeFormatted: this.formatFileSize(fileSize),
          density: parseFloat((fileSize / (width * height)).toFixed(2))
        },
        color: {
          channels: metadata.channels,
          hasAlpha,
          orientation: metadata.orientation,
          density: metadata.density,
          isOpaque: !hasAlpha
        },
        type: imageType,
        quality: quality,
        recommendations: slideRecommendations,
        metadata: {
          space: metadata.space,
          chromaSubsampling: metadata.chromaSubsampling,
          isProgressive: metadata.isProgressive || false,
          hasProfile: metadata.hasProfile || false,
          icc: metadata.icc || null
        }
      }

    } catch (err) {
      throw new Error(`图片分析失败: ${err.message}`)
    }
  }

  /**
   * 批量分析图片
   * @param {Array<string>} imagePaths - 图片路径数组
   * @returns {Promise<Array>} 分析结果数组
   */
  async analyzeBatch(imagePaths) {
    const results = []

    for (const imagePath of imagePaths) {
      try {
        const result = await this.analyzeImage(imagePath)
        results.push(result)
      } catch (err) {
        results.push({
          path: imagePath,
          error: err.message
        })
      }
    }

    return results
  }

  /**
   * 从 URL 分析图片
   * @param {string} imageUrl - 图片 URL
   * @param {string} downloadPath - 下载路径（可选）
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeFromUrl(imageUrl, downloadPath = null) {
    // 如果提供了下载路径，先下载
    if (downloadPath) {
      const buffer = await this.downloadImage(imageUrl)
      await fs.mkdir(path.dirname(downloadPath), { recursive: true })
      await fs.writeFile(downloadPath, buffer)
      return await this.analyzeImage(downloadPath)
    }

    // 否则使用缓冲区分析
    const buffer = await this.downloadImage(imageUrl)
    return await this.analyzeBuffer(buffer, imageUrl)
  }

  /**
   * 分析图片缓冲区
   * @param {Buffer} buffer - 图片缓冲区
   * @param {string} source - 来源标识
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeBuffer(buffer, source = 'buffer') {
    try {
      const metadata = await sharp(buffer).metadata()
      const image = sharp(buffer)

      const { width, height } = metadata
      const aspectRatio = width / height

      const stats = await image.stats()

      return {
        source,
        format: metadata.format,
        size: {
          width,
          height,
          aspectRatio: parseFloat(aspectRatio.toFixed(3)),
          megapixels: parseFloat((width * height / 1000000).toFixed(2))
        },
        file: {
          size: buffer.length,
          sizeFormatted: this.formatFileSize(buffer.length)
        },
        color: {
          channels: metadata.channels,
          hasAlpha: metadata.hasAlpha || false
        },
        type: this.detectImageType(metadata),
        quality: {
          sharpness: this.estimateSharpness(stats),
          brightness: this.estimateBrightness(stats),
          contrast: this.estimateContrast(stats)
        }
      }

    } catch (err) {
      throw new Error(`缓冲区分析失败: ${err.message}`)
    }
  }

  /**
   * 检测图片类型
   * @param {Object} metadata - Sharp 元数据
   * @returns {string} 图片类型
   */
  detectImageType(metadata) {
    const { width, height } = metadata
    const ratio = width / height

    // 照片类型
    if (this.isPhotoRatio(ratio)) {
      return 'photo'
    }

    // 图标/Logo
    if (width === height || Math.abs(ratio - 1) < 0.1) {
      return 'icon'
    }

    // 横幅图片
    if (ratio > 2) {
      return 'banner'
    }

    // 竖幅图片
    if (ratio < 0.5) {
      return 'portrait'
    }

    // 截图
    if (width >= 1200 && height >= 800) {
      return 'screenshot'
    }

    return 'generic'
  }

  /**
   * 判断是否为照片宽高比
   * @param {number} ratio - 宽高比
   * @returns {boolean}
   */
  isPhotoRatio(ratio) {
    // 常见照片宽高比：4:3, 3:2, 16:9
    const photoRatios = [4/3, 3/2, 16/9]
    return photoRatios.some(r => Math.abs(ratio - r) < 0.1)
  }

  /**
   * 检测透明度
   * @param {Object} metadata - Sharp 元数据
   * @returns {boolean}
   */
  hasTransparency(metadata) {
    return metadata.format === 'png' &&
           (metadata.channels === 4 || metadata.hasAlpha)
  }

  /**
   * 获取幻灯片建议
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} aspectRatio - 宽高比
   * @returns {Object} 建议
   */
  getSlideRecommendations(width, height, aspectRatio) {
    const slideWidth = 1280
    const slideHeight = 720

    // 计算适合的缩放比例
    const scaleX = slideWidth / width
    const scaleY = slideHeight / height
    const scale = Math.min(scaleX, scaleY, 1)  // 不放大

    const scaledWidth = Math.round(width * scale)
    const scaledHeight = Math.round(height * scale)

    // 布局建议
    let layout = 'full'
    if (aspectRatio > 1.5) {
      layout = 'wide'
    } else if (aspectRatio < 0.8) {
      layout = 'tall'
    } else if (width > slideWidth * 0.6) {
      layout = 'large'
    }

    return {
      scale: parseFloat(scale.toFixed(2)),
      scaledSize: {
        width: scaledWidth,
        height: scaledHeight
      },
      layout: layout,
      fitsInSlide: width <= slideWidth && height <= slideHeight,
      needsScaling: width > slideWidth || height > slideHeight,
      suggestedPlacement: this.suggestPlacement(layout, aspectRatio)
    }
  }

  /**
   * 建议图片放置位置
   * @param {string} layout - 布局类型
   * @param {number} aspectRatio - 宽高比
   * @returns {string} 放置建议
   */
  suggestPlacement(layout, aspectRatio) {
    if (layout === 'wide') {
      return 'top-or-bottom'
    } else if (layout === 'tall') {
      return 'left-or-right'
    } else if (aspectRatio > 1) {
      return 'right'
    } else {
      return 'left'
    }
  }

  /**
   * 评估图片质量
   * @param {string} imagePath - 图片路径
   * @param {Object} metadata - Sharp 元数据
   * @returns {Promise<Object>} 质量评估
   */
  async assessQuality(imagePath, metadata) {
    try {
      const image = sharp(imagePath)
      const stats = await image.stats()

      return {
        sharpness: this.estimateSharpness(stats),
        brightness: this.estimateBrightness(stats),
        contrast: this.estimateContrast(stats),
        overall: this.calculateOverallQuality(stats),
        colorfulness: this.estimateColorfulness(stats)
      }
    } catch (err) {
      return {
        error: err.message
      }
    }
  }

  /**
   * 估算清晰度
   * @param {Object} stats - 图片统计
   * @returns {number} 清晰度评分 (0-100)
   */
  estimateSharpness(stats) {
    // 使用边缘检测的简化版本
    // 这里使用标准差的近似值
    const { stdev } = stats.channels[0] || { stdev: 50 }
    return Math.min(100, Math.max(0, (stdev / 100) * 100))
  }

  /**
   * 估算亮度
   * @param {Object} stats - 图片统计
   * @returns {number} 亮度评分 (0-100)
   */
  estimateBrightness(stats) {
    const { mean } = stats.channels[0] || { mean: 128 }
    return parseFloat((mean / 255 * 100).toFixed(1))
  }

  /**
   * 估算对比度
   * @param {Object} stats - 图片统计
   * @returns {number} 对比度评分 (0-100)
   */
  estimateContrast(stats) {
    const { stdev } = stats.channels[0] || { stdev: 50 }
    return Math.min(100, Math.max(0, (stdev / 128) * 100))
  }

  /**
   * 估算色彩丰富度
   * @param {Object} stats - 图片统计
   * @returns {number} 色彩丰富度 (0-100)
   */
  estimateColorfulness(stats) {
    // 简化版本：基于颜色通道的标准差
    const r = stats.channels[0]?.stdev || 0
    const g = stats.channels[1]?.stdev || 0
    const b = stats.channels[2]?.stdev || 0

    const avgVariance = (r + g + b) / 3
    return Math.min(100, Math.max(0, (avgVariance / 80) * 100))
  }

  /**
   * 计算总体质量
   * @param {Object} stats - 图片统计
   * @returns {number} 质量评分 (0-100)
   */
  calculateOverallQuality(stats) {
    const sharpness = this.estimateSharpness(stats)
    const contrast = this.estimateContrast(stats)

    // 质量评分：清晰度和对比度的加权平均
    return parseFloat((sharpness * 0.6 + contrast * 0.4).toFixed(1))
  }

  /**
   * 下载图片
   * @param {string} url - 图片 URL
   * @returns {Promise<Buffer>} 图片缓冲区
   */
  async downloadImage(url) {
    const https = require('https')
    const http = require('http')

    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http

      client.get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    })
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的大小
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear()
  }
}

module.exports = { ImageAnalyzer }

// 如果直接运行，执行测试
if (require.main === module) {
  const analyzer = new ImageAnalyzer()

  console.log('🖼️  Image Analyzer 测试\n')

  // 测试用例（使用占位符图片）
  const testUrls = [
    'https://via.placeholder.com/300x200.png',
    'https://via.placeholder.com/600x400.jpg',
    'https://via.placeholder.com/1920x1080.gif'
  ]

  ;(async () => {
    for (const url of testUrls) {
      console.log(`--- 分析: ${url} ---`)

      try {
        const result = await analyzer.analyzeFromUrl(url)
        console.log(`格式: ${result.format}`)
        console.log(`尺寸: ${result.size.width}x${result.size.height}`)
        console.log(`宽高比: ${result.size.aspectRatio}`)
        console.log(`类型: ${result.type}`)
        console.log(`质量: ${JSON.stringify(result.quality)}`)
        console.log()
      } catch (err) {
        console.error(`❌ 失败: ${err.message}\n`)
      }
    }
  })()
}

/**
 * Image Processor
 * 处理 Markdown 中的图片，支持本地/网络/Base64
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

class ImageProcessor {
  constructor(options = {}) {
    this.downloadRemote = options.downloadRemote ?? true;
    this.publicDir = options.publicDir || 'public/images';
    this.hashNames = options.hashNames ?? true;
    this.maxRetries = options.maxRetries || 3;
    this.processedImages = new Map(); // 缓存已处理的图片
  }

  /**
   * 处理 Markdown 中的所有图片
   * @param {string} markdown - 原始 Markdown
   * @param {string} inputPath - 输入文件路径
   * @param {string} outputDir - 输出目录
   * @returns {Object} { markdown, stats }
   */
  async process(markdown, inputPath, outputDir) {
    const inputDir = path.dirname(path.resolve(inputPath));
    const publicPath = path.join(outputDir, this.publicDir);
    
    // 确保 public 目录存在
    await fs.mkdir(publicPath, { recursive: true });
    
    // 提取所有图片
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;
    
    while ((match = imageRegex.exec(markdown)) !== null) {
      images.push({
        alt: match[1],
        original: match[2],
        full: match[0],
        index: match.index
      });
    }
    
    console.log(`📷 发现 ${images.length} 张图片`);
    
    const stats = {
      total: images.length,
      local: 0,
      remote: 0,
      base64: 0,
      copied: 0,
      downloaded: 0,
      skipped: 0,
      errors: []
    };
    
    // 处理每张图片
    for (const img of images) {
      try {
        const result = await this.processImage(img, inputDir, publicPath, outputDir);
        
        if (result.newPath) {
          // 更新 markdown
          const newTag = `![${img.alt}](${result.newPath})`;
          markdown = markdown.replace(img.full, newTag);
          
          if (result.type === 'local') stats.copied++;
          else if (result.type === 'remote') stats.downloaded++;
          else stats.skipped++;
        }
        
        stats[result.type === 'local' ? 'local' : result.type === 'remote' ? 'remote' : 'base64']++;
        
      } catch (error) {
        console.warn(`⚠️  图片处理失败: ${img.original} - ${error.message}`);
        stats.errors.push({
          image: img.original,
          error: error.message
        });
      }
    }
    
    console.log(`✅ 图片处理完成: ${stats.copied} 复制, ${stats.downloaded} 下载, ${stats.skipped} 跳过`);
    
    return { markdown, stats };
  }

  /**
   * 处理单张图片
   */
  async processImage(img, inputDir, publicPath, outputDir) {
    const imgPath = img.original;
    
    // Base64 图片 - 不处理
    if (imgPath.startsWith('data:')) {
      return { type: 'base64', newPath: null };
    }
    
    // 网络图片
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      if (this.downloadRemote) {
        const localPath = await this.downloadImage(imgPath, publicPath);
        const relativePath = '/' + this.publicDir + '/' + path.basename(localPath);
        return { type: 'remote', newPath: relativePath };
      }
      return { type: 'remote', newPath: null };
    }
    
    // 本地图片
    const absolutePath = path.isAbsolute(imgPath) 
      ? imgPath 
      : path.join(inputDir, imgPath);
    
    if (await this.fileExists(absolutePath)) {
      const localPath = await this.copyImage(absolutePath, publicPath);
      const relativePath = '/' + this.publicDir + '/' + path.basename(localPath);
      return { type: 'local', newPath: relativePath };
    } else {
      throw new Error(`图片不存在: ${absolutePath}`);
    }
  }

  /**
   * 复制本地图片
   */
  async copyImage(srcPath, publicPath) {
    // 检查缓存
    if (this.processedImages.has(srcPath)) {
      return this.processedImages.get(srcPath);
    }
    
    const ext = path.extname(srcPath);
    const hash = this.hashNames 
      ? this.generateHash(srcPath) 
      : path.basename(srcPath, ext);
    
    const destName = `${hash}${ext}`;
    const destPath = path.join(publicPath, destName);
    
    // 如果已存在且 hash 相同，跳过
    if (await this.fileExists(destPath)) {
      this.processedImages.set(srcPath, destPath);
      return destPath;
    }
    
    await fs.copyFile(srcPath, destPath);
    this.processedImages.set(srcPath, destPath);
    
    return destPath;
  }

  /**
   * 下载网络图片
   */
  async downloadImage(url, publicPath) {
    // 检查缓存
    if (this.processedImages.has(url)) {
      return this.processedImages.get(url);
    }
    
    const ext = this.getExtensionFromUrl(url) || '.png';
    const hash = this.generateHash(url);
    const destName = `${hash}${ext}`;
    const destPath = path.join(publicPath, destName);
    
    // 如果已存在，跳过
    if (await this.fileExists(destPath)) {
      this.processedImages.set(url, destPath);
      return destPath;
    }
    
    // 下载图片
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const buffer = await this.download(url);
        await fs.writeFile(destPath, buffer);
        this.processedImages.set(url, destPath);
        return destPath;
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new Error(`下载失败 (${this.maxRetries} 次尝试): ${error.message}`);
        }
        await this.sleep(1000 * attempt);
      }
    }
  }

  /**
   * 下载文件
   */
  download(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      const chunks = [];
      
      client.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // 处理重定向
          this.download(res.headers.location).then(resolve).catch(reject);
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * 从 URL 获取扩展名
   */
  getExtensionFromUrl(url) {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname);
      return ext.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) ? ext : null;
    } catch {
      return null;
    }
  }

  /**
   * 生成 Hash
   */
  generateHash(input) {
    return crypto.createHash('md5').update(input).digest('hex').slice(0, 12);
  }

  /**
   * 检查文件是否存在
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { ImageProcessor };

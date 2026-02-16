/**
 * Asset Processor
 * Handles images and other assets in presentations
 */

const fs = require('fs').promises;
const path = require('path');

class AssetProcessor {
  constructor(options = {}) {
    this.options = options;
  }

  extractAssets(markdown) {
    const images = this.extractImages(markdown);

    return {
      images,
      total: images.length
    };
  }

  extractImages(markdown) {
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
    const images = [];
    let match;

    while ((match = imageRegex.exec(markdown)) !== null) {
      images.push(match[2]); // URL is the second capture group
    }

    return images;
  }

  async validateAsset(assetPath) {
    // Check if remote URL
    if (this.isRemoteUrl(assetPath)) {
      return { valid: true, type: 'remote', url: assetPath };
    }

    // Check if local file exists
    try {
      await fs.access(assetPath);
      const stats = await fs.stat(assetPath);
      return {
        valid: true,
        type: 'local',
        path: assetPath,
        size: stats.size
      };
    } catch {
      return { valid: false, type: 'local', path: assetPath };
    }
  }

  isRemoteUrl(url) {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  optimizeImagePath(assetPath, basePath = '.') {
    // Don't modify remote URLs
    if (this.isRemoteUrl(assetPath)) {
      return assetPath;
    }

    // Convert absolute to relative
    if (path.isAbsolute(assetPath)) {
      return path.relative(basePath, assetPath);
    }

    return assetPath;
  }

  async copyAsset(sourcePath, targetDir) {
    if (this.isRemoteUrl(sourcePath)) {
      // Remote URLs don't need copying
      return { success: true, type: 'remote', url: sourcePath };
    }

    try {
      const filename = path.basename(sourcePath);
      const targetPath = path.join(targetDir, filename);

      await fs.copyFile(sourcePath, targetPath);

      return {
        success: true,
        type: 'local',
        originalPath: sourcePath,
        targetPath
      };
    } catch (error) {
      return {
        success: false,
        type: 'local',
        error: error.message
      };
    }
  }
}

module.exports = { AssetProcessor };

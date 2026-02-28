const fs = require('fs').promises;
const path = require('path');

/**
 * Disk-based cache implementation
 */
class DiskCache {
  constructor(options = {}) {
    this.dir = options.dir || '/tmp/slides-cache';
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.initialized = false;
  }

  /**
   * Initialize cache directory
   */
  async init() {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.dir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize disk cache: ${error.message}`);
    }
  }

  /**
   * Get cache file path for key
   * @param {string} key - Cache key
   * @returns {string} File path
   */
  getFilePath(key) {
    const hash = this.hash(key);
    return path.join(this.dir, `${hash}.json`);
  }

  /**
   * Generate hash for key
   * @param {string} key - Cache key
   * @returns {string} Hash
   */
  hash(key) {
    const crypto = require('crypto');
    return crypto
      .createHash('md5')
      .update(key)
      .digest('hex');
  }

  /**
   * Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null
   */
  async get(key) {
    await this.init();

    try {
      const filepath = this.getFilePath(key);
      const data = await fs.readFile(filepath, 'utf-8');
      const entry = JSON.parse(data);

      // Check if expired
      if (Date.now() - entry.timestamp > this.ttl) {
        await this.delete(key);
        return null;
      }

      return entry.value;
    } catch (error) {
      // File not found or invalid JSON
      return null;
    }
  }

  /**
   * Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @returns {Promise<void>}
   */
  async set(key, value) {
    await this.init();

    try {
      const filepath = this.getFilePath(key);
      const entry = {
        timestamp: Date.now(),
        value: value
      };

      await fs.writeFile(filepath, JSON.stringify(entry), 'utf-8');
    } catch (error) {
      // Silent fail - cache is optional
      console.warn(`Failed to write to disk cache: ${error.message}`);
    }
  }

  /**
   * Delete entry from cache
   * @param {string} key - Cache key
   * @returns {Promise<void>}
   */
  async delete(key) {
    await this.init();

    try {
      const filepath = this.getFilePath(key);
      await fs.unlink(filepath);
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  /**
   * Clear all cache entries
   * @returns {Promise<void>}
   */
  async clear() {
    if (!this.initialized) return;

    try {
      const files = await fs.readdir(this.dir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.dir, file)))
      );
    } catch (error) {
      // Directory doesn't exist or other error
      console.warn(`Failed to clear disk cache: ${error.message}`);
    }
  }

  /**
   * Get cache size in bytes
   * @returns {Promise<number>} Size in bytes
   */
  async size() {
    await this.init();

    try {
      const files = await fs.readdir(this.dir);
      let totalSize = 0;

      for (const file of files) {
        const filepath = path.join(this.dir, file);
        const stats = await fs.stat(filepath);
        totalSize += stats.size;
      }

      return totalSize;
    } catch (error) {
      return 0;
    }
  }
}

module.exports = { DiskCache };

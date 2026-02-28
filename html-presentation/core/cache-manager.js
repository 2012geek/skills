const { DiskCache } = require('../utils/disk-cache');
const { SemanticCache } = require('../utils/semantic-cache');

/**
 * Simple in-memory LRU cache implementation
 */
class SimpleLRUCache {
  constructor(options = {}) {
    this.max = options.max || 100;
    this.ttl = options.ttl || 60000;
    this.cache = new Map();
    this.timers = new Map();
  }

  set(key, value) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.max && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      this.delete(firstKey);
    }

    // Set value
    this.cache.set(key, value);

    // Set TTL
    if (this.ttl > 0) {
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key));
      }

      const timer = setTimeout(() => {
        this.delete(key);
      }, this.ttl);

      this.timers.set(key, timer);
    }
  }

  get(key) {
    return this.cache.get(key);
  }

  has(key) {
    return this.cache.has(key);
  }

  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  get size() {
    return this.cache.size;
  }
}

/**
 * Three-layer cache manager (L1 memory, L2 disk, L3 semantic)
 */
class CacheManager {
  constructor(options = {}) {
    // L1: In-memory LRU cache
    this.l1 = new SimpleLRUCache({
      max: options.l1Max || 100,
      ttl: options.l1TTL || 60000 // 1 minute
    });

    // L2: Disk cache
    this.l2 = new DiskCache({
      dir: options.cacheDir || '/tmp/slides-cache',
      ttl: options.l2TTL || 3600000 // 1 hour
    });

    // L3: Semantic cache
    this.l3 = new SemanticCache({
      threshold: options.similarityThreshold || 0.85
    });

    this.stats = {
      l1Hits: 0,
      l2Hits: 0,
      l3Hits: 0,
      misses: 0
    };
  }

  /**
   * Get value from cache (searches L1 -> L2 -> L3)
   * @param {string} key - Cache key
   * @returns {Promise<Object|null>} Object with source and value, or null
   */
  async get(key) {
    // L1: Memory cache
    const l1Value = this.l1.get(key);
    if (l1Value !== undefined) {
      this.stats.l1Hits++;
      return { source: 'L1', value: l1Value };
    }

    // L2: Disk cache
    const l2Value = await this.l2.get(key);
    if (l2Value) {
      // Promote to L1
      this.l1.set(key, l2Value);
      this.stats.l2Hits++;
      return { source: 'L2', value: l2Value };
    }

    // L3: Semantic cache
    const l3Value = await this.l3.findSimilar(key);
    if (l3Value) {
      // Promote to L1 and L2
      this.l1.set(key, l3Value);
      await this.l2.set(key, l3Value);
      this.stats.l3Hits++;
      return { source: 'L3', value: l3Value };
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Set value in all cache layers
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {Object} metadata - Optional metadata for semantic cache
   */
  async set(key, value, metadata = {}) {
    // Set in all layers
    this.l1.set(key, value);
    await this.l2.set(key, value);
    await this.l3.index(key, value, metadata);
  }

  /**
   * Delete from all cache layers
   * @param {string} key - Cache key
   */
  async delete(key) {
    this.l1.delete(key);
    await this.l2.delete(key);
    // Note: Semantic cache doesn't have delete per key
  }

  /**
   * Get cache statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const total = this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits + this.stats.misses;

    return {
      l1Hits: this.stats.l1Hits,
      l2Hits: this.stats.l2Hits,
      l3Hits: this.stats.l3Hits,
      misses: this.stats.misses,
      total,
      hitRate: total > 0 ? (this.stats.l1Hits + this.stats.l2Hits + this.stats.l3Hits) / total : 0,
      l1HitRate: total > 0 ? this.stats.l1Hits / total : 0,
      l2HitRate: total > 0 ? this.stats.l2Hits / total : 0,
      l3HitRate: total > 0 ? this.stats.l3Hits / total : 0
    };
  }

  /**
   * Print cache statistics to console
   */
  printStats() {
    const stats = this.getStats();
    console.log('\n=== Cache Statistics ===');
    console.log(`Total requests: ${stats.total}`);
    console.log(`L1 hits (memory): ${stats.l1Hits} (${(stats.l1HitRate * 100).toFixed(1)}%)`);
    console.log(`L2 hits (disk): ${stats.l2Hits} (${(stats.l2HitRate * 100).toFixed(1)}%)`);
    console.log(`L3 hits (semantic): ${stats.l3Hits} (${(stats.l3HitRate * 100).toFixed(1)}%)`);
    console.log(`Misses: ${stats.misses} (${((stats.misses / stats.total) * 100).toFixed(1)}%)`);
    console.log(`Overall hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log();
  }

  /**
   * Clear all cache layers
   */
  async clear() {
    this.l1.clear();
    await this.l2.clear();
    await this.l3.clear();
    this.stats = { l1Hits: 0, l2Hits: 0, l3Hits: 0, misses: 0 };
  }

  /**
   * Get L1 cache size
   * @returns {number} Number of entries in L1
   */
  getL1Size() {
    return this.l1.size;
  }

  /**
   * Get L2 cache size
   * @returns {Promise<number>} Size in bytes
   */
  async getL2Size() {
    return await this.l2.size();
  }

  /**
   * Get L3 cache statistics
   * @returns {Object} L3 statistics
   */
  getL3Stats() {
    return this.l3.getStats();
  }
}

module.exports = { CacheManager };

/**
 * Persistent Cache for LLM Optimizer
 * 文件持久化缓存，减少 LLM 调用成本
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================================================
// CACHE STORAGE
// ============================================================================

class CacheStorage {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.indexFile = path.join(cacheDir, 'cache-index.json');
    this.index = this.loadIndex();
  }

  /**
   * 加载缓存索引
   */
  loadIndex() {
    try {
      if (fs.existsSync(this.indexFile)) {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.warn(`⚠️  Failed to load cache index: ${err.message}`);
    }
    return { entries: {}, stats: this.createStats() };
  }

  /**
   * 保存缓存索引
   */
  saveIndex() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2));
    } catch (err) {
      console.warn(`⚠️  Failed to save cache index: ${err.message}`);
    }
  }

  /**
   * 创建统计对象
   */
  createStats() {
    return {
      hits: 0,
      misses: 0,
      created: Date.now(),
      lastAccess: Date.now()
    };
  }

  /**
   * 更新统计
   */
  updateStats(hit) {
    if (hit) {
      this.index.stats.hits++;
    } else {
      this.index.stats.misses++;
    }
    this.index.stats.lastAccess = Date.now();
    this.saveIndex();
  }

  /**
   * 生成缓存键
   */
  generateKey(content, context) {
    const hash = crypto.createHash('sha256');
    hash.update(content);
    if (context) {
      hash.update(JSON.stringify(context));
    }
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * 获取缓存
   */
  get(key) {
    const entry = this.index.entries[key];
    if (!entry) {
      this.updateStats(false);
      return null;
    }

    // 检查是否过期 (7天)
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - entry.timestamp > maxAge) {
      this.delete(key);
      this.updateStats(false);
      return null;
    }

    this.updateStats(true);

    // 读取缓存数据
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      const data = fs.readFileSync(cacheFile, 'utf-8');
      return JSON.parse(data);
    } catch (err) {
      console.warn(`⚠️  Failed to read cache ${key}: ${err.message}`);
      this.delete(key);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  set(key, value, metadata = {}) {
    const entry = {
      timestamp: Date.now(),
      metadata,
      size: JSON.stringify(value).length
    };

    this.index.entries[key] = entry;

    // 保存缓存数据
    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(value, null, 2));
    } catch (err) {
      console.warn(`⚠️  Failed to write cache ${key}: ${err.message}`);
    }

    this.saveIndex();
  }

  /**
   * 删除缓存
   */
  delete(key) {
    delete this.index.entries[key];

    const cacheFile = path.join(this.cacheDir, `${key}.json`);
    try {
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
      }
    } catch (err) {
      // Ignore
    }

    this.saveIndex();
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.index = { entries: {}, stats: this.createStats() };

    // 删除所有缓存文件
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'cache-index.json') {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    } catch (err) {
      // Ignore
    }

    this.saveIndex();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    const { hits, misses, created, lastAccess } = this.index.stats;
    const total = hits + misses;
    const hitRate = total > 0 ? (hits / total * 100).toFixed(1) : 0;
    const entries = Object.keys(this.index.entries).length;

    return {
      entries,
      hits,
      misses,
      hitRate: `${hitRate}%`,
      totalSize: this.calculateTotalSize(),
      created: new Date(created).toISOString(),
      lastAccess: new Date(lastAccess).toISOString()
    };
  }

  /**
   * 计算总缓存大小
   */
  calculateTotalSize() {
    let total = 0;
    for (const entry of Object.values(this.index.entries)) {
      total += entry.size || 0;
    }
    return `${(total / 1024).toFixed(1)} KB`;
  }

  /**
   * 清理过期缓存
   */
  cleanup(maxAge = 7 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of Object.entries(this.index.entries)) {
      if (now - entry.timestamp > maxAge) {
        this.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// ============================================================================
// OPTIMIZATION CACHE
// ============================================================================

class OptimizationCache {
  constructor(cacheDir) {
    this.storage = new CacheStorage(cacheDir);
  }

  /**
   * 缓存内容分析结果
   */
  getContentAnalysis(content) {
    const key = this.storage.generateKey(content, { type: 'analysis' });
    return this.storage.get(key);
  }

  setContentAnalysis(content, result) {
    const key = this.storage.generateKey(content, { type: 'analysis' });
    this.storage.set(key, result, { type: 'analysis' });
  }

  /**
   * 缓存内容优化结果
   */
  getContentOptimization(content, analysis) {
    const key = this.storage.generateKey(content, {
      type: 'optimization',
      analysis: this.hashAnalysis(analysis)
    });
    return this.storage.get(key);
  }

  setContentOptimization(content, analysis, result) {
    const key = this.storage.generateKey(content, {
      type: 'optimization',
      analysis: this.hashAnalysis(analysis)
    });
    this.storage.set(key, result, { type: 'optimization' });
  }

  /**
   * 缓存代码处理结果
   */
  getCodeProcessing(code, language, context) {
    const key = this.storage.generateKey(code, {
      type: 'code',
      language,
      context: JSON.stringify(context)
    });
    return this.storage.get(key);
  }

  setCodeProcessing(code, language, context, result) {
    const key = this.storage.generateKey(code, {
      type: 'code',
      language,
      context: JSON.stringify(context)
    });
    this.storage.set(key, result, { type: 'code', language });
  }

  /**
   * 分析结果哈希
   */
  hashAnalysis(analysis) {
    return crypto.createHash('md5')
      .update(JSON.stringify(analysis))
      .digest('hex')
      .substring(0, 8);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return this.storage.getStats();
  }

  /**
   * 清空缓存
   */
  clear() {
    this.storage.clear();
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    return this.storage.cleanup();
  }
}

// ============================================================================
// INCREMENTAL TRACKER
// ============================================================================

class IncrementalTracker {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.stateFile = path.join(cacheDir, 'incremental-state.json');
    this.state = this.loadState();
  }

  /**
   * 加载状态
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      // Ignore
    }
    return { files: {} };
  }

  /**
   * 保存状态
   */
  saveState() {
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch (err) {
      console.warn(`⚠️  Failed to save state: ${err.message}`);
    }
  }

  /**
   * 计算文件哈希
   */
  hashFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      return null;
    }
  }

  /**
   * 检查文件是否已更改
   */
  hasChanged(filePath) {
    const currentHash = this.hashFile(filePath);
    if (!currentHash) return true;

    const previousHash = this.state.files[filePath];
    return previousHash !== currentHash;
  }

  /**
   * 更新文件哈希
   */
  updateHash(filePath) {
    const hash = this.hashFile(filePath);
    if (hash) {
      this.state.files[filePath] = hash;
      this.saveState();
    }
  }

  /**
   * 重置文件状态
   */
  resetFile(filePath) {
    delete this.state.files[filePath];
    this.saveState();
  }

  /**
   * 清空所有状态
   */
  clear() {
    this.state = { files: {} };
    this.saveState();
  }
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

class MetricsCollector {
  constructor() {
    this.metrics = {
      optimizationTime: [],
      cacheHits: 0,
      cacheMisses: 0,
      slidesProcessed: 0,
      slidesOptimized: 0,
      codeBlocksEnhanced: 0,
      errors: []
    };
  }

  /**
   * 记录优化时间
   */
  recordTime(duration) {
    this.metrics.optimizationTime.push(duration);
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  /**
   * 记录处理的幻灯片
   */
  recordSlide(processed = true) {
    this.metrics.slidesProcessed++;
    if (processed) {
      this.metrics.slidesOptimized++;
    }
  }

  /**
   * 记录增强的代码块
   */
  recordCodeBlock() {
    this.metrics.codeBlocksEnhanced++;
  }

  /**
   * 记录错误
   */
  recordError(error) {
    this.metrics.errors.push({
      message: error.message,
      time: new Date().toISOString()
    });
  }

  /**
   * 获取报告
   */
  getReport() {
    const times = this.metrics.optimizationTime;
    const avgTime = times.length > 0
      ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)
      : 0;

    const totalCache = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalCache > 0
      ? (this.metrics.cacheHits / totalCache * 100).toFixed(1)
      : 0;

    return {
      performance: {
        avgOptimizationTime: `${avgTime}ms`,
        totalOptimizations: times.length
      },
      cache: {
        hits: this.metrics.cacheHits,
        misses: this.metrics.cacheMisses,
        hitRate: `${cacheHitRate}%`
      },
      content: {
        slidesProcessed: this.metrics.slidesProcessed,
        slidesOptimized: this.metrics.slidesOptimized,
        codeBlocksEnhanced: this.metrics.codeBlocksEnhanced,
        optimizationRate: this.metrics.slidesProcessed > 0
          ? `${(this.metrics.slidesOptimized / this.metrics.slidesProcessed * 100).toFixed(1)}%`
          : '0%'
      },
      errors: {
        count: this.metrics.errors.length,
        list: this.metrics.errors
      }
    };
  }

  /**
   * 打印报告
   */
  printReport() {
    const report = this.getReport();

    console.log('\n📊 Optimization Report');
    console.log('─'.repeat(50));
    console.log('Performance:');
    console.log(`  Avg Time: ${report.performance.avgOptimizationTime}`);
    console.log(`  Total Optimizations: ${report.performance.totalOptimizations}`);
    console.log('\nCache:');
    console.log(`  Hit Rate: ${report.cache.hitRate}`);
    console.log(`  Hits: ${report.cache.hits}`);
    console.log(`  Misses: ${report.cache.misses}`);
    console.log('\nContent:');
    console.log(`  Slides Processed: ${report.content.slidesProcessed}`);
    console.log(`  Slides Optimized: ${report.content.slidesOptimized}`);
    console.log(`  Code Blocks: ${report.content.codeBlocksEnhanced}`);
    console.log(`  Optimization Rate: ${report.content.optimizationRate}`);

    if (report.errors.count > 0) {
      console.log('\n⚠️  Errors:');
      report.errors.list.forEach(err => {
        console.log(`  - ${err.message} (${err.time})`);
      });
    }

    console.log('─'.repeat(50));
  }

  /**
   * 重置指标
   */
  reset() {
    this.metrics = {
      optimizationTime: [],
      cacheHits: 0,
      cacheMisses: 0,
      slidesProcessed: 0,
      slidesOptimized: 0,
      codeBlocksEnhanced: 0,
      errors: []
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  CacheStorage,
  OptimizationCache,
  IncrementalTracker,
  MetricsCollector
};

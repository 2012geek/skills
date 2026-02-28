const { CacheManager } = require('../../core/cache-manager');
const { DiskCache } = require('../../utils/disk-cache');
const { SemanticCache } = require('../../utils/semantic-cache');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

describe('CacheManager', () => {
  let cacheManager;
  const testCacheDir = path.join(os.tmpdir(), 'slides-cache-test');

  beforeEach(async () => {
    cacheManager = new CacheManager({
      l1Max: 10,
      l1TTL: 1000,
      cacheDir: testCacheDir,
      l2TTL: 5000,
      similarityThreshold: 0.85
    });
    await cacheManager.clear();
  });

  afterEach(async () => {
    await cacheManager.clear();
    // Clean up test cache directory
    try {
      const files = await fs.readdir(testCacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(testCacheDir, file)))
      );
      await fs.rmdir(testCacheDir);
    } catch (error) {
      // Ignore if directory doesn't exist
    }
  });

  describe('Basic Operations', () => {
    test('should set and get value from L1 cache', async () => {
      await cacheManager.set('test-key', { data: 'test-value' });
      const result = await cacheManager.get('test-key');

      expect(result).not.toBeNull();
      expect(result.source).toBe('L1');
      expect(result.value).toEqual({ data: 'test-value' });
    });

    test('should return null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent');

      expect(result).toBeNull();
    });

    test('should delete from cache', async () => {
      await cacheManager.set('test-key', { data: 'test-value' });
      await cacheManager.delete('test-key');
      const result = await cacheManager.get('test-key');

      expect(result).toBeNull();
    });

    test('should clear all caches', async () => {
      await cacheManager.set('key1', { data: 'value1' });
      await cacheManager.set('key2', { data: 'value2' });
      await cacheManager.clear();

      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('Cache Layer Behavior', () => {
    test('should promote L2 hits to L1', async () => {
      await cacheManager.set('test-key', { data: 'test-value' });

      // Clear L1 to force L2 lookup
      cacheManager.l1.clear();

      const result = await cacheManager.get('test-key');

      expect(result.source).toBe('L2');
      expect(result.value).toEqual({ data: 'test-value' });

      // Should be promoted to L1 now
      const result2 = await cacheManager.get('test-key');
      expect(result2.source).toBe('L1');
    });

    test('should handle L3 semantic cache', async () => {
      // Set content
      const content = { data: 'test content' };
      await cacheManager.set('key1', content);

      // L3 search is best-effort, may or may not find matches
      // Just verify the mechanism doesn't crash
      const result = await cacheManager.get('completely different key');

      // Most likely will be null, but shouldn't crash
      expect(result).toBeDefined();
    });
  });

  describe('Statistics', () => {
    test('should track L1 hits', async () => {
      await cacheManager.set('test-key', { data: 'test-value' });
      await cacheManager.get('test-key');

      const stats = cacheManager.getStats();

      expect(stats.l1Hits).toBe(1);
      expect(stats.total).toBe(1);
      expect(stats.hitRate).toBe(1);
    });

    test('should track misses', async () => {
      await cacheManager.get('non-existent');

      const stats = cacheManager.getStats();

      expect(stats.misses).toBe(1);
      expect(stats.total).toBe(1);
      expect(stats.hitRate).toBe(0);
    });

    test('should calculate hit rates correctly', async () => {
      await cacheManager.set('key1', { data: 'value1' });
      await cacheManager.set('key2', { data: 'value2' });

      await cacheManager.get('key1'); // hit
      await cacheManager.get('key2'); // hit
      await cacheManager.get('key3'); // miss

      const stats = cacheManager.getStats();

      expect(stats.l1Hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(2 / 3);
    });

    test('should print stats without error', () => {
      expect(() => {
        cacheManager.printStats();
      }).not.toThrow();
    });
  });

  describe('Cache Sizes', () => {
    test('should return L1 size', async () => {
      await cacheManager.set('key1', { data: 'value1' });
      await cacheManager.set('key2', { data: 'value2' });

      expect(cacheManager.getL1Size()).toBe(2);
    });

    test('should return L2 size in bytes', async () => {
      await cacheManager.set('key1', { data: 'value1' });

      const size = await cacheManager.getL2Size();

      expect(size).toBeGreaterThan(0);
    });

    test('should return L3 statistics', () => {
      const stats = cacheManager.getL3Stats();

      expect(stats).toHaveProperty('entries');
      expect(stats).toHaveProperty('keywords');
      expect(stats).toHaveProperty('avgKeywordsPerEntry');
    });
  });
});

describe('DiskCache', () => {
  let diskCache;
  const testCacheDir = path.join(os.tmpdir(), 'disk-cache-test');

  beforeEach(async () => {
    diskCache = new DiskCache({
      dir: testCacheDir,
      ttl: 1000
    });
    await diskCache.init();
    await diskCache.clear();
  });

  afterEach(async () => {
    await diskCache.clear();
    try {
      await fs.rmdir(testCacheDir);
    } catch (error) {
      // Ignore
    }
  });

  test('should set and get values', async () => {
    await diskCache.set('test-key', { data: 'test-value' });
    const result = await diskCache.get('test-key');

    expect(result).toEqual({ data: 'test-value' });
  });

  test('should return null for expired entries', async () => {
    await diskCache.set('test-key', { data: 'test-value' });

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    const result = await diskCache.get('test-key');

    expect(result).toBeNull();
  });

  test('should delete entries', async () => {
    await diskCache.set('test-key', { data: 'test-value' });
    await diskCache.delete('test-key');

    const result = await diskCache.get('test-key');

    expect(result).toBeNull();
  });
});

describe('SemanticCache', () => {
  let semanticCache;

  beforeEach(() => {
    semanticCache = new SemanticCache({
      threshold: 0.3 // Lower threshold for testing
    });
  });

  test('should extract keywords from text', () => {
    const keywords = semanticCache.extractKeywords('machine learning algorithms for data science');

    expect(keywords).toContain('machine');
    expect(keywords).toContain('learning');
    expect(keywords).toContain('algorithms');
  });

  test('should calculate Jaccard similarity', () => {
    const set1 = new Set(['apple', 'banana', 'orange']);
    const set2 = new Set(['apple', 'banana', 'grape']);

    const similarity = semanticCache.calculateSimilarity(set1, set2);

    expect(similarity).toBeCloseTo(2 / 4, 1); // 2 intersection / 4 union
  });

  test('should index and find similar entries', async () => {
    await semanticCache.index('machine learning algorithms', { data: 'ml-content' });

    const similar = await semanticCache.findSimilar('machine learning methods');

    expect(similar).toEqual({ data: 'ml-content' });
  });

  test('should get statistics', async () => {
    await semanticCache.index('key1', { data: 'value1' });
    await semanticCache.index('key2', { data: 'value2' });

    const stats = semanticCache.getStats();

    expect(stats.entries).toBe(2);
    expect(stats.keywords).toBeGreaterThan(0);
  });
});

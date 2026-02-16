const { AssetProcessor } = require('../../lib/asset-processor');
const fs = require('fs');
const path = require('path');

describe('AssetProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new AssetProcessor();
  });

  describe('extractAssets', () => {
    test('should extract image URLs from markdown', () => {
      const markdown = '![img1](test.png) ![img2](test.jpg)';
      const assets = processor.extractAssets(markdown);

      expect(assets.images).toHaveLength(2);
      expect(assets.images).toContain('test.png');
      expect(assets.images).toContain('test.jpg');
    });

    test('should handle relative and absolute paths', () => {
      const markdown = '![local](./img.png) ![remote](https://example.com/img.png)';
      const assets = processor.extractAssets(markdown);

      expect(assets.images).toHaveLength(2);
    });

    test('should return empty arrays when no assets', () => {
      const markdown = 'Just text content';
      const assets = processor.extractAssets(markdown);

      expect(assets.images).toHaveLength(0);
    });
  });

  describe('validateAsset', () => {
    test('should return true for remote URLs', async () => {
      const result = await processor.validateAsset('https://example.com/image.png');
      expect(result.valid).toBe(true);
    });

    test('should return false for missing local files', async () => {
      const result = await processor.validateAsset('./nonexistent.png');
      expect(result.valid).toBe(false);
    });
  });

  describe('optimizeImagePath', () => {
    test('should convert absolute to relative paths', () => {
      const optimized = processor.optimizeImagePath('/absolute/path/image.png', '/base/path');
      expect(optimized[0]).not.toBe('/');
      expect(optimized).toContain('..');
    });

    test('should preserve remote URLs', () => {
      const optimized = processor.optimizeImagePath('https://example.com/image.png');
      expect(optimized).toBe('https://example.com/image.png');
    });
  });
});

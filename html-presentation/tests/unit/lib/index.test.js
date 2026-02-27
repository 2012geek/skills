/**
 * Tests for lib/index.js (v2.0 API)
 *
 * Note: v2.0 has breaking changes from v1.x
 * - LayoutEngine, ThemeManager, AssetProcessor removed or moved
 * - SlideGenerator, ContentAnalyzer now in core/ directory
 * - Only core modules are exported from lib/index.js
 */

const {
  ContentAnalyzer,
  LayoutSelector,
  SlideGenerator
} = require('../../../lib/index');

describe('Lib Index (v2.0)', () => {
  test('should export all v2 core modules', () => {
    expect(ContentAnalyzer).toBeDefined();
    expect(LayoutSelector).toBeDefined();
    expect(SlideGenerator).toBeDefined();
  });

  test('should be able to instantiate exported classes', () => {
    expect(new ContentAnalyzer()).toBeInstanceOf(ContentAnalyzer);
    expect(new LayoutSelector()).toBeInstanceOf(LayoutSelector);
    expect(new SlideGenerator()).toBeInstanceOf(SlideGenerator);
  });

  test('should NOT export deprecated v1 modules', () => {
    const lib = require('../../../lib/index');
    expect(lib.LayoutEngine).toBeUndefined();
    expect(lib.ThemeManager).toBeUndefined();
    expect(lib.AssetProcessor).toBeUndefined();
  });
});

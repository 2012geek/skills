const {
  ContentAnalyzer,
  LayoutEngine,
  ThemeManager,
  SlideGenerator,
  AssetProcessor
} = require('../../../lib/index');

describe('Lib Index', () => {
  test('should export all lib modules', () => {
    expect(ContentAnalyzer).toBeDefined();
    expect(LayoutEngine).toBeDefined();
    expect(ThemeManager).toBeDefined();
    expect(SlideGenerator).toBeDefined();
    expect(AssetProcessor).toBeDefined();
  });

  test('should be able to instantiate exported classes', () => {
    expect(new ContentAnalyzer()).toBeInstanceOf(ContentAnalyzer);
    expect(new LayoutEngine()).toBeInstanceOf(LayoutEngine);
    expect(new ThemeManager()).toBeInstanceOf(ThemeManager);
    expect(new SlideGenerator()).toBeInstanceOf(SlideGenerator);
    expect(new AssetProcessor()).toBeInstanceOf(AssetProcessor);
  });
});

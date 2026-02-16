const { LayoutEngine } = require('../../lib/layout-engine');

describe('LayoutEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new LayoutEngine();
  });

  describe('selectLayout', () => {
    test('should select code-focus for code-heavy content', () => {
      const metrics = { codeRatio: 0.7, imageRatio: 0, textRatio: 0.3 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('code-focus');
    });

    test('should select code-full for 90%+ code', () => {
      const metrics = { codeRatio: 0.95, imageRatio: 0, textRatio: 0.05 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('code-full');
    });

    test('should select image-focus for image-heavy content', () => {
      const metrics = { codeRatio: 0, imageRatio: 0.7, textRatio: 0.3 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('image-focus');
    });

    test('should select two-col-image for balanced code and images', () => {
      const metrics = { codeRatio: 0.4, imageRatio: 0.4, textRatio: 0.2 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('two-col-image');
    });

    test('should select two-col for code and text', () => {
      const metrics = { codeRatio: 0.4, imageRatio: 0, textRatio: 0.6 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('two-col');
    });

    test('should select default for text-only content', () => {
      const metrics = { codeRatio: 0, imageRatio: 0, textRatio: 1.0 };
      const layout = engine.selectLayout(metrics);
      expect(layout).toBe('default');
    });
  });

  describe('getLayoutConfig', () => {
    test('should return layout configuration', () => {
      const config = engine.getLayoutConfig('code-focus');

      expect(config).toBeDefined();
      expect(config.name).toBe('code-focus');
      expect(config.description).toBeDefined();
    });

    test('should return undefined for unknown layout', () => {
      const config = engine.getLayoutConfig('unknown-layout');
      expect(config).toBeUndefined();
    });
  });

  describe('listLayouts', () => {
    test('should return all available layouts', () => {
      const layouts = engine.listLayouts();

      expect(Array.isArray(layouts)).toBe(true);
      expect(layouts.length).toBeGreaterThan(0);
      expect(layouts).toContain('default');
      expect(layouts).toContain('code-focus');
    });
  });
});

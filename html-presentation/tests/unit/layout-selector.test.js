const { LayoutSelector } = require('../../core/layout-selector');

describe('LayoutSelector', () => {
  test('should select center for title slides', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      hasH1: true,
      minimalContent: true
    });

    expect(layout).toBe('center');
  });

  test('should select two-cols for balanced code and text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      codeRatio: 0.5,
      textRatio: 0.5,
      imageRatio: 0
    });

    expect(layout).toBe('two-cols');
  });

  test('should select default for plain text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      textRatio: 1.0,
      codeRatio: 0,
      imageRatio: 0
    });

    expect(layout).toBe('default');
  });

  test('should select image-right for images with text', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      textRatio: 0.6,
      imageRatio: 0.4,
      codeRatio: 0,
      firstElementIsImage: false
    });

    expect(layout).toBe('image-right');
  });

  // Critical Issue 1: Null/undefined input handling
  describe('Input validation', () => {
    test('should return default for null input', () => {
      const selector = new LayoutSelector();
      expect(selector.select(null)).toBe('default');
    });

    test('should return default for undefined input', () => {
      const selector = new LayoutSelector();
      expect(selector.select(undefined)).toBe('default');
    });

    test('should return default for non-object input', () => {
      const selector = new LayoutSelector();
      expect(selector.select('string')).toBe('default');
      expect(selector.select(123)).toBe('default');
      expect(selector.select([])).toBe('default');
    });
  });

  // Critical Issue 2: H1 with moderate content
  test('should select center for H1 with moderate image content', () => {
    const selector = new LayoutSelector();
    const layout = selector.select({
      hasH1: true,
      minimalContent: false,
      imageRatio: 0.4,
      textRatio: 0.6
    });

    expect(layout).toBe('center');
  });

  // Important Issue 3: Ratio normalization
  describe('Ratio normalization', () => {
    test('should handle negative ratios', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: -0.5,
        textRatio: -0.3,
        imageRatio: -0.2
      });

      expect(layout).toBe('default');
    });

    test('should handle ratios exceeding 1.0', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 1.5,
        textRatio: 2.0,
        imageRatio: 3.0
      });

      // Should normalize to 1.0, making it code-heavy
      expect(layout).toBe('default');
    });

    test('should handle mixed extreme ratios', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: -0.2,
        textRatio: 1.8,
        imageRatio: 0
      });

      // Should normalize: codeRatio=0, textRatio=1.0
      expect(layout).toBe('default');
    });
  });

  // Important Issue 7: Boundary value tests
  describe('Boundary values', () => {
    test('should handle codeRatio at 0.3 threshold', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0.3,
        textRatio: 0.3,
        imageRatio: 0
      });

      expect(layout).toBe('two-cols');
    });

    test('should handle codeRatio just below 0.3 threshold', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0.29,
        textRatio: 0.71,
        imageRatio: 0
      });

      expect(layout).toBe('default');
    });

    test('should handle imageRatio at 0.3 threshold', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0,
        textRatio: 0.7,
        imageRatio: 0.3,
        firstElementIsImage: true
      });

      expect(layout).toBe('image-left');
    });

    test('should handle imageRatio at 0.6 threshold', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0,
        textRatio: 0.4,
        imageRatio: 0.6
      });

      expect(layout).toBe('image');
    });
  });

  // Important Issue 7: Utility method tests
  describe('Utility methods', () => {
    test('getStandardLayouts should return all standard layouts', () => {
      const selector = new LayoutSelector();
      const layouts = selector.getStandardLayouts();

      expect(layouts).toEqual([
        'default', 'center', 'cover', 'two-cols', 'two-cols-header',
        'image', 'image-left', 'image-right', 'section', 'quote'
      ]);
    });

    test('isValidLayout should validate correctly', () => {
      const selector = new LayoutSelector();

      expect(selector.isValidLayout('default')).toBe(true);
      expect(selector.isValidLayout('center')).toBe(true);
      expect(selector.isValidLayout('cover')).toBe(true);
      expect(selector.isValidLayout('two-cols')).toBe(true);
      expect(selector.isValidLayout('non-existent')).toBe(false);
      expect(selector.isValidLayout('')).toBe(false);
      expect(selector.isValidLayout(null)).toBe(false);
    });
  });

  // Additional edge case tests
  describe('Edge cases', () => {
    test('should select cover for H1 with heavy image content', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        hasH1: true,
        imageRatio: 0.8,
        textRatio: 0.2
      });

      expect(layout).toBe('cover');
    });

    test('should select section for section dividers', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        textRatio: 0.95,
        codeRatio: 0,
        imageRatio: 0,
        isSection: true
      });

      expect(layout).toBe('section');
    });

    test('should select image-left when first element is image', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        textRatio: 0.6,
        imageRatio: 0.4,
        codeRatio: 0,
        firstElementIsImage: true
      });

      expect(layout).toBe('image-left');
    });

    test('should select default for code-heavy content', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0.95,
        textRatio: 0.05,
        imageRatio: 0
      });

      expect(layout).toBe('default');
    });

    test('should select two-cols for code-medium content', () => {
      const selector = new LayoutSelector();
      const layout = selector.select({
        codeRatio: 0.7,
        textRatio: 0.3,
        imageRatio: 0
      });

      expect(layout).toBe('two-cols');
    });
  });
});

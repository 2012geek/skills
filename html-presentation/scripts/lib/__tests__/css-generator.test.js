const { generateSmartCSS } = require('../css-generator');

describe('Smart CSS Generator', () => {
  describe('Basic CSS generation', () => {
    test('should generate CSS with default options', () => {
      const css = generateSmartCSS();

      expect(css).toContain('--slide-max-width');
      expect(css).toContain('--slide-padding');
      expect(css).toContain('--container-max-height');
      expect(css).toContain('.slidev-layout');
    });

    test('should accept custom options', () => {
      const css = generateSmartCSS({
        maxWidth: '900px',
        padding: '40px'
      });

      expect(css).toContain('900px');
      expect(css).toContain('40px');
    });
  });

  describe('CSS Variables (Layer 1)', () => {
    test('should define all required CSS variables', () => {
      const css = generateSmartCSS();

      expect(css).toContain(':root');
      expect(css).toContain('--slide-max-width');
      expect(css).toContain('--slide-padding');
      expect(css).toContain('--container-max-height');
      expect(css).toContain('--text-max-width');
      expect(css).toContain('--code-max-height');
      expect(css).toContain('--grid-gap');
    });

    test('should use custom values for variables', () => {
      const css = generateSmartCSS({
        maxWidth: '1000px',
        padding: '50px',
        maxHeight: '85vh'
      });

      expect(css).toContain('--slide-max-width: 1000px');
      expect(css).toContain('--slide-padding: 50px');
      expect(css).toContain('--container-max-height: 85vh');
    });
  });

  describe('Container Constraints (Layer 2)', () => {
    test('should add container overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout');
      expect(css).toContain('max-width: var(--slide-max-width)');
      expect(css).toContain('padding: var(--slide-padding)');
      expect(css).toContain('overflow-x: hidden');
    });
  });

  describe('Text Constraints (Layer 3)', () => {
    test('should add text overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout h1,');
      expect(css).toContain('.slidev-layout h2,');
      expect(css).toContain('.slidev-layout h3');
      expect(css).toContain('overflow-wrap: break-word');
      expect(css).toContain('word-wrap: break-word');
      expect(css).toContain('hyphens: auto');
    });

    test('should constrain paragraph text', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout p');
      expect(css).toContain('max-width: var(--text-max-width)');
      expect(css).toContain('overflow: hidden');
    });
  });

  describe('Code Block Constraints (Layer 4)', () => {
    test('should add code block overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout pre');
      expect(css).toContain('max-height: var(--code-max-height)');
      expect(css).toContain('overflow: auto');
    });
  });

  describe('Image Constraints (Layer 5)', () => {
    test('should add image overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout img');
      expect(css).toContain('max-width: 100%');
      expect(css).toContain('height: auto');
      expect(css).toContain('object-fit: contain');
    });
  });

  describe('Grid Constraints (Layer 6)', () => {
    test('should add grid overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout [style*="grid"]');
      expect(css).toContain('overflow: hidden');
      expect(css).toContain('min-width: 0');
    });
  });

  describe('List Constraints (Layer 7)', () => {
    test('should add list overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout ul,');
      expect(css).toContain('.slidev-layout ol');
      expect(css).toContain('overflow: hidden');
      expect(css).toContain('word-wrap: break-word');
    });
  });

  describe('Table Constraints (Layer 8)', () => {
    test('should add table overflow protection', () => {
      const css = generateSmartCSS();

      expect(css).toContain('.slidev-layout table');
      expect(css).toContain('overflow: auto');
      expect(css).toContain('display: block');
    });
  });

  describe('Custom Layouts', () => {
    test('should generate center layout specific CSS', () => {
      const css = generateSmartCSS({ layout: 'center' });

      expect(css).toContain('.layout-center');
      expect(css).toContain('display: flex');
      expect(css).toContain('align-items: center');
      expect(css).toContain('justify-content: center');
    });

    test('should generate two-column layout specific CSS', () => {
      const css = generateSmartCSS({ layout: 'two-col' });

      expect(css).toContain('.layout-two-col');
      expect(css).toContain('display: grid');
      expect(css).toContain('grid-template-columns');
    });
  });

  describe('Feature Flags', () => {
    test('should respect enableTextWrapping flag', () => {
      const css = generateSmartCSS({ enableTextWrapping: false });

      // Should not include text wrapping section when disabled
      expect(css).not.toContain('.slidev-layout h1,');
      expect(css).not.toContain('max-width: var(--text-max-width)');
      expect(css).not.toContain('hyphens: auto');
    });

    test('should respect enableCodeScroll flag', () => {
      const css = generateSmartCSS({ enableCodeScroll: false });

      // Should not include code section when disabled
      expect(css).not.toContain('.slidev-layout pre');
      expect(css).not.toContain('max-height: var(--code-max-height)');
    });

    test('should respect enableImageScaling flag', () => {
      const css = generateSmartCSS({ enableImageScaling: false });

      // Should not include image section when disabled
      expect(css).not.toContain('.slidev-layout img');
      expect(css).not.toContain('object-fit: contain');
    });
  });

  describe('CSS Validity', () => {
    test('should generate valid CSS with matching braces', () => {
      const css = generateSmartCSS();

      const openBraces = (css.match(/{/g) || []).length;
      const closeBraces = (css.match(/}/g) || []).length;

      expect(openBraces).toBe(closeBraces);
      expect(openBraces).toBeGreaterThan(0);
    });

    test('should generate CSS with proper semicolons', () => {
      const css = generateSmartCSS();

      // Check that rules end with semicolons
      const rules = css.split('{')[1].split('}')[0];
      const hasProperSemicolons = rules.includes(';');

      expect(hasProperSemicolons).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty options', () => {
      const css = generateSmartCSS({});

      expect(css).toBeTruthy();
      expect(css.length).toBeGreaterThan(0);
    });

    test('should handle null options', () => {
      const css = generateSmartCSS(null);

      expect(css).toBeTruthy();
      expect(css.length).toBeGreaterThan(0);
    });

    test('should handle undefined options', () => {
      const css = generateSmartCSS(undefined);

      expect(css).toBeTruthy();
      expect(css.length).toBeGreaterThan(0);
    });
  });
});

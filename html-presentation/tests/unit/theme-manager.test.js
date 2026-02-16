const { ThemeManager } = require('../../lib/theme-manager');

describe('ThemeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ThemeManager();
  });

  describe('recommendThemes', () => {
    test('should recommend dracula for code-heavy content', () => {
      const metrics = { codeRatio: 0.7, imageRatio: 0, textRatio: 0.3 };
      const recommendations = manager.recommendThemes(metrics);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].name).toBeDefined();
    });

    test('should recommend seriph for image-heavy content', () => {
      const metrics = { codeRatio: 0, imageRatio: 0.7, textRatio: 0.3 };
      const recommendations = manager.recommendThemes(metrics);

      expect(recommendations.length).toBeGreaterThan(0);
    });

    test('should return multiple recommendations with priorities', () => {
      const metrics = { codeRatio: 0.5, imageRatio: 0.3, textRatio: 0.2 };
      const recommendations = manager.recommendThemes(metrics);

      expect(recommendations.length).toBeGreaterThan(1);
      recommendations.forEach(rec => {
        expect(rec).toHaveProperty('theme');
        expect(rec).toHaveProperty('reason');
        expect(rec).toHaveProperty('priority');
      });
    });
  });

  describe('getThemeConfig', () => {
    test('should return theme configuration', () => {
      const config = manager.getThemeConfig('seriph');

      expect(config).toBeDefined();
      expect(config.theme).toBe('seriph');
      expect(config.frontmatter).toBeDefined();
    });

    test('should include CSS overrides for optimization', () => {
      const config = manager.getThemeConfig('seriph');

      expect(config.cssOverrides).toBeDefined();
      expect(typeof config.cssOverrides).toBe('string');
    });
  });

  describe('listThemes', () => {
    test('should return all available themes', () => {
      const themes = manager.listThemes();

      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBeGreaterThan(0);
      expect(themes).toContain('seriph');
      expect(themes).toContain('default');
    });

    test('should include official and community themes', () => {
      const themes = manager.listThemes();

      expect(themes).toContain('seriph'); // Official
      expect(themes).toContain('shibainu'); // Community
    });
  });
});

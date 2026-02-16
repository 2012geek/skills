const { ExportManager } = require('../../preview/export-manager');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    writeFile: jest.fn().mockResolvedValue(true)
  }
}));

describe('ExportManager', () => {
  let manager;

  beforeEach(() => {
    manager = new ExportManager();
  });

  describe('constructor', () => {
    test('should create ExportManager instance', () => {
      expect(manager).toBeInstanceOf(ExportManager);
      expect(manager.options).toBeDefined();
    });
  });

  describe('exportToPDF', () => {
    test('should have exportToPDF method', () => {
      expect(typeof manager.exportToPDF).toBe('function');
    });

    test('should return error object on failure', async () => {
      // This will fail without a running server, which is expected
      const result = await manager.exportToPDF({
        url: 'http://localhost:9999', // Non-existent server
        outputPath: '/tmp/test.pdf'
      });

      // Should handle the error gracefully
      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toBeTruthy();
    });
  });

  describe('exportToHTML', () => {
    test('should have exportToHTML method', () => {
      expect(typeof manager.exportToHTML).toBe('function');
    });

    test('should return error object on failure', async () => {
      const result = await manager.exportToHTML({
        url: 'http://localhost:9999',
        outputPath: '/tmp/test.html'
      });

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });
  });

  describe('captureScreenshot', () => {
    test('should have captureScreenshot method', () => {
      expect(typeof manager.captureScreenshot).toBe('function');
    });

    test('should return error object on failure', async () => {
      const result = await manager.captureScreenshot({
        url: 'http://localhost:9999',
        outputPath: '/tmp/screenshot.png'
      });

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });

    test('should accept captureAll option', async () => {
      const result = await manager.captureScreenshot({
        url: 'http://localhost:9999',
        outputPath: '/tmp/slide-',
        captureAll: true
      });

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
    });
  });
});

const { PuppeteerCapturer, PuppeteerCapturerError } = require('../../core/puppeteer-capturer');

describe('PuppeteerCapturer Integration', () => {
  let capturer;

  beforeEach(() => {
    capturer = new PuppeteerCapturer();
  });

  afterEach(async () => {
    if (capturer) {
      await capturer.close();
    }
  });

  test('should capture screenshot of webpage', async () => {
    const result = await capturer.capture('https://example.com');

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
  }, 60000);

  test('should capture screenshot and save to disk', async () => {
    const savePath = 'test-screenshot.png';
    let result;

    try {
      result = await capturer.capture('https://example.com', {
        savePath
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.path).toBeDefined();
      expect(result.path).toContain('test-screenshot.png');
    } finally {
      // Clean up the saved file
      const fs = require('fs').promises;
      try {
        if (result?.path) {
          await fs.unlink(result.path);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 60000);

  test('should handle multiple captures', async () => {
    const result1 = await capturer.capture('https://example.com');
    const result2 = await capturer.capture('https://example.com');

    expect(result1.buffer).toBeInstanceOf(Buffer);
    expect(result2.buffer).toBeInstanceOf(Buffer);
    expect(result1.buffer.length).toBeGreaterThan(0);
    expect(result2.buffer.length).toBeGreaterThan(0);
  }, 60000);

  test('should throw error for invalid URL', async () => {
    await expect(capturer.capture('not-a-url')).rejects.toThrow(PuppeteerCapturerError);
    await expect(capturer.capture('not-a-url')).rejects.toThrow('Invalid URL');
  }, 10000);

  test('should throw error for empty URL', async () => {
    await expect(capturer.capture('')).rejects.toThrow(PuppeteerCapturerError);
    await expect(capturer.capture('')).rejects.toThrow('URL must be a non-empty string');
  }, 10000);

  test('should throw error for invalid options', async () => {
    await expect(capturer.capture('https://example.com', 'invalid')).rejects.toThrow(PuppeteerCapturerError);
    await expect(capturer.capture('https://example.com', 'invalid')).rejects.toThrow('Options must be an object');
  }, 10000);

  test('should throw error for invalid savePath', async () => {
    await expect(capturer.capture('https://example.com', { savePath: 123 })).rejects.toThrow(PuppeteerCapturerError);
    await expect(capturer.capture('https://example.com', { savePath: 123 })).rejects.toThrow('savePath must be a string');
  }, 10000);
});

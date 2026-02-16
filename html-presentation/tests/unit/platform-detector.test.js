const { PlatformDetector } = require('../../core/platform-detector');
const { execSync } = require('child_process');

// Mock execSync to avoid actual system calls
jest.mock('child_process');

describe('PlatformDetector', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getPlatform', () => {
    test('should return platform information', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const detector = new PlatformDetector();
      const platform = detector.getPlatform();

      expect(platform).toHaveProperty('type', 'darwin');
      expect(platform).toHaveProperty('hasDisplay');
      expect(platform).toHaveProperty('defaultBrowser');
      expect(platform).toHaveProperty('defaultPath');

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('checkDisplay (macOS)', () => {
    test('should return true when WindowServer is running', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execSync.mockReturnValue(Buffer.from('12345'));

      const detector = new PlatformDetector();
      const hasDisplay = detector.checkDisplay();

      expect(hasDisplay).toBe(true);
      expect(execSync).toHaveBeenCalledWith('pgrep WindowServer', {
        stdio: 'ignore'
      });
    });

    test('should return false when WindowServer is not running', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      execSync.mockImplementation(() => {
        throw new Error('Process not found');
      });

      const detector = new PlatformDetector();
      const hasDisplay = detector.checkDisplay();

      expect(hasDisplay).toBe(false);
    });
  });

  describe('checkDisplay (Linux)', () => {
    test('should return true when DISPLAY is set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.DISPLAY = ':0';

      const detector = new PlatformDetector();
      const hasDisplay = detector.checkDisplay();

      expect(hasDisplay).toBe(true);

      delete process.env.DISPLAY;
    });

    test('should return false when DISPLAY is not set', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      delete process.env.DISPLAY;

      const detector = new PlatformDetector();
      const hasDisplay = detector.checkDisplay();

      expect(hasDisplay).toBe(false);
    });
  });

  describe('checkDisplay (Windows)', () => {
    test('should always return true on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const detector = new PlatformDetector();
      const hasDisplay = detector.checkDisplay();

      expect(hasDisplay).toBe(true);
    });
  });

  describe('getDefaultBrowser', () => {
    test('should return Chrome path on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const detector = new PlatformDetector();
      const browser = detector.getDefaultBrowser();

      expect(browser).toContain('Google Chrome');
    });

    test('should return google-chrome on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const detector = new PlatformDetector();
      const browser = detector.getDefaultBrowser();

      expect(browser).toBe('google-chrome');
    });

    test('should return Chrome path on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const detector = new PlatformDetector();
      const browser = detector.getDefaultBrowser();

      expect(browser).toContain('chrome.exe');
    });
  });
});

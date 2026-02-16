const { PreviewManager } = require('../../preview/preview-manager');
const { PlatformDetector } = require('../../core/platform-detector');

// Mock PlatformDetector and Puppeteer
jest.mock('../../core/platform-detector');
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue(true)
    }),
    pages: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(true)
  })
}));

describe('PreviewManager', () => {
  let manager;
  let mockPlatformDetector;

  beforeEach(() => {
    mockPlatformDetector = new PlatformDetector();
    mockPlatformDetector.checkDisplay = jest.fn().mockReturnValue(true);
    mockPlatformDetector.getPlatform = jest.fn().mockReturnValue({
      type: 'darwin',
      hasDisplay: true,
      defaultBrowser: '/Applications/Google Chrome.app'
    });

    manager = new PreviewManager({
      platformDetector: mockPlatformDetector
    });
  });

  afterEach(async () => {
    if (manager.isRunning()) {
      await manager.stop();
    }
  });

  describe('start', () => {
    test('should return server info when starting', async () => {
      // Mock the server start to avoid actually starting Slidev
      manager._startSlidevServer = jest.fn().mockResolvedValue({
        pid: 12345,
        port: 3030
      });

      manager.launchBrowser = jest.fn().mockResolvedValue(true);
      manager.openPage = jest.fn().mockResolvedValue(true);

      // Mock file watcher
      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      const result = await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(result).toHaveProperty('server');
      expect(result).toHaveProperty('url');
      expect(result.url).toContain('http://localhost');
    });

    test('should launch browser when display available', async () => {
      manager._startSlidevServer = jest.fn().mockResolvedValue({});
      manager.launchBrowser = jest.fn().mockResolvedValue(true);
      manager.openPage = jest.fn().mockResolvedValue(true);

      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(manager.launchBrowser).toHaveBeenCalled();
    });

    test('should not launch browser in headless mode', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(false);

      manager._startSlidevServer = jest.fn().mockResolvedValue({});
      manager.launchBrowser = jest.fn().mockResolvedValue(true);

      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      expect(manager.launchBrowser).not.toHaveBeenCalled();
    });
  });

  describe('launchBrowser', () => {
    test('should set browser property when launched', async () => {
      manager._startSlidevServer = jest.fn().mockResolvedValue({});
      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      // Browser should be launched when display is available
      expect(mockPlatformDetector.checkDisplay).toHaveBeenCalled();
      expect(manager.browser).not.toBe(null);
    });
  });

  describe('stop', () => {
    test('should stop preview server', async () => {
      manager._startSlidevServer = jest.fn().mockResolvedValue({
        kill: jest.fn()
      });

      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      const result = await manager.stop();
      expect(result).toBe(true);
    });

    test('should close browser when stopping', async () => {
      manager._startSlidevServer = jest.fn().mockResolvedValue({
        kill: jest.fn()
      });

      manager.closeBrowser = jest.fn().mockResolvedValue(true);

      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({
        inputFile: 'test.md',
        port: 3030
      });

      await manager.stop();
      expect(manager.fileWatcher.stop).toHaveBeenCalled();
    });
  });

  describe('isRunning', () => {
    test('should return true when running', async () => {
      const mockServer = { kill: jest.fn() };
      manager._startSlidevServer = jest.fn().mockImplementation(() => {
        manager.server = mockServer;
        return Promise.resolve(mockServer);
      });

      manager.fileWatcher = {
        watch: jest.fn().mockResolvedValue(true),
        isWatching: jest.fn().mockReturnValue(true),
        on: jest.fn(),
        stop: jest.fn().mockResolvedValue(true)
      };

      await manager.start({ inputFile: 'test.md', port: 3030 });
      expect(manager.isRunning()).toBe(true);
      await manager.stop();
    });

    test('should return false when not running', () => {
      expect(manager.isRunning()).toBe(false);
    });
  });
});

const { PreviewManager } = require('../../preview');

// Mock Puppeteer for integration tests
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      goto: jest.fn().mockResolvedValue(true)
    }),
    pages: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(true)
  })
}));

describe('Preview Workflow Integration', () => {
  let manager;

  afterEach(async () => {
    if (manager && manager.isRunning()) {
      await manager.stop();
    }
  });

  test('should start and stop preview', async () => {
    manager = new PreviewManager();

    // Mock the server start to avoid actually starting Slidev
    manager._startSlidevServer = jest.fn().mockImplementation(() => {
      manager.server = { kill: jest.fn() };
      return Promise.resolve(manager.server);
    });

    // Mock file watcher
    manager.fileWatcher = {
      watch: jest.fn().mockResolvedValue(true),
      isWatching: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      stop: jest.fn().mockResolvedValue(true)
    };

    const result = await manager.start({
      inputFile: 'tests/fixtures/simple.md',
      port: 3030
    });

    expect(result.server).toBeDefined();
    expect(result.url).toContain('localhost:3030');

    const stopResult = await manager.stop();
    expect(stopResult).toBe(true);
  });

  test('should handle file watcher integration', async () => {
    manager = new PreviewManager();

    manager._startSlidevServer = jest.fn().mockImplementation(() => {
      manager.server = { kill: jest.fn() };
      return Promise.resolve(manager.server);
    });

    manager.fileWatcher = {
      watch: jest.fn().mockResolvedValue(true),
      isWatching: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      stop: jest.fn().mockResolvedValue(true)
    };

    await manager.start({
      inputFile: 'tests/fixtures/simple.md',
      port: 3030
    });

    // File watcher should be started
    expect(manager.fileWatcher.watch).toHaveBeenCalledWith(
      'tests/fixtures/simple.md',
      { debounce: 200 }
    );

    await manager.stop();
  });
});

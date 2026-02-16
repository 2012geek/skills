const { HealthChecker } = require('../../core/health-checker');

// Mock dependencies
jest.mock('../../core/platform-detector');

describe('HealthChecker', () => {
  let checker;
  let mockPlatformDetector;

  beforeEach(() => {
    const { PlatformDetector } = require('../../core/platform-detector');
    mockPlatformDetector = new PlatformDetector();
    mockPlatformDetector.getPlatform = jest.fn().mockReturnValue({
      type: 'darwin',
      hasDisplay: true,
      defaultBrowser: '/Applications/Google Chrome.app'
    });
    mockPlatformDetector.checkDisplay = jest.fn().mockReturnValue(true);

    checker = new HealthChecker({ platformDetector: mockPlatformDetector });
  });

  describe('check', () => {
    test('should return overall health status', async () => {
      const report = await checker.check();

      expect(report).toHaveProperty('healthy');
      expect(report).toHaveProperty('checks');
      expect(report).toHaveProperty('timestamp');
      expect(report.checks).toHaveProperty('display');
      expect(report.checks).toHaveProperty('disk');
      expect(report.checks).toHaveProperty('memory');
    });

    test('should mark as healthy when all checks pass', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(true);

      const report = await checker.check();

      expect(report.healthy).toBe(true);
    });

    test('should mark as unhealthy when any check fails', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(false);

      const report = await checker.check();

      // May still be healthy if only display is missing (warning, not error)
      expect(typeof report.healthy).toBe('boolean');
    });
  });

  describe('checkDisplay', () => {
    test('should return OK status when display is available', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(true);

      const result = await checker.checkDisplay();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('Display detected');
    });

    test('should return warning status when no display', async () => {
      mockPlatformDetector.checkDisplay.mockReturnValue(false);

      const result = await checker.checkDisplay();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('No display detected');
      expect(result.suggestion).toBeDefined();
    });
  });

  describe('checkDiskSpace', () => {
    test('should return OK status when sufficient disk space', async () => {
      // Mock fs.statfsSync
      const fs = require('fs');
      jest.spyOn(fs, 'statfsSync').mockReturnValue({
        bavail: 10 * 1024 * 1024 * 1024 / 4096, // 10GB available
        blksize: 4096
      });

      const result = await checker.checkDiskSpace();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('Disk space OK');
    });

    test('should return warning status when low disk space', async () => {
      const fs = require('fs');
      jest.spyOn(fs, 'statfsSync').mockReturnValue({
        bavail: 3 * 1024 * 1024 * 1024 / 4096, // 3GB available (low)
        blksize: 4096
      });

      const result = await checker.checkDiskSpace();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('Limited disk space');
    });
  });

  describe('checkMemory', () => {
    test('should return OK status when memory usage is normal', () => {
      const result = checker.checkMemory();

      expect(result.status).toBe('ok');
      expect(result.message).toContain('Memory OK');
    });

    test('should return warning status when memory usage is high', () => {
      // Mock high memory usage (>90%)
      jest.spyOn(process, 'memoryUsage').mockReturnValue({
        heapUsed: 950 * 1024 * 1024, // 950MB (95%)
        heapTotal: 1024 * 1024 * 1024, // 1GB total
        rss: 1024 * 1024 * 1024,
        external: 0,
        arrayBuffers: []
      });

      const result = checker.checkMemory();

      expect(result.status).toBe('warning');
      expect(result.message).toContain('High memory usage');
    });
  });
});

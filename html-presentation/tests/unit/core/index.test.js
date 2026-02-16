const { PlatformDetector, HealthChecker, ErrorHandler, Logger } = require('../../../core/index');

describe('Core Index', () => {
  test('should export all core utilities', () => {
    expect(PlatformDetector).toBeDefined();
    expect(HealthChecker).toBeDefined();
    expect(ErrorHandler).toBeDefined();
    expect(Logger).toBeDefined();
  });

  test('should be able to instantiate exported classes', () => {
    expect(new PlatformDetector()).toBeInstanceOf(PlatformDetector);
    expect(new HealthChecker()).toBeInstanceOf(HealthChecker);
    expect(new ErrorHandler()).toBeInstanceOf(ErrorHandler);
    expect(new Logger()).toBeInstanceOf(Logger);
  });
});

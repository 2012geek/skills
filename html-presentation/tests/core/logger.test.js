const { Logger } = require('../../core/logger');

describe('Logger', () => {
  let logger;
  let consoleSpy;

  beforeEach(() => {
    logger = new Logger({ prefix: 'TEST' });
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('info', () => {
    test('should log info message with emoji', () => {
      logger.info('Test message');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ℹ️'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[TEST]'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test message'));
    });
  });

  describe('success', () => {
    test('should log success message with emoji', () => {
      logger.success('Operation complete');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Operation complete'));
    });
  });

  describe('warn', () => {
    test('should log warning message with emoji', () => {
      logger.warn('Warning message');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('⚠️'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Warning message'));
    });
  });

  describe('error', () => {
    test('should log error message with emoji', () => {
      logger.error('Error occurred');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error occurred'));
    });
  });

  describe('debug', () => {
    test('should log debug message only when DEBUG is set', () => {
      const originalDebug = process.env.DEBUG;
      process.env.DEBUG = 'true';

      logger.debug('Debug info');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🐛'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Debug info'));

      process.env.DEBUG = originalDebug;
    });

    test('should not log debug when DEBUG is not set', () => {
      delete process.env.DEBUG;

      logger.debug('Should not appear');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });
});

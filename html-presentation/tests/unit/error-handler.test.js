const { ErrorHandler } = require('../../core/error-handler');
const {
  FileNotFoundError,
  APIKeyError,
  RateLimitError,
  TimeoutError
} = require('../../core/errors');

describe('ErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  describe('classifyError', () => {
    test('should classify FileNotFoundError as fatal', () => {
      const error = new FileNotFoundError('File not found');
      const level = handler.classifyError(error);
      expect(level).toBe('fatal');
    });

    test('should classify APIKeyError as severe', () => {
      const error = new APIKeyError('Invalid API key');
      const level = handler.classifyError(error);
      expect(level).toBe('severe');
    });

    test('should classify RateLimitError as moderate', () => {
      const error = new RateLimitError('Rate limit exceeded');
      const level = handler.classifyError(error);
      expect(level).toBe('moderate');
    });

    test('should classify TimeoutError as moderate', () => {
      const error = new TimeoutError('Request timeout');
      const level = handler.classifyError(error);
      expect(level).toBe('moderate');
    });

    test('should classify unknown errors as moderate', () => {
      const error = new Error('Unknown error');
      const level = handler.classifyError(error);
      expect(level).toBe('moderate');
    });
  });

  describe('isRecoverable', () => {
    test('should return true for rate limit errors', () => {
      const error = new RateLimitError('429 Rate limit');
      expect(handler.isRecoverable(error)).toBe(true);
    });

    test('should return true for timeout errors', () => {
      const error = new TimeoutError('Request timeout');
      expect(handler.isRecoverable(error)).toBe(true);
    });

    test('should return false for API key errors', () => {
      const error = new APIKeyError('401 Unauthorized');
      expect(handler.isRecoverable(error)).toBe(false);
    });

    test('should return false for file not found errors', () => {
      const error = new FileNotFoundError('Missing file');
      expect(handler.isRecoverable(error)).toBe(false);
    });
  });

  describe('getSuggestions', () => {
    test('should provide suggestions for rate limit errors', () => {
      const error = new RateLimitError('Rate limit exceeded');
      const suggestions = handler.getSuggestions(error);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].toLowerCase()).toContain('wait');
    });

    test('should provide suggestions for API key errors', () => {
      const error = new APIKeyError('Invalid API key');
      const suggestions = handler.getSuggestions(error);

      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.some(s => s.includes('API key'))).toBe(true);
    });
  });

  describe('formatError', () => {
    test('should format error with all required fields', () => {
      const error = new Error('Test error');
      const formatted = handler.formatError(error);

      expect(formatted).toHaveProperty('type', 'Error');
      expect(formatted).toHaveProperty('message', 'Test error');
      expect(formatted).toHaveProperty('timestamp');
    });

    test('should include stack in DEBUG mode', () => {
      process.env.DEBUG = 'true';
      const error = new Error('Test error');
      const formatted = handler.formatError(error);

      expect(formatted).toHaveProperty('stack');
      delete process.env.DEBUG;
    });

    test('should not include stack without DEBUG', () => {
      delete process.env.DEBUG;
      const error = new Error('Test error');
      const formatted = handler.formatError(error);

      expect(formatted).not.toHaveProperty('stack');
    });
  });

  describe('displayError', () => {
    test('should print formatted error to console', () => {
      const error = {
        type: 'TestError',
        message: 'Test error message',
        suggestions: ['Suggestion 1', 'Suggestion 2']
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      handler.displayError(error);

      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls;
      const output = calls.map(c => c.join(' ')).join('\n');

      expect(output).toContain('TestError');
      expect(output).toContain('Test error message');
      expect(output).toContain('Suggestions');

      consoleSpy.mockRestore();
    });
  });
});

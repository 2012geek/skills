/**
 * Error Handler
 * Classifies, handles, and formats errors with recovery suggestions
 */

const {
  FileNotFoundError,
  PermissionError,
  APIKeyError,
  RateLimitError,
  TimeoutError,
  ImageNotFoundError,
  ValidationError
} = require('./errors');
const { Logger } = require('./logger');

class ErrorHandler {
  constructor() {
    this.logger = new Logger({ prefix: 'ERROR' });
  }

  classifyError(error) {
    if (error instanceof FileNotFoundError) return 'fatal';
    if (error instanceof PermissionError) return 'fatal';
    if (error instanceof APIKeyError) return 'severe';
    if (error instanceof RateLimitError) return 'moderate';
    if (error instanceof TimeoutError) return 'moderate';
    if (error instanceof ImageNotFoundError) return 'minor';
    return 'moderate';
  }

  isRecoverable(error) {
    const recoverablePatterns = [
      /rate limit/i,
      /timeout/i,
      /connection/i,
      /temporary/i,
      /503/,
      /502/,
      /429/
    ];

    return recoverablePatterns.some(pattern =>
      pattern.test(error.message) || pattern.test(error.code)
    );
  }

  getSuggestions(error) {
    const suggestions = [];

    if (/rate limit/i.test(error.message)) {
      suggestions.push('Wait a moment and try again');
      suggestions.push('Reduce the number of simultaneous requests');
    }

    if (/timeout/i.test(error.message)) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try with a smaller content chunk');
    }

    if (/api key/i.test(error.message)) {
      suggestions.push('Verify your ANTHROPIC_AUTH_TOKEN in ~/.claude/settings.json');
      suggestions.push('Check if the API key has expired');
    }

    return suggestions;
  }

  formatError(error) {
    const formatted = {
      type: error.constructor.name,
      message: error.message,
      timestamp: new Date().toISOString()
    };

    if (process.env.DEBUG) {
      formatted.stack = error.stack;
    }

    return formatted;
  }

  displayError(error) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ Error occurred');
    console.error('='.repeat(70) + '\n');

    console.error(`📌 Type: ${error.type}`);
    console.error(`📝 Message: ${error.message}\n`);

    if (error.suggestions && error.suggestions.length > 0) {
      console.error('💡 Suggestions:');
      error.suggestions.forEach((s, i) => {
        console.error(`   ${i + 1}. ${s}`);
      });
      console.error('');
    }

    if (error.fallback && error.fallback !== 'fail-fast') {
      console.error(`🔄 Auto-recovery: ${error.fallback}`);
      console.error('');
    }

    if (process.env.DEBUG && error.stack) {
      console.error('📚 Stack trace:');
      console.error(error.stack);
    }

    console.error('='.repeat(70) + '\n');
  }
}

module.exports = { ErrorHandler };

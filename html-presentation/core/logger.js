/**
 * Logger Utility
 * Provides consistent logging with emoji indicators and prefixes
 */

class Logger {
  constructor(options = {}) {
    this.prefix = options.prefix || '';
  }

  _format(message, emoji) {
    const prefix = this.prefix ? `[${this.prefix}]` : '';
    return `${emoji}  ${prefix} ${message}`;
  }

  info(message) {
    console.log(this._format(message, 'ℹ️'));
  }

  success(message) {
    console.log(this._format(message, '✅'));
  }

  warn(message) {
    console.log(this._format(message, '⚠️'));
  }

  error(message) {
    console.log(this._format(message, '❌'));
  }

  debug(message) {
    if (process.env.DEBUG) {
      console.log(this._format(message, '🐛'));
    }
  }
}

module.exports = { Logger };

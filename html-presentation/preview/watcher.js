/**
 * File Watcher
 * Watches markdown files for changes and triggers regeneration
 */

const chokidar = require('chokidar');
const { EventEmitter } = require('events');
const path = require('path');

class FileWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.debounceDelay = options.debounce || 100;
    this.watcher = null;
    this.debounceTimer = null;
  }

  async watch(filepath, options = {}) {
    if (this.watcher) {
      await this.stop();
    }

    const dirname = path.dirname(filepath);
    const filename = path.basename(filepath);

    // Update debounce delay if provided
    if (options.debounce) {
      this.debounceDelay = options.debounce;
    }

    this.watcher = chokidar.watch(filename, {
      persistent: true,
      ignoreInitial: true,
      cwd: dirname,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 10
      }
    });

    this.watcher.on('change', (changedFilename) => {
      this._handleChange(path.join(dirname, changedFilename));
    });

    return new Promise((resolve, reject) => {
      this.watcher.on('ready', () => resolve(true));
      this.watcher.on('error', reject);
    });
  }

  _handleChange(filepath) {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.emit('change', filepath);
    }, this.debounceDelay);
  }

  async stop() {
    if (!this.watcher) {
      return false;
    }

    await this.watcher.close();
    this.watcher = null;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    return true;
  }

  isWatching() {
    return this.watcher !== null;
  }
}

module.exports = { FileWatcher };

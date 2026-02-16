/**
 * Platform Detector
 * Detects operating system, display availability, and default browser
 */

const { execSync } = require('child_process');
const path = require('path');

class PlatformDetector {
  constructor() {
    this.platformType = process.platform;
  }

  getPlatform() {
    return {
      type: this.platformType,
      hasDisplay: this.checkDisplay(),
      defaultBrowser: this.getDefaultBrowser(),
      defaultPath: this.getDefaultPath()
    };
  }

  checkDisplay() {
    switch (this.platformType) {
      case 'darwin':
        return this._checkDisplayMacOS();
      case 'linux':
        return this._checkDisplayLinux();
      case 'win32':
        return true; // Windows always has display
      default:
        return false;
    }
  }

  _checkDisplayMacOS() {
    try {
      execSync('pgrep WindowServer', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  _checkDisplayLinux() {
    return !!process.env.DISPLAY;
  }

  getDefaultBrowser() {
    switch (this.platformType) {
      case 'darwin':
        return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      case 'linux':
        return 'google-chrome';
      case 'win32':
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      default:
        return 'chromium';
    }
  }

  getDefaultPath() {
    switch (this.platformType) {
      case 'darwin':
        return '/Applications';
      case 'linux':
        return '/usr/bin';
      case 'win32':
        return 'C:\\Program Files';
      default:
        return '/usr/local/bin';
    }
  }
}

module.exports = { PlatformDetector };

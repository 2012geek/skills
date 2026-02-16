/**
 * Health Checker
 * Performs system health checks for display, disk space, and memory
 */

const fs = require('fs');
const os = require('os');
const { PlatformDetector } = require('./platform-detector');

class HealthChecker {
  constructor(options = {}) {
    this.platformDetector = options.platformDetector || new PlatformDetector();
  }

  async check() {
    const checks = {
      display: await this.checkDisplay(),
      disk: await this.checkDiskSpace(),
      memory: this.checkMemory()
    };

    const healthy = Object.values(checks).every(c => c.status === 'ok');

    return {
      healthy,
      checks,
      timestamp: new Date().toISOString()
    };
  }

  async checkDisplay() {
    const hasDisplay = this.platformDetector.checkDisplay();

    if (hasDisplay) {
      return {
        status: 'ok',
        message: 'Display detected - interactive preview available'
      };
    } else {
      return {
        status: 'warning',
        message: 'No display detected - running in headless mode',
        suggestion: 'Run on a system with a display for interactive preview'
      };
    }
  }

  async checkDiskSpace() {
    try {
      const stats = fs.statfs ? fs.statfsSync('/tmp') : null;
      if (!stats) {
        // Fallback for systems without statfs
        return { status: 'ok', message: 'Disk space check not available' };
      }

      const freeGB = stats.bavail * stats.blksize / (1024 ** 3);

      if (freeGB < 1) {
        return {
          status: 'error',
          message: `Low disk space: ${freeGB.toFixed(2)}GB free`,
          suggestion: 'Free up disk space before processing large files'
        };
      }

      if (freeGB < 5) {
        return {
          status: 'warning',
          message: `Limited disk space: ${freeGB.toFixed(2)}GB free`
        };
      }

      return { status: 'ok', message: `Disk space OK: ${freeGB.toFixed(2)}GB free` };
    } catch (error) {
      return { status: 'ok', message: 'Could not check disk space' };
    }
  }

  checkMemory() {
    const memStats = process.memoryUsage();
    const heapUsedMB = memStats.heapUsed / (1024 ** 2);
    const heapTotalMB = memStats.heapTotal / (1024 ** 2);

    if (heapUsedMB / heapTotalMB > 0.9) {
      return {
        status: 'warning',
        message: `High memory usage: ${heapUsedMB.toFixed(0)}MB/${heapTotalMB.toFixed(0)}MB`,
        suggestion: 'Consider processing smaller chunks'
      };
    }

    return { status: 'ok', message: `Memory OK: ${heapUsedMB.toFixed(0)}MB used` };
  }
}

module.exports = { HealthChecker };

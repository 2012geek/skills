const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor(options = {}) {
    this.configPath = options.configPath;
    this.searchPaths = options.searchPaths || [process.cwd()];
  }

  resolveConfigPath() {
    if (this.configPath) {
      return fs.existsSync(this.configPath) ? this.configPath : null;
    }

    for (const dir of this.searchPaths) {
      const candidate = path.join(dir, 'config.json');
      if (fs.existsSync(candidate)) return candidate;
    }

    return null;
  }

  loadRaw() {
    const configPath = this.resolveConfigPath();
    if (!configPath) {
      throw new Error('Config file not found');
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
}

module.exports = { ConfigLoader };

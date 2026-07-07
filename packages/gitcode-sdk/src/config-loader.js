const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor(options = {}) {
    this.configPath = options.configPath;
    this.searchPaths = options.searchPaths || [process.cwd()];
    this.applyDefaultsFn = options.applyDefaults || null;
  }

  resolveConfigPath() {
    if (this.configPath) {
      if (!fs.existsSync(this.configPath)) return null;
      return this.configPath;
    }
    for (const dir of this.searchPaths) {
      const candidate = path.join(dir, 'config.json');
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  load() {
    const config = this.loadRaw();
    if (this.applyDefaultsFn) {
      return this.applyDefaultsFn(config);
    }
    return this._applyGitcodeBotDefaults(config);
  }

  loadRaw() {
    const configPath = this.resolveConfigPath();
    if (!configPath) {
      throw new Error('Config file not found');
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  }

  _applyGitcodeBotDefaults(config) {
    if (!config.projects || !Array.isArray(config.projects)) {
      throw new Error('Config must have a "projects" array');
    }
    config.projects = config.projects.map(p => ({
      waitHours: 24,
      severityThreshold: 'medium',
      ...p,
      gitcodeToken: p.gitcodeToken || config.bot?.gitcodeToken || process.env.GITCODE_TOKEN || null
    }));
    config.bot = {
      maxRetries: 3,
      concurrentFixes: 2,
      dryRun: false,
      label: 'bot-detected',
      ...config.bot
    };
    return config;
  }
}

module.exports = { ConfigLoader };

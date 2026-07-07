const { ConfigLoader } = require('@skills/gitcode-sdk');
const path = require('path');
const os = require('os');
const fs = require('fs');

class ConfigManager {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(os.homedir(), '.gitcode-bot', 'config.json');
    this.loader = new ConfigLoader({ configPath: this.configPath });
  }

  load() {
    const config = this.loader.load();
    this.validate(config);
    return config;
  }

  getProjects() {
    return this.load().projects;
  }

  getProject(owner, repo) {
    return this.load().projects.find(p => p.owner === owner && p.repo === repo);
  }

  validate(config) {
    if (!config.projects || !Array.isArray(config.projects)) {
      throw new Error('Config must have a "projects" array');
    }
    for (const project of config.projects) {
      if (!project.owner) throw new Error('Each project must have "owner"');
      if (!project.repo) throw new Error('Each project must have "repo"');
    }
  }

  async init(answers) {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const config = {
      projects: answers.projects || [],
      bot: answers.bot || {}
    };
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    return config;
  }
}

module.exports = { ConfigManager };

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json not found. Copy config.example.json to config.json and edit it.');
    process.exit(1);
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);
  validateConfig(config);
  return config;
}

function validateConfig(config) {
  if (!config.projects || !Array.isArray(config.projects)) {
    console.error('config.json must have a "projects" array');
    process.exit(1);
  }
  for (const p of config.projects) {
    if (!p.name || !p.platform || !p.owner || !p.repo || !p.cloneUrl) {
      console.error(`Project "${p.name || 'unknown'}" is missing required fields: name, platform, owner, repo, cloneUrl`);
      process.exit(1);
    }
    const platformConfig = config.platforms?.[p.platform];
    if (!platformConfig) {
      console.error(`Platform "${p.platform}" for project "${p.name}" is not defined in config.platforms`);
      process.exit(1);
    }
    const tokenEnv = platformConfig.tokenEnv;
    if (tokenEnv && !process.env[tokenEnv]) {
      console.warn(`Warning: ${tokenEnv} is not set. Pulling "${p.name}" may fail.`);
    }
  }
}

function getWeekRange(date) {
  const now = date ? new Date(date) : new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), diff);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { weekStart: fmt(monday), weekEnd: fmt(sunday) };
}

module.exports = { loadConfig, getWeekRange };

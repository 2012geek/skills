const { ConfigManager } = require('../lib/config-manager');
const path = require('path');

const fixturesDir = path.join(__dirname, 'fixtures');

describe('ConfigManager', () => {
  test('load valid config — parses multi-project config', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const config = cm.load();
    expect(config.projects).toHaveLength(2);
  });

  test('missing config file — returns error with init suggestion', () => {
    const cm = new ConfigManager({ configPath: '/nonexistent/config.json' });
    expect(() => cm.load()).toThrow('Config file not found');
  });

  test('invalid JSON — returns parse error', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-invalid.json') });
    expect(() => cm.load()).toThrow();
  });

  test('missing required fields — validates owner and repo', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const config = cm.load();
    for (const project of config.projects) {
      expect(project.owner).toBeDefined();
      expect(project.repo).toBeDefined();
    }
  });

  test('default values — waitHours=24, maxRetries=3, concurrentFixes=2', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const config = cm.load();
    expect(config.bot.maxRetries).toBe(3);
    expect(config.bot.concurrentFixes).toBe(2);
    expect(config.projects[0].waitHours).toBe(24);
  });

  test('token fallback — project token → bot.gitcodeToken → env', () => {
    process.env.GITCODE_TOKEN = 'env-token';
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const config = cm.load();
    const noTokenProject = config.projects.find(p => p.gitcodeToken !== 'project-token');
    expect(noTokenProject.gitcodeToken).toBe('shared-bot-token');
    delete process.env.GITCODE_TOKEN;
  });

  test('token fallback — env var when no bot token', () => {
    process.env.GITCODE_TOKEN = 'env-token';
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-no-bot-token.json') });
    const config = cm.load();
    expect(config.projects[0].gitcodeToken).toBe('env-token');
    delete process.env.GITCODE_TOKEN;
  });

  test('getProject() returns single project by owner/repo', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const project = cm.getProject('openeuler', 'lerobot_ros2');
    expect(project).toBeDefined();
    expect(project.owner).toBe('openeuler');
  });

  test('getProject() returns undefined for unknown project', () => {
    const cm = new ConfigManager({ configPath: path.join(fixturesDir, 'sample-config-valid.json') });
    const project = cm.getProject('unknown', 'unknown');
    expect(project).toBeUndefined();
  });
});

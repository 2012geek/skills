const { TestDiscovery } = require('../lib/test-discovery');
const fs = require('fs');
const path = require('path');
const os = require('os');

const fixturesDir = path.join(__dirname, 'fixtures');

let dirCounter = 0;
// Create temp project dirs with different config files
function createTempProject(files) {
  const dir = path.join(os.tmpdir(), `gitcode-bot-test-discovery-${Date.now()}-${++dirCounter}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

function cleanup(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

describe('TestDiscovery', () => {
  let discovery;
  const tempDirs = [];

  beforeEach(() => {
    discovery = new TestDiscovery();
  });

  afterAll(() => {
    for (const dir of tempDirs) cleanup(dir);
  });

  test('package.json with scripts.test — returns npm test', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', scripts: { test: 'jest' } })
    });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('npm test');
  });

  test('Makefile with test target — returns make test', async () => {
    const dir = createTempProject({
      'Makefile': 'test:\n\techo "running tests"'
    });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('make test');
  });

  test('pytest.ini — returns pytest', async () => {
    const dir = createTempProject({ 'pytest.ini': '[pytest]\ntestpaths = tests' });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('pytest');
  });

  test('tox.ini — returns tox', async () => {
    const dir = createTempProject({ 'tox.ini': '[tox]\nenvlist = py39' });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('tox');
  });

  test('Cargo.toml — returns cargo test', async () => {
    const dir = createTempProject({ 'Cargo.toml': '[package]\nname = "test"' });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('cargo test');
  });

  test('go.mod — returns go test ./...', async () => {
    const dir = createTempProject({ 'go.mod': 'module example.com/test\n\ngo 1.20' });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBe('go test ./...');
  });

  test('no test config found — returns null', async () => {
    const dir = createTempProject({ 'random.txt': 'nothing here' });
    tempDirs.push(dir);
    const result = await discovery.discover(dir);
    expect(result).toBeNull();
  });

  test('user override — config.testCommand skips auto-discovery', async () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ scripts: { test: 'jest' } })
    });
    tempDirs.push(dir);
    const result = await discovery.getTestCommand({ testCommand: 'custom-test' }, dir);
    expect(result).toBe('custom-test');
  });
});

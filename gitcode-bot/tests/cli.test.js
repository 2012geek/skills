const { parseArgs } = require('../scripts/cli');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CLI_PATH = path.join(__dirname, '..', 'scripts', 'cli.js');
const TEMP_STATE_DIR = path.join(os.tmpdir(), `cli-test-state-${Date.now()}`);
const TEMP_CONFIG_DIR = path.join(os.tmpdir(), `cli-test-config-${Date.now()}`);

// Helper: run CLI command and parse JSON output
function runCLI(command, extraArgs = '') {
  const env = {
    ...process.env,
    GITCODE_BOT_STATE_DIR: TEMP_STATE_DIR,
    GITCODE_BOT_CONFIG_PATH: path.join(TEMP_CONFIG_DIR, 'config.json')
  };
  const cmd = `node "${CLI_PATH}" ${command} ${extraArgs}`;
  try {
    const output = execSync(cmd, { encoding: 'utf8', env });
    // Find the JSON line in output
    const lines = output.trim().split('\n');
    return JSON.parse(lines[lines.length - 1]);
  } catch (e) {
    const output = e.stdout || '';
    const lines = output.trim().split('\n');
    if (lines.length > 0) {
      try { return JSON.parse(lines[lines.length - 1]); } catch {}
    }
    return { ok: false, error: e.stderr || e.message };
  }
}

// Helper: create a valid config file
function createConfig() {
  fs.mkdirSync(TEMP_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEMP_CONFIG_DIR, 'config.json'),
    JSON.stringify({
      projects: [
        { owner: 'testorg', repo: 'testrepo', gitcodeToken: 'fake-token', waitHours: 0, maxRetries: 3 }
      ],
      bot: { gitcodeToken: 'fake-token' }
    }, null, 2)
  );
}

describe('CLI parseArgs', () => {
  test('extracts --key value pairs', () => {
    const args = parseArgs(['--project', 'org/repo', '--status', 'confirmed']);
    expect(args.project).toBe('org/repo');
    expect(args.status).toBe('confirmed');
  });

  test('handles empty args', () => {
    const args = parseArgs([]);
    expect(args).toEqual({});
  });
});

describe('CLI commands', () => {
  beforeEach(() => {
    if (fs.existsSync(TEMP_STATE_DIR)) fs.rmSync(TEMP_STATE_DIR, { recursive: true });
    if (fs.existsSync(TEMP_CONFIG_DIR)) fs.rmSync(TEMP_CONFIG_DIR, { recursive: true });
    fs.mkdirSync(TEMP_STATE_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEMP_STATE_DIR)) fs.rmSync(TEMP_STATE_DIR, { recursive: true });
    if (fs.existsSync(TEMP_CONFIG_DIR)) fs.rmSync(TEMP_CONFIG_DIR, { recursive: true });
  });

  // ─── init ────────────────────────────────────────────
  test('init creates config file', () => {
    const result = runCLI('init');
    expect(result.ok).toBe(true);
    expect(result.configPath).toContain('config.json');
  });

  // ─── config ──────────────────────────────────────────
  test('config loads and returns projects', () => {
    createConfig();
    const result = runCLI('config');
    expect(result.ok).toBe(true);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].owner).toBe('testorg');
  });

  // ─── State commands (using real StateStore) ──────────
  test('state-get returns empty state for new project', () => {
    createConfig();
    // We need to write state manually for this test since cli uses a different state dir
    fs.writeFileSync(
      path.join(TEMP_STATE_DIR, 'testorg_testrepo.json'),
      JSON.stringify({ findings: [], issues: [], fixes: [], prs: [], lastScanAt: null })
    );
    const result = runCLI('state-get', '--project testorg/testrepo');
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  test('dedup merges duplicate findings', () => {
    createConfig();
    const findings = JSON.stringify([
      { file: 'a.js', line: 10, severity: 'medium', title: 'bug', source: 'code-analyzer' },
      { file: 'a.js', line: 10, severity: 'critical', title: 'bug', source: 'issue-reader' }
    ]);
    const result = runCLI('dedup', `--findings '${findings}'`);
    expect(result.ok).toBe(true);
    expect(result.merged).toHaveLength(1);
    expect(result.merged[0].severity).toBe('critical');
  });

  test('test-discover returns command for npm project', () => {
    const tmpDir = path.join(os.tmpdir(), `cli-test-discover-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts: { test: 'jest' } }));
    const result = runCLI('test-discover', `--repo-path "${tmpDir}"`);
    expect(result.ok).toBe(true);
    expect(result.command).toBe('npm test');
    fs.rmSync(tmpDir, { recursive: true });
  });

  test('test-discover returns null for project without tests', () => {
    const tmpDir = path.join(os.tmpdir(), `cli-test-no-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const result = runCLI('test-discover', `--repo-path "${tmpDir}"`);
    expect(result.ok).toBe(true);
    expect(result.command).toBeNull();
    fs.rmSync(tmpDir, { recursive: true });
  });

  // ─── Error handling ──────────────────────────────────
  test('unknown command returns error', () => {
    const result = runCLI('unknown-command');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown command');
  });

  // ─── State persistence integration ───────────────────
  test('state-add-finding persists and returns auto-ID', () => {
    // Direct test using StateStore to verify auto-ID works
    const { StateStore } = require('../lib/state-store');
    const store = new StateStore(TEMP_STATE_DIR);
    const finding = store.addFinding('testorg2', 'testrepo2', { severity: 'medium', title: 'test bug', file: 'a.js', line: 10 });
    expect(finding.id).toBe('f-auto-1');
    const state = store.load('testorg2', 'testrepo2');
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0].id).toBe('f-auto-1');
  });

  test('state-add-finding preserves existing ID', () => {
    const { StateStore } = require('../lib/state-store');
    const store = new StateStore(TEMP_STATE_DIR);
    const finding = store.addFinding('testorg3', 'testrepo3', { id: 'custom-id', severity: 'medium', title: 'test' });
    expect(finding.id).toBe('custom-id');
  });
});

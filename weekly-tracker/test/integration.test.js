const path = require('path');

const libDir = path.join(__dirname, '..', 'lib');

describe('Database Layer', () => {
  let db;

  beforeAll(() => {
    db = require(path.join(libDir, 'db'));
    db.getDb();
  });

  afterAll(() => {
    const rawDb = db.getDb();
    rawDb.prepare('DELETE FROM weekly_reports WHERE project_id IN (SELECT id FROM projects WHERE name = ?)').run('test-project');
    rawDb.prepare('DELETE FROM project_targets WHERE project_id IN (SELECT id FROM projects WHERE name = ?)').run('test-project');
    rawDb.prepare('DELETE FROM qa_cache WHERE question = ?').run('test question');
    rawDb.prepare('DELETE FROM projects WHERE name = ?').run('test-project');
  });

  test('getAllWeekStarts returns array', () => {
    const weeks = db.getAllWeekStarts();
    expect(Array.isArray(weeks)).toBe(true);
  });

  test('getActiveProjects returns array', () => {
    const projects = db.getActiveProjects();
    expect(Array.isArray(projects)).toBe(true);
  });

  test('upsertProject inserts a project', () => {
    db.upsertProject({
      name: 'test-project',
      platform: 'github',
      owner: 'test-org',
      repo: 'test-repo',
      cloneUrl: 'git@github.com:test-org/test-repo.git',
    });
    const p = db.getProjectByName('test-project');
    expect(p).toBeTruthy();
    expect(p.name).toBe('test-project');
    expect(p.platform).toBe('github');
  });

  test('upsertProjectTarget inserts a target', () => {
    const p = db.getProjectByName('test-project');
    db.upsertProjectTarget(p.id, {
      goal: 'Complete test suite',
      description: 'Write all tests',
      setAt: '2026-01-01',
    });
    const t = db.getTargetForProject(p.id);
    expect(t).toBeTruthy();
    expect(t.target).toBe('Complete test suite');
  });

  test('upsertWeeklyReport inserts a report', () => {
    const p = db.getProjectByName('test-project');
    db.upsertWeeklyReport({
      projectId: p.id,
      weekStart: '2026-05-19',
      weekEnd: '2026-05-25',
      commitCount: 5,
      filesChanged: 10,
      additions: 100,
      deletions: 50,
      topAuthors: [{ name: 'Alice', commits: 3 }, { name: 'Bob', commits: 2 }],
      commitMessages: [
        { hash: 'abc1234', message: 'feat: add login', author: 'Alice', date: '2026-05-20' },
        { hash: 'def5678', message: 'fix: typo', author: 'Bob', date: '2026-05-21' },
      ],
      summary: 'Test week summary',
      rawLog: 'abc1234 Alice: feat: add login\ndef5678 Bob: fix: typo',
      thisWeekDescription: 'Added login feature and fixed typo',
    });

    const reports = db.getWeeklyReports('2026-05-19');
    expect(reports.length).toBe(1);
    expect(reports[0].commit_count).toBe(5);
    expect(reports[0].project_name).toBe('test-project');
  });

  test('getWeekSummaryStats returns correct stats', () => {
    const stats = db.getWeekSummaryStats('2026-05-19');
    expect(stats).toBeTruthy();
    expect(stats.active_projects).toBe(1);
    expect(stats.total_commits).toBe(5);
  });

  test('cacheAnswer and getCachedAnswer work', () => {
    db.cacheAnswer('2026-05-19', 'test question', 'test answer');
    const cached = db.getCachedAnswer('2026-05-19', 'test question');
    expect(cached).toBeTruthy();
    expect(cached.answer).toBe('test answer');
  });
});

describe('Config Module', () => {
  test('getWeekRange returns valid week range', () => {
    const { getWeekRange } = require(path.join(libDir, 'config'));
    const range = getWeekRange();
    expect(range).toHaveProperty('weekStart');
    expect(range).toHaveProperty('weekEnd');
    expect(range.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.weekEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Express Server', () => {
  test('server module exports an app', () => {
    const app = require(path.join(__dirname, '..', 'server'));
    expect(app).toBeTruthy();
    expect(typeof app.listen).toBe('function');
  });
});

describe('Git Collector', () => {
  test('exports expected functions', () => {
    const collector = require(path.join(libDir, 'git-collector'));
    expect(typeof collector.collectProjectCommits).toBe('function');
    expect(typeof collector.readKeyFiles).toBe('function');
  });
});

describe('LLM Module', () => {
  test('exports expected functions', () => {
    const llm = require(path.join(libDir, 'llm'));
    expect(typeof llm.generateWeeklySummary).toBe('function');
    expect(typeof llm.askQuestion).toBe('function');
    expect(typeof llm.generateWeeklyProgressDescription).toBe('function');
    expect(typeof llm.synthesizeWithFiles).toBe('function');
    expect(typeof llm.generateOverallProgress).toBe('function');
  });
});

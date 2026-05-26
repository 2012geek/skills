# Project Timeline UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the week-by-week progress view with a two-page project timeline interface (overview + detail).

**Architecture:** Express backend with two new API endpoints serving aggregated project timeline data. Vanilla JS frontend with Chart.js CDN for charts. Two HTML pages: overview (`index.html`) and detail (`project.html`). No database schema changes.

**Tech Stack:** Node.js, Express, better-sqlite3, Chart.js 4.x (CDN), vanilla JS/CSS

---

### Task 1: Add DB query functions for timeline data

**Files:**
- Modify: `weekly-tracker/lib/db.js`

**Step 1: Add `getProjectsRangeData(from, to)`**

Add this function before the `module.exports`:

```js
function getProjectsRangeData(from, to) {
  const rows = db.prepare(`
    SELECT wr.week_start, wr.commit_count, wr.files_changed, wr.additions,
           wr.deletions, wr.top_authors, wr.commit_messages,
           p.id as project_id, p.name as project_name, p.platform, p.owner, p.repo
    FROM weekly_reports wr
    JOIN projects p ON wr.project_id = p.id
    WHERE p.active = 1
      AND wr.week_start >= ?
      AND wr.week_start <= ?
    ORDER BY p.name ASC, wr.week_start ASC
  `).all(from, to);

  // Group by project
  const projectMap = new Map();
  const weekSet = new Set();

  for (const row of rows) {
    weekSet.add(row.week_start);
    if (!projectMap.has(row.project_name)) {
      projectMap.set(row.project_name, {
        name: row.project_name,
        platform: row.platform,
        owner: row.owner,
        repo: row.repo,
        project_id: row.project_id,
        weeks: {},
        allAuthors: new Set(),
      });
    }
    const proj = projectMap.get(row.project_name);
    proj.weeks[row.week_start] = {
      commitCount: row.commit_count,
      filesChanged: row.files_changed,
      additions: row.additions,
      deletions: row.deletions,
    };
    const authors = JSON.parse(row.top_authors || '[]');
    for (const a of authors) proj.allAuthors.add(a.name || a);
  }

  const weekLabels = Array.from(weekSet).sort();

  const projects = [];
  for (const proj of projectMap.values()) {
    const target = getTargetForProject(proj.project_id);
    const weeklyActivity = weekLabels.map(
      (w) => (proj.weeks[w] ? proj.weeks[w].commitCount : 0)
    );
    projects.push({
      name: proj.name,
      platform: proj.platform,
      owner: proj.owner,
      repo: proj.repo,
      target: target
        ? { goal: target.target, description: target.description, overallProgress: target.overall_progress }
        : null,
      totalCommits: weeklyActivity.reduce((a, b) => a + b, 0),
      contributors: Array.from(proj.allAuthors),
      weeklyActivity,
    });
  }

  return { projects, weekLabels };
}
```

**Step 2: Add `getProjectTimeline(name, from, to)`**

```js
function getProjectTimeline(name, from, to) {
  const project = db.prepare('SELECT * FROM projects WHERE name = ?').get(name);
  if (!project) return null;

  const target = getTargetForProject(project.id);

  const weeks = db.prepare(`
    SELECT * FROM weekly_reports
    WHERE project_id = ? AND week_start >= ? AND week_start <= ?
    ORDER BY week_start DESC
  `).all(project.id, from, to);

  return {
    project: {
      name: project.name,
      platform: project.platform,
      owner: project.owner,
      repo: project.repo,
    },
    target: target
      ? { goal: target.target, description: target.description, setAt: target.set_at, overallProgress: target.overall_progress }
      : null,
    weeks: weeks.map((w) => ({
      weekStart: w.week_start,
      weekEnd: w.week_end,
      commitCount: w.commit_count,
      filesChanged: w.files_changed,
      additions: w.additions,
      deletions: w.deletions,
      topAuthors: JSON.parse(w.top_authors || '[]'),
      commitMessages: (() => {
        const msgs = JSON.parse(w.commit_messages || '[]');
        return msgs.map(({ diff, files, ...rest }) => rest);
      })(),
      thisWeekDescription: w.this_week_description,
      summary: w.summary,
    })),
  };
}
```

**Step 3: Export the new functions**

Add `getProjectsRangeData` and `getProjectTimeline` to `module.exports`.

**Step 4: Commit**

```bash
git add weekly-tracker/lib/db.js
git commit -m "feat(weekly-tracker): add timeline query functions to db layer"
```

---

### Task 2: Add API endpoints and remove /api/ask

**Files:**
- Modify: `weekly-tracker/server.js`

**Step 1: Add `GET /api/weeks/range` endpoint**

Add before the `module.exports`:

```js
app.get('/api/weeks/range', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const data = getProjectsRangeData(from, to);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 2: Add `GET /api/project/:name/timeline` endpoint**

```js
app.get('/api/project/:name/timeline', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const data = getProjectTimeline(req.params.name, from, to);
    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**Step 3: Remove `POST /api/ask` endpoint**

Delete lines 55-87 (the entire `/api/ask` route handler).

**Step 4: Update requires at the top**

Change the destructured require to include the new functions:
```js
const { getWeeklyReports, getAllWeekStarts, getTargetForProject, getWeekSummaryStats, getProjectsRangeData, getProjectTimeline } = require('./lib/db');
```

**Step 5: Commit**

```bash
git add weekly-tracker/server.js
git commit -m "feat(weekly-tracker): add timeline API endpoints, remove /api/ask"
```

---

### Task 3: Clean up Q&A dead code

**Files:**
- Modify: `weekly-tracker/lib/llm.js`
- Modify: `weekly-tracker/lib/db.js`
- Delete: `weekly-tracker/public/chat.js`

**Step 1: Remove `askQuestion` from llm.js**

Delete the `askQuestion` function (lines 53-68).

**Step 2: Remove `askQuestion` from module.exports in llm.js**

Change:
```js
module.exports = { generateWeeklySummary, askQuestion, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress };
```
To:
```js
module.exports = { generateWeeklySummary, generateWeeklyProgressDescription, synthesizeWithFiles, generateOverallProgress, generateBaselineProgress };
```

**Step 3: Remove `getCachedAnswer` and `cacheAnswer` from db.js**

Delete `getCachedAnswer` (lines 179-181) and `cacheAnswer` (lines 183-185). Also remove them from `module.exports`.

**Step 4: Remove `qa_cache` references from db.js module.exports**

Remove `getCachedAnswer` and `cacheAnswer` from the exports.

**Step 5: Delete `public/chat.js`**

**Step 6: Commit**

```bash
git add weekly-tracker/lib/llm.js weekly-tracker/lib/db.js
git rm weekly-tracker/public/chat.js
git commit -m "chore(weekly-tracker): remove Q&A chat feature"
```

---

### Task 4: Rewrite overview page (index.html + overview.js)

**Files:**
- Rewrite: `weekly-tracker/public/index.html`
- Create: `weekly-tracker/public/overview.js`

**Step 1: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>项目时间线</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="container">
    <header>
      <h1>项目时间线</h1>
      <div class="date-range">
        <input type="date" id="date-from">
        <span>—</span>
        <input type="date" id="date-to">
        <button id="apply-dates">应用</button>
      </div>
    </header>

    <div id="loading" class="loading">加载中...</div>
    <div id="error" class="error-banner" style="display:none"></div>
    <div id="empty" class="empty-state" style="display:none">
      暂无数据，请运行 <code>npm run collect</code> 采集数据
    </div>
    <div id="empty-range" class="empty-state" style="display:none">
      所选时间范围内暂无数据
    </div>

    <div id="overview" class="overview-table" style="display:none">
      <div class="overview-header">
        <div class="col-project">项目</div>
        <div class="col-contributors">贡献者</div>
        <div class="col-activity">提交活动</div>
      </div>
      <div id="overview-rows"></div>
    </div>
  </div>
  <script src="/overview.js"></script>
</body>
</html>
```

**Step 2: Write `overview.js`**

```js
let currentFrom = '';
let currentTo = '';

function getDefaultRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

function show(el) { el.style.display = ''; }
function hide(el) { el.style.display = 'none'; }

async function loadOverview(from, to) {
  currentFrom = from;
  currentTo = to;

  hide(document.getElementById('empty'));
  hide(document.getElementById('empty-range'));
  hide(document.getElementById('error'));
  hide(document.getElementById('overview'));
  show(document.getElementById('loading'));

  try {
    const res = await fetch(`/api/weeks/range?from=${from}&to=${to}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    hide(document.getElementById('loading'));

    if (!data.projects || data.projects.length === 0) {
      // Check if there's any data at all
      const weeksRes = await fetch('/api/weeks');
      const weeks = await weeksRes.json();
      if (weeks.length === 0) {
        show(document.getElementById('empty'));
      } else {
        show(document.getElementById('empty-range'));
      }
      return;
    }

    renderOverview(data);
    show(document.getElementById('overview'));
  } catch (err) {
    hide(document.getElementById('loading'));
    const errEl = document.getElementById('error');
    errEl.innerHTML = `加载失败: ${esc(err.message)} <button onclick="loadOverview(currentFrom, currentTo)">重试</button>`;
    show(errEl);
  }
}

function renderOverview(data) {
  const maxCommits = Math.max(1, ...data.projects.map(p => Math.max(...p.weeklyActivity, 0)));

  const rows = document.getElementById('overview-rows');
  rows.innerHTML = '';

  for (const p of data.projects) {
    const row = document.createElement('a');
    row.className = 'overview-row';
    row.href = `/project.html?name=${encodeURIComponent(p.name)}&from=${currentFrom}&to=${currentTo}`;

    row.innerHTML =
      `<div class="col-project">
        <strong>${esc(p.name)}</strong>
        <span class="project-repo">${esc(p.platform)}/${esc(p.owner)}/${esc(p.repo)}</span>
      </div>` +
      `<div class="col-contributors">${p.contributors.map(c => `<span class="contributor-tag">${esc(c)}</span>`).join(' ')}</div>` +
      `<div class="col-activity">
        <div class="activity-bars">
          ${p.weeklyActivity.map(count => {
            const height = maxCommits > 0 ? Math.max(2, (count / maxCommits) * 40) : 2;
            return `<span class="bar" style="height:${height}px" title="${count} commits"></span>`;
          }).join('')}
        </div>
        <span class="activity-total">${p.totalCommits} commits</span>
      </div>`;

    rows.appendChild(row);
  }
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const range = getDefaultRange();
  document.getElementById('date-from').value = range.from;
  document.getElementById('date-to').value = range.to;
  loadOverview(range.from, range.to);

  document.getElementById('apply-dates').addEventListener('click', () => {
    loadOverview(
      document.getElementById('date-from').value,
      document.getElementById('date-to').value
    );
  });
});
```

**Step 3: Commit**

```bash
git add weekly-tracker/public/index.html weekly-tracker/public/overview.js
git commit -m "feat(weekly-tracker): rewrite overview page with project timeline"
```

---

### Task 5: Create detail page (project.html + project.js)

**Files:**
- Create: `weekly-tracker/public/project.html`
- Create: `weekly-tracker/public/project.js`

**Step 1: Write `project.html`**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>项目详情</title>
  <link rel="stylesheet" href="/style.css">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <div class="container">
    <header>
      <div class="header-left">
        <a href="/" class="back-link">&larr; 返回总览</a>
        <h1>项目时间线</h1>
      </div>
      <div class="date-range">
        <input type="date" id="date-from">
        <span>—</span>
        <input type="date" id="date-to">
        <button id="apply-dates">应用</button>
      </div>
    </header>

    <div id="loading" class="loading">加载中...</div>
    <div id="error" class="error-banner" style="display:none"></div>
    <div id="empty" class="empty-state" style="display:none">所选时间范围内暂无数据</div>

    <div id="detail" style="display:none">
      <div class="project-info">
        <h2 id="project-name"></h2>
        <span class="project-repo" id="project-repo"></span>
      </div>

      <div id="target-card" class="target-card" style="display:none">
        <div class="target-header">
          <span class="target-goal" id="target-goal"></span>
        </div>
        <div class="target-progress" id="target-progress"></div>
      </div>

      <div class="charts-grid">
        <div class="chart-container">
          <h3>提交活动</h3>
          <canvas id="commit-chart"></canvas>
        </div>
        <div class="chart-container">
          <h3>文件 / 代码行趋势</h3>
          <canvas id="trend-chart"></canvas>
        </div>
      </div>

      <div class="contributors-section" id="contributors-section"></div>

      <div class="weekly-timeline" id="weekly-timeline"></div>
    </div>
  </div>
  <script src="/project.js"></script>
</body>
</html>
```

**Step 2: Write `project.js`**

```js
let commitChart = null;
let trendChart = null;
let currentFrom = '';
let currentTo = '';
let projectName = '';

function show(el) { el.style.display = ''; }
function hide(el) { el.style.display = 'none'; }

function getParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    name: q.get('name') || '',
    from: q.get('from') || '',
    to: q.get('to') || '',
  };
}

function getDefaultRange() {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 3);
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

async function loadDetail(name, from, to) {
  projectName = name;
  currentFrom = from;
  currentTo = to;

  hide(document.getElementById('detail'));
  hide(document.getElementById('error'));
  hide(document.getElementById('empty'));
  show(document.getElementById('loading'));

  try {
    const res = await fetch(
      `/api/project/${encodeURIComponent(name)}/timeline?from=${from}&to=${to}`
    );
    if (!res.ok) {
      if (res.status === 404) throw new Error('项目未找到');
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();

    hide(document.getElementById('loading'));

    if (!data.weeks || data.weeks.length === 0) {
      show(document.getElementById('empty'));
      return;
    }

    renderDetail(data);
    show(document.getElementById('detail'));
  } catch (err) {
    hide(document.getElementById('loading'));
    const errEl = document.getElementById('error');
    errEl.innerHTML = `加载失败: ${esc(err.message)} <button onclick="loadDetail(projectName, currentFrom, currentTo)">重试</button>`;
    show(errEl);
  }
}

function renderDetail(data) {
  const p = data.project;
  document.getElementById('project-name').textContent = p.name;
  document.getElementById('project-repo').textContent = `${p.platform}/${p.owner}/${p.repo}`;
  document.title = `${p.name} - 项目时间线`;

  // Target card
  if (data.target) {
    show(document.getElementById('target-card'));
    document.getElementById('target-goal').textContent = data.target.goal;
    const progressEl = document.getElementById('target-progress');
    if (data.target.overallProgress) {
      progressEl.innerHTML = renderMd(data.target.overallProgress);
    } else {
      progressEl.innerHTML = '<span class="muted">暂无进展描述</span>';
    }
  } else {
    hide(document.getElementById('target-card'));
  }

  // Charts - weeks are newest first from API, reverse for chronological charts
  const weeks = [...data.weeks].reverse();
  const labels = weeks.map(w => w.weekStart);

  // Commit chart
  const ctx1 = document.getElementById('commit-chart').getContext('2d');
  if (commitChart) commitChart.destroy();
  commitChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '提交数',
        data: weeks.map(w => w.commitCount),
        backgroundColor: '#2563eb',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });

  // Trend chart
  const ctx2 = document.getElementById('trend-chart').getContext('2d');
  if (trendChart) trendChart.destroy();
  trendChart = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: '文件变更', data: weeks.map(w => w.filesChanged), borderColor: '#2563eb', tension: 0.2, pointRadius: 3 },
        { label: '新增行', data: weeks.map(w => w.additions), borderColor: '#16a34a', tension: 0.2, pointRadius: 3 },
        { label: '删除行', data: weeks.map(w => w.deletions), borderColor: '#dc2626', tension: 0.2, pointRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } },
    },
  });

  // Contributors
  const authorMap = new Map();
  for (const w of data.weeks) {
    for (const a of (w.topAuthors || [])) {
      const name = a.name || a;
      const count = a.count || a.commits || 1;
      authorMap.set(name, (authorMap.get(name) || 0) + count);
    }
  }
  const contributors = Array.from(authorMap.entries())
    .sort((a, b) => b[1] - a[1]);
  document.getElementById('contributors-section').innerHTML =
    '<h3>贡献者</h3><div class="contributors-list">' +
    contributors.map(([name, count]) =>
      `<span class="contributor-tag">${esc(name)} (${count})</span>`
    ).join(' ') +
    '</div>';

  // Weekly timeline accordion
  const timeline = document.getElementById('weekly-timeline');
  timeline.innerHTML = '<h3>每周详情</h3>';
  for (const w of data.weeks) {
    const div = document.createElement('div');
    div.className = 'week-entry';
    const headerId = `week-header-${w.weekStart}`;
    const bodyId = `week-body-${w.weekStart}`;
    div.innerHTML =
      `<div class="week-header" id="${headerId}" data-target="${bodyId}">
        <span class="week-toggle">&#9654;</span>
        <span class="week-range">${w.weekStart} ~ ${w.weekEnd}</span>
        <span class="week-stats">${w.commitCount} 提交 · ${w.filesChanged} 文件 · +${w.additions}/-${w.deletions}</span>
      </div>` +
      `<div class="week-body" id="${bodyId}" style="display:none">
        <div class="week-commits">
          ${(w.commitMessages || []).map(c =>
            `<div class="commit-item">
              <code class="commit-hash">${esc(c.hash || '').substring(0, 7)}</code>
              <span class="commit-msg">${esc(c.message || '')}</span>
              <span class="commit-author">(${esc(c.author || '')})</span>
            </div>`
          ).join('') || '<span class="muted">暂无提交</span>'}
        </div>
        <div class="week-description">
          ${w.commitCount === 0
            ? '<span class="muted">暂无活动</span>'
            : (w.thisWeekDescription
              ? renderMd(w.thisWeekDescription)
              : '<span class="muted">暂无进展描述</span>')}
        </div>
      </div>`;
    timeline.appendChild(div);
  }

  // Accordion toggle
  timeline.addEventListener('click', (e) => {
    const header = e.target.closest('.week-header');
    if (!header) return;
    const body = document.getElementById(header.dataset.target);
    const toggle = header.querySelector('.week-toggle');
    if (body.style.display === 'none') {
      body.style.display = 'block';
      toggle.textContent = '▼';
    } else {
      body.style.display = 'none';
      toggle.textContent = '▶';
    }
  });
}

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMd(text) {
  // Simple markdown rendering (marked is available as a dependency but we serve it via CDN missing)
  // For now: split sections and format
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

document.addEventListener('DOMContentLoaded', () => {
  const params = getParams();
  const range = getDefaultRange();
  document.getElementById('date-from').value = params.from || range.from;
  document.getElementById('date-to').value = params.to || range.to;

  if (params.name) {
    loadDetail(params.name, document.getElementById('date-from').value, document.getElementById('date-to').value);
  } else {
    window.location.href = '/';
    return;
  }

  document.getElementById('apply-dates').addEventListener('click', () => {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    window.location.search = `?name=${encodeURIComponent(params.name)}&from=${from}&to=${to}`;
  });
});
```

**Step 3: Commit**

```bash
git add weekly-tracker/public/project.html weekly-tracker/public/project.js
git commit -m "feat(weekly-tracker): add project detail page with charts and timeline"
```

---

### Task 6: Rewrite CSS

**Files:**
- Rewrite: `weekly-tracker/public/style.css`

**Step 1: Write new `style.css`**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
.container { max-width: 1100px; margin: 0 auto; padding: 20px; }

/* Header */
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
header h1 { font-size: 22px; }
.header-left { display: flex; align-items: center; gap: 16px; }
.date-range { display: flex; gap: 8px; align-items: center; }
.date-range input[type="date"] { padding: 5px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
.date-range button { padding: 5px 12px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; }

.back-link { text-decoration: none; color: #2563eb; font-size: 14px; }
.back-link:hover { text-decoration: underline; }

/* Loading / Error / Empty */
.loading { text-align: center; padding: 60px 20px; color: #888; font-size: 15px; }
.error-banner { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; }
.error-banner button { margin-left: 8px; background: #dc2626; color: #fff; border: none; border-radius: 4px; padding: 4px 10px; cursor: pointer; }
.empty-state { text-align: center; padding: 60px 20px; color: #888; font-size: 15px; }
.empty-state code { background: #e2e8f0; padding: 2px 6px; border-radius: 3px; font-size: 13px; }

/* Overview */
.overview-table { background: #fff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; }
.overview-header { display: grid; grid-template-columns: 1fr 250px 280px; gap: 0; background: #f8fafc; padding: 10px 16px; font-size: 13px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
.overview-row { display: grid; grid-template-columns: 1fr 250px 280px; gap: 0; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; text-decoration: none; color: inherit; cursor: pointer; align-items: center; }
.overview-row:hover { background: #f8fafc; }
.overview-row:last-child { border-bottom: none; }

.col-project strong { display: block; font-size: 14px; margin-bottom: 2px; }
.project-repo { font-size: 11px; color: #888; }

.col-contributors { display: flex; flex-wrap: wrap; gap: 4px; }
.contributor-tag { display: inline-block; background: #e8f0fe; color: #2563eb; padding: 2px 8px; border-radius: 10px; font-size: 12px; }

.col-activity { display: flex; align-items: center; gap: 10px; }
.activity-bars { display: flex; gap: 2px; align-items: flex-end; height: 42px; }
.bar { width: 8px; background: #2563eb; border-radius: 2px 2px 0 0; min-height: 2px; transition: height 0.2s; }
.activity-total { font-size: 12px; color: #888; white-space: nowrap; }

/* Detail page */
.project-info { margin-bottom: 16px; }
.project-info h2 { font-size: 22px; display: inline; margin-right: 12px; }

.target-card { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.target-goal { font-size: 15px; font-weight: 600; color: #1e293b; }
.target-progress { margin-top: 8px; font-size: 13px; line-height: 1.5; }
.target-progress h4 { font-size: 14px; margin: 6px 0 4px; }
.target-progress ul { padding-left: 16px; margin: 4px 0; }
.target-progress li { margin-bottom: 3px; }

.charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.chart-container { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.chart-container h3 { font-size: 14px; margin-bottom: 10px; color: #64748b; }
.chart-container canvas { max-height: 250px; }

.contributors-section { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
.contributors-section h3 { font-size: 14px; margin-bottom: 8px; color: #64748b; }
.contributors-list { display: flex; flex-wrap: wrap; gap: 6px; }

/* Weekly timeline accordion */
.weekly-timeline { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.weekly-timeline > h3 { font-size: 14px; margin-bottom: 12px; color: #64748b; }

.week-entry { border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
.week-header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; cursor: pointer; user-select: none; background: #f8fafc; }
.week-header:hover { background: #f1f5f9; }
.week-toggle { font-size: 10px; color: #94a3b8; width: 12px; }
.week-range { font-weight: 600; font-size: 13px; min-width: 200px; }
.week-stats { font-size: 12px; color: #888; }

.week-body { padding: 12px 14px; border-top: 1px solid #e2e8f0; }
.week-commits { margin-bottom: 10px; }
.commit-item { font-size: 12px; padding: 3px 0; line-height: 1.5; }
.commit-hash { font-family: monospace; color: #2563eb; font-size: 11px; margin-right: 6px; }
.commit-msg { color: #333; }
.commit-author { color: #888; font-size: 11px; }

.week-description { font-size: 13px; line-height: 1.6; }
.week-description h4 { font-size: 14px; margin: 8px 0 4px; }
.week-description ul { padding-left: 18px; margin: 4px 0; }
.week-description li { margin-bottom: 3px; }
.week-description code { font-size: 11px; background: #f1f5f9; padding: 1px 4px; border-radius: 2px; }

.muted { color: #999; }

@media (max-width: 768px) {
  .charts-grid { grid-template-columns: 1fr; }
  .overview-header, .overview-row { grid-template-columns: 1fr 180px 200px; }
  .col-contributors { display: none; }
  .activity-total { display: none; }
}
```

**Step 2: Commit**

```bash
git add weekly-tracker/public/style.css
git commit -m "feat(weekly-tracker): rewrite CSS for timeline layout"
```

---

### Task 7: Update docs and metadata

**Files:**
- Modify: `weekly-tracker/SKILL.md`
- Modify: `weekly-tracker/package.json`

**Step 1: Update SKILL.md description**

Change the description line:
```
description: "Multi-project git timeline tracker. Collect git activity across projects and view project timelines with LLM-powered progress reports."
```

And update the Overview and Commands sections to reflect timeline instead of weekly.

**Step 2: Update package.json description**

Change:
```json
"description": "Multi-platform project git timeline tracker with LLM-powered progress descriptions"
```

**Step 3: Commit**

```bash
git add weekly-tracker/SKILL.md weekly-tracker/package.json
git commit -m "docs(weekly-tracker): update metadata for timeline redesign"
```

---

### Task 8: Update integration tests

**Files:**
- Modify: `weekly-tracker/test/integration.test.js`

**Step 1: Read the current test file**

Read the test file to understand current test structure.

**Step 2: Update tests**

- Remove tests for `/api/ask`
- Add tests for `GET /api/weeks/range` (valid range, missing params)
- Add tests for `GET /api/project/:name/timeline` (valid, 404 for unknown project, missing params)
- Verify `/api/weeks` still works

**Step 3: Run tests to verify**

Run: `cd weekly-tracker && npm test`
Expected: All tests pass

**Step 4: Commit**

```bash
git add weekly-tracker/test/integration.test.js
git commit -m "test(weekly-tracker): update integration tests for timeline API"
```

---

### Task 9: Manual smoke test

**Step 1: Start the server**

Run: `cd weekly-tracker && npm run serve`

**Step 2: Verify overview page at `http://localhost:3456/`**

- Page loads without JS errors
- Date range shows default 3-month range
- Project rows render with contributors and activity bars
- Clicking a project navigates to detail page

**Step 3: Verify detail page**

- Back link returns to overview
- Charts render (commit bar chart + trends line chart)
- Target card shows if project has target
- Weekly accordion expands/collapses
- Date range changes reload data

**Step 4: Verify API directly**

```bash
curl -s http://localhost:3456/api/weeks | head
curl -s "http://localhost:3456/api/weeks/range?from=2026-01-01&to=2026-05-26" | head
curl -s "http://localhost:3456/api/project/<name>/timeline?from=2026-01-01&to=2026-05-26" | head
```

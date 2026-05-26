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

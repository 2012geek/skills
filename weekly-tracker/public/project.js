let commitChart = null;
let trendChart = null;
let projectName = '';

function getRepoUrl(platform, owner, repo) {
  const hosts = {
    github: 'https://github.com',
    gitlab: 'https://gitlab.com',
    atomicgit: 'https://atomicgit.com',
  };
  const host = hosts[platform] || `https://${platform}.com`;
  if (platform === 'gitlab') return `${host}/${owner}/${repo}`;
  return `${host}/${owner}/${repo}`;
}

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

async function loadDetail(name, from, to) {
  projectName = name;

  hide(document.getElementById('detail'));
  hide(document.getElementById('error'));
  hide(document.getElementById('empty'));
  show(document.getElementById('loading'));

  try {
    let url = `/api/project/${encodeURIComponent(name)}/timeline`;
    const params = [];
    if (from) params.push(`from=${from}`);
    if (to) params.push(`to=${to}`);
    if (params.length) url += '?' + params.join('&');

    const res = await fetch(url);
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
    errEl.innerHTML = `加载失败: ${esc(err.message)} <button onclick="loadDetail(projectName)">重试</button>`;
    show(errEl);
  }
}

function renderDetail(data) {
  const p = data.project;
  document.getElementById('project-name').textContent = p.name;
  const repoEl = document.getElementById('project-repo');
  repoEl.innerHTML = `<a href="${getRepoUrl(p.platform, p.owner, p.repo)}" target="_blank">${esc(p.platform)}/${esc(p.owner)}/${esc(p.repo)}</a>`;
  document.title = `${p.name} - 项目概览`;

  const descEl = document.getElementById('project-description');
  descEl.textContent = '';

  // Target card
  if (data.target) {
    show(document.getElementById('target-card'));
    document.getElementById('target-goal').textContent = data.target.goal;
    const progressEl = document.getElementById('target-progress');
    if (data.target.overallProgress) {
      progressEl.innerHTML = renderMd(data.target.overallProgress);
      collapseLongLists(progressEl);
    } else {
      progressEl.innerHTML = '<span class="muted">暂无进展描述</span>';
    }
  } else {
    hide(document.getElementById('target-card'));
  }

  // Charts - weeks are newest first from API, reverse for chronological charts
  const weeks = [...data.weeks].reverse();
  const labels = weeks.map(w => w.weekStart);

  // Show date range in chart subtitles
  const dateRange = weeks.length > 0 ? `(${weeks[0].weekStart} ~ ${weeks[weeks.length - 1].weekEnd})` : '';
  document.getElementById('commit-chart-range').textContent = dateRange;
  document.getElementById('trend-chart-range').textContent = dateRange;

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
        <span class="week-authors">${(w.topAuthors || []).map(a => esc(a.name || a)).join(', ')}</span>
        <span class="week-stats">${w.commitCount} 提交 · ${w.filesChanged} 文件 · +${w.additions}/-${w.deletions}</span>
      </div>` +
      `<div class="week-body" id="${bodyId}" style="display:none">
        <div class="week-commits">
          ${(w.commitMessages || []).map(c => {
            const shortHash = esc(c.hash || '').substring(0, 7);
            const commitUrl = getRepoUrl(p.platform, p.owner, p.repo) + '/commit/' + esc(c.hash || '');
            return `<div class="commit-item">
              <a href="${commitUrl}" target="_blank" class="commit-hash-link"><code class="commit-hash">${shortHash}</code></a>
              <span class="commit-msg">${esc(c.message || '')}</span>
              <span class="commit-author">(${esc(c.author || '')})</span>
            </div>`;
          }).join('') || '<span class="muted">暂无提交</span>'}
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

  // Collapse long lists in weekly descriptions
  for (const desc of timeline.querySelectorAll('.week-description')) {
    collapseLongLists(desc);
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
  let html = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#### (.+)$/gm, '<h5>$1</h5>')
    .replace(/^### (.+)$/gm, (_, title) => {
      let cls = '';
      if (/已完成|完成/.test(title)) cls = ' section-done';
      else if (/进行中|进行/.test(title)) cls = ' section-progress';
      else if (/下一步|下一步计划/.test(title)) cls = ' section-next';
      return `<h3 class="section-header${cls}">${title}</h3>`;
    })
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

  // Merge consecutive <ul> blocks (and remove <br> between them)
  html = html.replace(/(<\/ul>)\s*(?:<br>\s*)?\s*(<ul>)/g, '');

  return html;
}

function collapseLongLists(container) {
  const uls = container.querySelectorAll('ul');
  for (const ul of uls) {
    const lis = ul.querySelectorAll('li');
    if (lis.length <= 8) continue;
    const hidden = [];
    for (let i = 6; i < lis.length; i++) {
      lis[i].style.display = 'none';
      hidden.push(lis[i]);
    }
    const btn = document.createElement('button');
    btn.className = 'collapse-toggle';
    btn.textContent = `展开全部 (${lis.length} 条)`;
    btn.addEventListener('click', () => {
      const show = btn.textContent.startsWith('展开');
      for (const li of hidden) li.style.display = show ? '' : 'none';
      btn.textContent = show ? `收起 (${lis.length} 条)` : `展开全部 (${lis.length} 条)`;
    });
    ul.parentNode.insertBefore(btn, ul.nextSibling);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const params = getParams();

  if (params.name) {
    loadDetail(params.name, params.from || '', params.to || '');
  } else {
    window.location.href = '/';
  }
});

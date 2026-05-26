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

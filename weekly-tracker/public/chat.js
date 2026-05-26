let currentWeek = '';

async function loadWeeks() {
  const res = await fetch('/api/weeks');
  const weeks = await res.json();
  if (weeks.length > 0) {
    currentWeek = weeks[0].week_start;
    loadWeek(currentWeek);
  } else {
    document.getElementById('week-label').textContent = '暂无数据';
  }
}

function makeProgressCell(rawText, emptyLabel) {
  if (!rawText) return `<span style="color:#999">${esc(emptyLabel || '&mdash;')}</span>`;
  const preview = rawText
    .replace(/^### .+\n?/gm, '')
    .replace(/^\*\*(.+?)\*\*/gm, '$1')
    .replace(/^[-*] /gm, '')
    .trim()
    .substring(0, 80);
  return `<div class="preview" data-raw="${esc(rawText)}" title="点击查看详情">${esc(preview)}</div>`;
}

function showPopover(el) {
  const raw = el.querySelector('.preview')?.dataset.raw;
  if (!raw) return;

  const header = el.closest('table').querySelector('thead tr');
  const colIdx = Array.from(el.parentElement.children).indexOf(el);
  const colTitle = header?.children[colIdx]?.textContent || '详情';

  document.getElementById('popover-title').textContent = colTitle;
  document.getElementById('popover-body').innerHTML = renderMd(raw);
  document.getElementById('popover-overlay').style.display = 'block';
  document.getElementById('popover').style.display = 'flex';
}

function hidePopover() {
  document.getElementById('popover').style.display = 'none';
  document.getElementById('popover-overlay').style.display = 'none';
}

async function loadWeek(weekStart) {
  currentWeek = weekStart;
  document.getElementById('week-label').textContent = `${weekStart} 周`;

  const res = await fetch(`/api/week/${weekStart}`);
  const data = await res.json();

  const stats = data.stats || {};
  document.getElementById('stat-projects').textContent = stats.active_projects || 0;
  document.getElementById('stat-commits').textContent = stats.total_commits || 0;
  document.getElementById('stat-files').textContent = stats.total_files_changed || 0;
  document.getElementById('stat-authors').textContent = new Set(
    data.projects.flatMap(p => (p.topAuthors || []).map(a => a.name))
  ).size || 0;

  const tbody = document.getElementById('project-rows');
  tbody.innerHTML = '';

  for (const p of data.projects) {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><strong>${esc(p.name)}</strong><br><span style="font-size:12px;color:#888">${esc(p.platform)}/${esc(p.owner)}/${esc(p.repo)}</span></td>` +
      `<td><span class="expand-btn" data-project="${esc(p.name)}">${p.commitCount} &#9660;</span></td>` +
      `<td>${p.topAuthors.length}</td>` +
      `<td class="target-cell">${p.target ? esc(p.target.goal) : '<span style="color:#999">&mdash;</span>'}</td>` +
      `<td class="progress-cell">${makeProgressCell(p.target?.overallProgress, '&mdash;')}</td>` +
      `<td class="progress-cell">${makeProgressCell(p.thisWeekDescription, p.commitCount === 0 ? '暂无活动' : '&mdash;')}</td>`;

    const detailTr = document.createElement('tr');
    detailTr.className = 'commit-detail';
    detailTr.id = `detail-${p.name.replace(/\W/g, '_')}`;
    detailTr.innerHTML = `<td colspan="6">${p.commitMessages.map(c =>
      `<span class="hash">${esc(c.hash)}</span> ${esc(c.message)} <span class="author">(${esc(c.author)})</span>`
    ).join('<br>') || '暂无提交'}</td>`;

    tbody.appendChild(tr);
    tbody.appendChild(detailTr);
  }

  document.getElementById('summary-text').textContent =
    data.projects.length === 0
      ? '本周暂无项目数据。请运行 `npm run collect` 采集数据。'
      : '本周暂无摘要。';

  document.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = `detail-${btn.dataset.project.replace(/\W/g, '_')}`;
      document.getElementById(id).classList.toggle('open');
    });
  });
}

// Popover handlers
document.getElementById('project-rows').addEventListener('click', (e) => {
  const cell = e.target.closest('.progress-cell');
  if (cell) showPopover(cell);
});

document.getElementById('popover-close').addEventListener('click', hidePopover);
document.getElementById('popover-overlay').addEventListener('click', hidePopover);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hidePopover();
});

document.getElementById('ask-btn').addEventListener('click', async () => {
  const input = document.getElementById('question-input');
  const question = input.value.trim();
  if (!question) return;

  const messages = document.getElementById('chat-messages');
  messages.innerHTML += `<div class="msg user"><strong>你：</strong> ${esc(question)}</div>`;
  input.value = '';

  messages.innerHTML += '<div class="msg assistant"><em>思考中...</em></div>';

  try {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, weekStart: currentWeek }),
    });
    const data = await res.json();
    messages.lastChild.innerHTML = `<strong>AI：</strong> ${esc(data.answer)}`;
  } catch (err) {
    messages.lastChild.innerHTML = `<strong>错误：</strong> ${esc(err.message)}`;
  }

  messages.scrollTop = messages.scrollHeight;
});

document.getElementById('prev-week').addEventListener('click', async () => {
  const weeks = await (await fetch('/api/weeks')).json();
  const idx = weeks.findIndex(w => w.week_start === currentWeek);
  if (idx < weeks.length - 1) loadWeek(weeks[idx + 1].week_start);
});

document.getElementById('next-week').addEventListener('click', async () => {
  const weeks = await (await fetch('/api/weeks')).json();
  const idx = weeks.findIndex(w => w.week_start === currentWeek);
  if (idx > 0) loadWeek(weeks[idx - 1].week_start);
});

document.getElementById('date-picker-btn').addEventListener('click', () => {
  const picker = document.getElementById('date-picker');
  picker.style.display = picker.style.display === 'none' ? 'inline' : 'none';
  picker.focus();
});

document.getElementById('date-picker').addEventListener('change', (e) => {
  const d = new Date(e.target.value);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  loadWeek(monday.toISOString().split('T')[0]);
});

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderMd(text) {
  if (!text) return '';
  try {
    return marked.parse(text);
  } catch {
    return esc(text);
  }
}

loadWeeks();

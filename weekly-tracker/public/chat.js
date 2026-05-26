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
      `<td>${p.target ? esc(p.target.goal) : '<span style="color:#999">&mdash;</span>'}</td>` +
      `<td style="font-size:13px">${p.target?.overallProgress || '<span style="color:#999">&mdash;</span>'}</td>` +
      `<td style="font-size:13px">${p.thisWeekDescription || (p.commitCount === 0 ? '<span style="color:#999">暂无活动</span>' : '<span style="color:#999">&mdash;</span>')}</td>`;

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

loadWeeks();

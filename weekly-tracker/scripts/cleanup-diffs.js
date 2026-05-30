#!/usr/bin/env node
const path = require('path');
const { getDb } = require(path.join(__dirname, '..', 'lib', 'db'));

const db = getDb();

const rows = db.prepare('SELECT id, week_start, project_id, commit_messages FROM weekly_reports').all();

let totalStripped = 0;
let totalBefore = 0;
let totalAfter = 0;

for (const row of rows) {
  let messages;
  try { messages = JSON.parse(row.commit_messages || '[]'); } catch { continue; }
  if (!Array.isArray(messages) || messages.length === 0) continue;

  let stripped = 0;
  const cleaned = messages.map(({ diff, files, ...rest }) => {
    if (diff || files) stripped++;
    return rest;
  });

  if (stripped === 0) continue;

  const before = row.commit_messages.length;
  const after = JSON.stringify(cleaned).length;

  db.prepare('UPDATE weekly_reports SET commit_messages = ? WHERE id = ?').run(JSON.stringify(cleaned), row.id);

  totalStripped += stripped;
  totalBefore += before;
  totalAfter += after;
}

console.log(`Stripped ${totalStripped} diffs/files from ${rows.length} rows`);
console.log(`commit_messages: ${(totalBefore / 1024 / 1024).toFixed(1)}MB → ${(totalAfter / 1024 / 1024).toFixed(1)}MB`);

// Vacuum to reclaim disk space
console.log('Vacuuming...');
db.exec('VACUUM');
console.log('Done.');

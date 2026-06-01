#!/usr/bin/env node
const path = require('path');
const libDir = path.join(__dirname, '..', 'lib');
const { getDb, getProjectByName } = require(path.join(libDir, 'db'));
const { ensureRepo, readKeyFiles } = require(path.join(libDir, 'git-collector'));
const { generateBaselineProgress } = require(path.join(libDir, 'llm'));
const os = require('os');

async function main() {
  const db = getDb();
  const projects = db.prepare(`
    SELECT DISTINCT p.name FROM projects p
    JOIN project_targets t ON t.project_id = p.id
    WHERE t.active = 1
  `).all();

  for (const { name } of projects) {
    const project = getProjectByName(name);
    const target = db.prepare('SELECT * FROM project_targets WHERE project_id = ? AND active = 1').get(project.id);
    if (!target) continue;

    await ensureRepo(project);
    const repoDir = path.join(os.tmpdir(), 'weekly-tracker-cache', project.name);
    const keyFiles = [];
    const fs = require('fs');
    function walk(dir, prefix, max) {
      if (keyFiles.length >= max) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      const sorted = entries
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== '.git')
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const e of sorted) {
        if (e.isFile()) {
          keyFiles.push(prefix + e.name);
          if (keyFiles.length >= max) return;
        }
      }
      for (const e of sorted) {
        if (e.isDirectory()) {
          walk(path.join(dir, e.name), prefix + e.name + '/', max);
          if (keyFiles.length >= max) return;
        }
      }
    }
    walk(repoDir, '', 15);
    const fileContents = await readKeyFiles(project, keyFiles);
    const progress = await generateBaselineProgress(project.name, target, fileContents);
    if (progress) {
      db.prepare('UPDATE project_targets SET overall_progress = ? WHERE id = ?').run(progress, target.id);
      console.log(name + ': updated overall_progress');
    }
  }
  db.close();
}
main().catch(err => { console.error(err); process.exit(1); });

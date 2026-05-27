# Fix Project Data Backfill — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix `getFirstCommitDate` so new projects backfill full commit history instead of only 2 weeks.

**Architecture:** The fix touches two files: `git-collector.js` (root cause — broken git command) and `collect.js` (remove 6-month cap). After the code fix, a small DB reset re-triggers backfill for the 4 affected projects.

**Tech Stack:** Node.js, simple-git, better-sqlite3

---

### Task 1: Fix `getFirstCommitDate` in `lib/git-collector.js`

**Files:**
- Modify: `weekly-tracker/lib/git-collector.js:165-169`

**Step 1: Replace the broken implementation**

Current (lines 165-169):
```js
async function getFirstCommitDate(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  const log = await localGit.log(['--reverse', '--format=%ai', '-1']);
  return log.latest?.date || null;
}
```

Replace with:
```js
async function getFirstCommitDate(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  try {
    const rootHash = await localGit.raw(['rev-list', '--max-parents=0', 'HEAD']);
    const hash = rootHash.trim().split('\n')[0];
    if (!hash) return null;
    const log = await localGit.log(['-1', hash]);
    return log.latest?.date || null;
  } catch {
    return null;
  }
}
```

**Step 2: Commit**

```bash
git add weekly-tracker/lib/git-collector.js
git commit -m "fix(weekly-tracker): fix getFirstCommitDate to find root commit correctly"
```

---

### Task 2: Remove 6-month cap in `scripts/collect.js`

**Files:**
- Modify: `weekly-tracker/scripts/collect.js:146-148`

**Step 1: Delete the cap lines**

Remove lines 146-148:
```js
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (firstDate > sixMonthsAgo) firstDate = sixMonthsAgo;
```

**Step 2: Commit**

```bash
git add weekly-tracker/scripts/collect.js
git commit -m "fix(weekly-tracker): remove 6-month backfill cap for full history"
```

---

### Task 3: Reset DB for the 4 affected projects

**Files:**
- Modify: `weekly-tracker/weekly.db` (via node script)

**Step 1: Run the DB reset**

```bash
cd weekly-tracker && node -e "
const { getDb } = require('./lib/db');
const db = getDb();
db.exec('DELETE FROM weekly_reports WHERE project_id IN (3, 4, 11, 12)');
db.exec('UPDATE projects SET last_analyzed_sha = NULL WHERE id IN (3, 4, 11, 12)');
console.log('Cleared data for projects 3, 4, 11, 12');
"
```

**Step 2: Commit**

```bash
git add weekly-tracker/weekly.db
git commit -m "fix(weekly-tracker): reset backfill state for 4 projects"
```

---

### Task 4: Run collect and verify

**Step 1: Run collection**

```bash
cd weekly-tracker && node scripts/collect.js
```

**Step 2: Verify all projects have full history**

```bash
cd weekly-tracker && node -e "
const { getDb } = require('./lib/db');
const db = getDb();
const counts = db.prepare(\`
  SELECT p.name, COUNT(wr.id) as weeks, MIN(wr.week_start) as earliest, MAX(wr.week_start) as latest
  FROM weekly_reports wr
  JOIN projects p ON wr.project_id = p.id
  GROUP BY p.name ORDER BY p.name
\`).all();
for (const c of counts) {
  console.log(c.name + ': ' + c.weeks + ' weeks (' + c.earliest + ' to ' + c.latest + ')');
}
"
```

Expected: All 5 projects show many weeks of data spanning from their first commit to the current week.

**Step 3: Commit any DB changes**

If the DB was modified, commit the updated database:

```bash
git add weekly-tracker/weekly.db && git commit -m "chore(weekly-tracker): update project data after backfill fix"
```

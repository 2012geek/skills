# Weekly Tracker UI Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 4 UI enhancements to the weekly tracker project detail page: author names in accordion headers, clickable commit hashes, clickable repo link, and project description sentence.

**Architecture:** Frontend-only changes — all required data (`topAuthors`, `hash`, `platform`/`owner`/`repo`, `target.goal`) already exists in the API responses. A shared `getRepoUrl()` helper constructs platform-specific URLs.

**Tech Stack:** Vanilla JS, HTML, CSS (no build tools, no frameworks)

---

### Task 1: Add `getRepoUrl()` helper to `project.js`

**Files:**
- Modify: `public/project.js` — add helper at top of file

**Step 1: Add the helper function**

Add this function at the top of `project.js` (after the existing `let` declarations, around line 5):

```javascript
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
```

**Step 2: Verify**

Start the server with `cd weekly-tracker && node scripts/serve.js`, open a project detail page in the browser, confirm no JS console errors.

**Step 3: Commit**

```bash
git add weekly-tracker/public/project.js
git commit -m "feat(weekly-tracker): add getRepoUrl helper for platform-specific URLs"
```

---

### Task 2: Show all authors in weekly accordion header

**Files:**
- Modify: `public/project.js:153-158` — update the `week-header` HTML

**Step 1: Update the accordion header template**

In `renderDetail()`, find the `week-header` div (around line 154). Change the header to include an authors span.

Replace this line:
```javascript
        <span class="week-stats">${w.commitCount} 提交 · ${w.filesChanged} 文件 · +${w.additions}/-${w.deletions}</span>
```

With:
```javascript
        <span class="week-authors">${(w.topAuthors || []).map(a => esc(a.name || a)).join(', ')}</span>
        <span class="week-stats">${w.commitCount} 提交 · ${w.filesChanged} 文件 · +${w.additions}/-${w.deletions}</span>
```

**Step 2: Add CSS for the authors span**

In `public/style.css`, after the `.week-stats` rule (line 70), add:

```css
.week-authors { font-size: 12px; color: #2563eb; min-width: 80px; }
```

**Step 3: Verify**

Reload the project detail page, expand a week with commits, confirm author names appear in the header between date range and stats.

**Step 4: Commit**

```bash
git add weekly-tracker/public/project.js weekly-tracker/public/style.css
git commit -m "feat(weekly-tracker): show all authors in weekly accordion header"
```

---

### Task 3: Make commit hashes clickable links to git host

**Files:**
- Modify: `public/project.js:161-166` — update commit item template
- Modify: `public/style.css:75` — update `.commit-hash` styling

**Step 1: Update the commit item template**

The `project` object (`p = data.project`) is already available in `renderDetail()` scope. We need to pass `platform`, `owner`, `repo` into the commit rendering.

Find the commit-item template (around line 161-166):

```javascript
          ${(w.commitMessages || []).map(c =>
            `<div class="commit-item">
              <code class="commit-hash">${esc(c.hash || '').substring(0, 7)}</code>
              <span class="commit-msg">${esc(c.message || '')}</span>
              <span class="commit-author">(${esc(c.author || '')})</span>
            </div>`
          ).join('') || '<span class="muted">暂无提交</span>'}
```

Replace with:

```javascript
          ${(w.commitMessages || []).map(c => {
            const shortHash = esc(c.hash || '').substring(0, 7);
            const commitUrl = getRepoUrl(p.platform, p.owner, p.repo) + '/commit/' + esc(c.hash || '');
            return `<div class="commit-item">
              <a href="${commitUrl}" target="_blank" class="commit-hash-link"><code class="commit-hash">${shortHash}</code></a>
              <span class="commit-msg">${esc(c.message || '')}</span>
              <span class="commit-author">(${esc(c.author || '')})</span>
            </div>`;
          }).join('') || '<span class="muted">暂无提交</span>'}
```

Note: the `.map()` callback changes from arrow expression `(c => ...)` to arrow block `(c => { ... return ... })` because we need intermediate variables.

**Step 2: Update CSS for commit hash link**

In `public/style.css`, replace the `.commit-hash` rule (line 75):

```css
.commit-hash { font-family: monospace; color: #2563eb; font-size: 11px; margin-right: 6px; }
```

With:

```css
.commit-hash-link { text-decoration: none; }
.commit-hash-link:hover .commit-hash { text-decoration: underline; }
.commit-hash { font-family: monospace; color: #2563eb; font-size: 11px; margin-right: 6px; }
```

**Step 3: Verify**

Reload the project detail page, expand a week, hover a commit hash — confirm it's a clickable link that opens the correct commit URL on the git host in a new tab.

**Step 4: Commit**

```bash
git add weekly-tracker/public/project.js weekly-tracker/public/style.css
git commit -m "feat(weekly-tracker): make commit hashes clickable links to git host"
```

---

### Task 4: Make project repo line a clickable external link

**Files:**
- Modify: `public/project.js:66` — change `textContent` to link

**Step 1: Update the repo line rendering**

In `renderDetail()`, find line 66:

```javascript
  document.getElementById('project-repo').textContent = `${p.platform}/${p.owner}/${p.repo}`;
```

Replace with:

```javascript
  const repoEl = document.getElementById('project-repo');
  repoEl.innerHTML = `<a href="${getRepoUrl(p.platform, p.owner, p.repo)}" target="_blank">${esc(p.platform)}/${esc(p.owner)}/${esc(p.repo)}</a>`;
```

**Step 2: Update CSS for repo link**

In `public/style.css`, update the `.project-repo` rule (line 31):

```css
.project-repo { font-size: 11px; color: #888; }
```

With:

```css
.project-repo { font-size: 11px; color: #888; }
.project-repo a { color: #888; text-decoration: none; }
.project-repo a:hover { color: #2563eb; text-decoration: underline; }
```

**Step 3: Verify**

Reload the project detail page, click the `platform/owner/repo` text below the project name — confirm it opens the repo on the git host.

**Step 4: Commit**

```bash
git add weekly-tracker/public/project.js weekly-tracker/public/style.css
git commit -m "feat(weekly-tracker): make project repo line a clickable external link"
```

---

### Task 5: Add project description sentence on detail page

**Files:**
- Modify: `public/project.html:30-33` — add description element
- Modify: `public/project.js:66` — populate the description
- Modify: `public/style.css` — add description styling

**Step 1: Add HTML element for the description**

In `public/project.html`, after the `project-info` div's existing content (after line 33 `</div>` that closes the inner flex, or equivalently inside `.project-info` after the repo span), add a description paragraph:

Find this section (lines 30-33):
```html
      <div class="project-info">
        <h2 id="project-name"></h2>
        <span class="project-repo" id="project-repo"></span>
      </div>
```

Replace with:
```html
      <div class="project-info">
        <h2 id="project-name"></h2>
        <span class="project-repo" id="project-repo"></span>
        <p class="project-description" id="project-description"></p>
      </div>
```

**Step 2: Populate the description in JS**

In `public/project.js`, in `renderDetail()`, after the repo line update (the line we just changed in Task 4), add:

```javascript
  const descEl = document.getElementById('project-description');
  if (data.target && data.target.goal) {
    descEl.textContent = data.target.goal;
  } else {
    descEl.textContent = '';
  }
```

**Step 3: Add CSS styling**

In `public/style.css`, after the `.project-info h2` rule (line 43), add:

```css
.project-description { font-size: 14px; color: #64748b; margin-top: 6px; }
```

**Step 4: Verify**

Reload the project detail page — confirm the target goal appears as a muted sentence below the project name and repo link.

**Step 5: Commit**

```bash
git add weekly-tracker/public/project.html weekly-tracker/public/project.js weekly-tracker/public/style.css
git commit -m "feat(weekly-tracker): show project description sentence on detail page"
```

---

## Verification Checklist

After all tasks are complete:

1. Start server: `cd weekly-tracker && node scripts/serve.js`
2. Open overview page at `http://localhost:3456`
3. Click into any project detail page
4. Verify:
   - [ ] Accordion headers show author names
   - [ ] Commit hashes are clickable and open correct URLs
   - [ ] Project repo line is clickable and opens correct URL
   - [ ] Project description sentence appears below project name
5. Open browser DevTools console — confirm no JS errors

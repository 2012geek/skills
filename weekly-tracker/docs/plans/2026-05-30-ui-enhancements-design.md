# Weekly Tracker UI Enhancements Design

**Date:** 2026-05-30
**Scope:** Frontend-only changes to `public/project.js`, `public/project.html`, and `public/style.css`

## Background

The weekly tracker dashboard has two pages: overview (all projects) and project detail (per-project timeline). Currently commit hashes are plain text, project repos are non-clickable, authors aren't shown in the weekly accordion headers, and there's no project-level description sentence.

All required data (`topAuthors`, `hash`, `platform`/`owner`/`repo`, `target.goal`) already exists in the API responses — no backend or DB changes needed.

## Optimizations

### 1. Show all authors in weekly accordion header

**Current:** `{date range} | {commit count} commits · {files} files · +{add}/-{del}`
**New:** `{date range} | {authors} | {commit count} commits · {files} files · +{add}/-{del}`

Extract all author names from `w.topAuthors` (already in API response) and display as comma-separated text in the accordion header.

### 2. Commit hash links to git host

**Current:** `<code class="commit-hash">abc1234</code>` (plain text)
**New:** `<a href="{repo-url}/commit/{hash}" target="_blank"><code>abc1234</code></a>`

URL varies by platform:
- `github` → `https://github.com/{owner}/{repo}/commit/{hash}`
- `gitlab` → `https://gitlab.com/{owner}/{repo}/-/commit/{hash}`
- `atomicgit` → `https://atomicgit.com/{owner}/{repo}/commit/{hash}`

### 3. Project repo line links to git host

**Current:** `<span class="project-repo">github/owner/repo</span>` (plain text)
**New:** `<a href="{repo-url}" target="_blank" class="project-repo">github/owner/repo</a>`

Same URL logic as optimization 2.

### 4. Project description sentence on detail page

**Current:** No project-level description outside the target card.
**New:** Show `data.target.goal` as a muted subtitle below the project name/repo line.

## Implementation

All changes are in the frontend (`public/`). A shared `getRepoUrl(platform, owner, repo)` helper handles URL construction by platform.

### Files to modify

- `public/project.js` — add `getRepoUrl()` helper, update accordion header to include authors, wrap commit hashes in links, make repo line a link, add description subtitle
- `public/project.html` — add a `<p>` element for the project description subtitle
- `public/style.css` — add styling for commit hash links and project description subtitle

### Out of scope

- Overview page changes (no commit details shown there)
- Backend/API/DB changes
- Full commit SHA storage (7-char prefix is sufficient for GitHub resolution)

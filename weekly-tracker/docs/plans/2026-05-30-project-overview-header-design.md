# Project Overview Page: Title & Date Picker Redesign

Date: 2026-05-30

## Problem

The project detail page has two issues:
1. The title "项目时间线" is misleading — the page shows more than just a timeline (charts, contributors, target progress)
2. The date range picker ([from] — [to] [应用]) is rarely useful and clutters the header

## Design

### Change 1: Rename title to "项目概览"

**Files**: `public/project.html`, `public/project.js`

- Change `<h1>项目时间线</h1>` → `<h1>项目概览</h1>`
- Change `document.title` from `${name} - 项目时间线` → `${name} - 项目概览`

### Change 2: Remove date picker, show date range in chart subtitles

**Files**: `public/project.html`, `public/project.js`, `public/style.css`, `server.js`, `lib/db.js`

#### Frontend

- Remove the `<div class="date-range">` block from `project.html` header
- Remove date picker initialization from `project.js` DOMContentLoaded
- Remove the "apply dates" click handler
- When no `from/to` URL params are present, call the API without date params (returns all data)
- When URL params exist, use them (preserves deep-linking)
- After loading data, extract the date range from the response and display it as chart subtitles:
  - `提交活动 (2026-03-02 ~ 2026-05-30)`
  - `文件/代码行趋势 (2026-03-02 ~ 2026-05-30)`
- Update chart `<h3>` elements to include the date range span

#### Backend

- Make `from/to` query params optional in the `/api/project/:name/timeline` endpoint
- When params are absent, `getProjectTimeline()` uses the earliest available week as `from` and today as `to`

#### CSS

- Remove `.date-range` styles
- Add `.chart-date-range` style for the subtitle (small, muted text)

## Files to Modify

1. `public/project.html` — remove date picker, update title
2. `public/project.js` — remove date logic, add date range subtitle, update title
3. `public/style.css` — remove date-range styles, add chart subtitle style
4. `server.js` — make from/to optional
5. `lib/db.js` — handle missing from/to by computing full range

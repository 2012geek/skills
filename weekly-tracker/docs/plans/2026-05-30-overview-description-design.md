# Overview Page Project Description Column Design

**Date:** 2026-05-30
**Scope:** Frontend-only changes to add a "项目描述" column to the overview table

## Background

The overview page at `/` currently shows a 3-column table: 项目, 贡献者, 提交活动. Users want a 4th column showing a one-sentence description of each project.

## Design

Add a "项目描述" column between "贡献者" and "提交活动". Each row displays `target.goal` from the existing `/api/weeks/range` API response. Projects without a target show a muted "—" placeholder.

**Layout change:**
```
Before: | 项目 | 贡献者 | 提交活动 |
After:  | 项目 | 贡献者 | 项目描述 | 提交活动 |
```

**CSS grid update:** Change `grid-template-columns` from `1fr 250px 280px` to `1fr 200px 1fr 280px`.

**Files to modify:**
- `public/index.html` — add `<div class="col-description">项目描述</div>` header
- `public/overview.js` — add description cell in each row using `p.target?.goal`
- `public/style.css` — update grid columns, add `.col-description` styling

**No backend changes** — the API already returns `target.goal` for each project.

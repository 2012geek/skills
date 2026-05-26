# Project Timeline UI Redesign

## Summary

Replace the current week-by-week progress view with a project timeline interface. The new design has two pages: a compact multi-project overview and a full-page detail view per project.

## Architecture

**Stack:** Express + vanilla HTML/CSS/JS + Chart.js (CDN)

**Pages:**
- `/` — Overview page (all projects, compact timeline bars)
- `/project/:name` — Detail page (single project, full timeline)

## API Changes

### New: `GET /api/weeks/range?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns all projects' weekly data flattened across a date range, with contributors aggregated per project.

```json
{
  "projects": [
    {
      "name": "...",
      "platform": "...",
      "owner": "...",
      "repo": "...",
      "target": { "goal": "...", "description": "...", "overallProgress": "..." },
      "totalCommits": 45,
      "contributors": ["Alice", "Bob", "Charlie"],
      "weeklyActivity": [3, 7, 2, 12, 0, 5, 8]
    }
  ],
  "weekLabels": ["2026-05-18", "2026-05-11", ...]
}
```

### New: `GET /api/project/:name/timeline?from=&to=`

Returns a single project's full history with all fields.

### Removed: `POST /api/ask`

Q&A chat feature is dropped.

## Overview Page

```
┌──────────────────────────────────────────────────────────┐
│ 项目时间线                        [from] - [to] date range│
├──────────────────────────────────────────────────────────┤
│ Project A  所有贡献者列表        ▂▁▃▅▂▁▄▆█▃▁▂▄  ▸     │
│ Project B  所有贡献者列表        ▁▁▁▂▁▁▃▄▂▁▁▁▁▂  ▸     │
│ Project C  所有贡献者列表        ██▆▃▂▁▁▁▁▁▁▁▁▁▁▁  ▸     │
└──────────────────────────────────────────────────────────┘
```

- Each row shows: project name, all contributors (aggregated), commit activity bars per week
- Activity bars are proportional commit counts per week (CSS flexbox + inline height)
- Click a row → navigates to `/project/:name`
- Date range picker filters both overview and detail views

## Detail Page

```
┌──────────────────────────────────────────────────────────┐
│ ← 返回总览    项目时间线               [from] - [to]     │
├──────────────────────────────────────────────────────────┤
│ Project A                          platform/owner/repo   │
│ ┌ Target Card ──────────────────────────────────────────┐│
│ │ 目标: xxx    整体进展: overall progress description   ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌ Commit Activity Chart (Chart.js bar) ─────────────────┐│
│ │ x=weeks, y=commit count                               ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ ┌ Files / Lines Trend (Chart.js line, 3 series) ────────┐│
│ │ files changed, additions, deletions over time          ││
│ └───────────────────────────────────────────────────────┘│
│                                                          │
│ Contributors: Alice (45)  Bob (32)  Charlie (18) ...     │
│                                                          │
│ ┌ Weekly Timeline (accordion, newest first) ────────────┐│
│ │ ▼ 2026-05-18 ~ 2026-05-24  12 commits · +230/-80     ││
│ │   Commits: abc1234 Fix auth (Alice)                   ││
│ │           def5678 Add rate limiting (Bob)             ││
│ │   本周进展: This week focused on auth improvements... ││
│ │                                                       ││
│ │ ▶ 2026-05-11 ~ 2026-05-17  8 commits · +90/-45       ││
│ └───────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

## States

- **No data:** "暂无数据，请运行 npm run collect 采集数据"
- **Empty range:** "所选时间范围内暂无数据"
- **Loading:** Skeleton placeholders for charts and lists
- **Error:** Inline banner with retry button
- **Zero-commit week:** bar height 0, weekly entry shows "暂无活动"
- **Missing LLM description:** "暂无进展描述" as muted text

## Implementation Scope

1. Add `GET /api/weeks/range` and `GET /api/project/:name/timeline` endpoints
2. Remove `POST /api/ask` endpoint
3. Rewrite `public/index.html` as overview page
4. Create `public/project.html` as detail page
5. Rewrite `public/style.css` for new layout
6. Replace `public/chat.js` with `public/overview.js` and `public/project.js`
7. Remove Q&A-related UI and API code
8. No database schema changes required

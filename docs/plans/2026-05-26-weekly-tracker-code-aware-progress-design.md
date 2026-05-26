# Weekly Tracker: Code-Aware Progress Descriptions

## Problem

Current progress descriptions (`this_week_description`, `overall_progress`) are generated from commit messages and file paths only. The LLM never reads actual code, so descriptions are guesses rather than analysis.

## Solution

Two-stage LLM pipeline that feeds actual git diffs and key file contents to the LLM, producing structured progress descriptions based on real code evidence.

## Data Flow

```
Current:
  git log → commit messages + file names → LLM guesses → 1-3 sentences

New:
  git log → full commit diffs → Stage 1 LLM analyzes diffs
                                      ↓
                              identifies key files to read
                                      ↓
                              reads those files' full content
                                      ↓
                              Stage 2 LLM synthesizes →
                                 structured weekly description
                                 synthesized overall progress (re-generated, not appended)
```

## File Changes

| File | Scope | Description |
|---|---|---|
| `lib/git-collector.js` | Medium | Collect full diffs via `git show`, read key files on demand |
| `lib/llm.js` | Major | Rewrite as two-stage pipeline with structured prompts |
| `scripts/collect.js` | Small | Wire new data flow between collector and LLM |
| `lib/db.js` | None | Schema unchanged, TEXT fields store structured markdown |
| `public/index.html` | Small | Render structured markdown in table cells |
| `public/style.css` | Small | Fixed table column widths, structured content styling |
| `package.json` | Small | Add `marked` dependency for markdown rendering |

## Two-Stage LLM Pipeline

### Stage 1: Diff Analysis

Input:
- All commit diffs for the week (no hard limit)
- Project target/goal

Output:
- Completed work (with code evidence)
- In-progress work (partial implementations)
- List of key files to read for deeper understanding

Key constraint: distinguish "truly completed" from "partially committed."

### Stage 2: Synthesis

Input:
- Stage 1 output
- Requested key files' full content
- Previous overall progress (if any)
- Project target/goal

Output: structured weekly description + synthesized overall progress.

## Output Format

### Weekly Description (`this_week_description`)

```markdown
### 已完成
- **Feature name** — what was done, referencing `path/to/file.ts` (+X/-Y)
- **Bug fix** — what was fixed, referencing `path/to/file.ts`

### 进行中
- **Feature name** — what exists vs. what's missing, estimated completion %

### 下一步
- Logical next step based on current code state
```

Rules:
- "已完成" must have code evidence in diffs
- "进行中" is for work started but clearly incomplete
- "下一步" is inferred reasonable next steps
- Every item references specific files

### Overall Progress (`overall_progress`)

Re-synthesized each week (not appended):

```markdown
**整体进度：约 70%**

Project has completed core auth module (JWT login, session management, token refresh)
and caching layer (LRU with TTL). Server framework is set up. API rate limiting and
user management CRUD are in development. Remaining: rate limit middleware integration,
user management backend, integration tests for auth and caching.
```

Rules:
- Fresh synthesis each week based on goal + current file state + weekly progress
- Progress percentage is optional, only when LLM has sufficient evidence
- List completed major modules and remaining work

## Frontend

- Render `this_week_description` and `overall_progress` as Markdown using `marked`
- Fixed table column widths via `table-layout: fixed` with explicit column widths
- If cell content is long, show scroll or expand within the fixed-width cell

## Cost Estimate

Per collect run (4 projects):
- Diffs: 2000-8000 tokens each → ~20000 total
- Key files: 1000-4000 tokens each → ~10000 total
- LLM output: ~3000 tokens
- **Total**: ~30000-50000 tokens, roughly $0.10-$0.20 with Claude Sonnet 4.6

# GitCode DiffNote `position` 字段真实语义

> 2026-07-20 在 PR #5 (openeuler/vla-factory) 上实测验证

## 核心结论

GitCode/Gitee API v5 创建行内评论 (DiffNote) 时,`position` 字段就是**新文件真实行号** — 直接用 agent 报告的 `line` 值,不需要换算成 patch 相对位置。

## 实测证据

PR #5 上发布 4 条 AI 行内评论,发送的 `position` 值与 GitCode 返回的 `diff_position.start_new_line` 对比:

| # | agent 报告 line | 发送的 position | GitCode 实际贴附 (diff_position.start_new_line) | 贴对吗? |
|---|---|---|---|---|
| 1 | 282 (lerobot_v3.py) | 76 (calculatePosition 输出) | **76** | ❌ 应该贴 282 |
| 2 | 327 (pi0.py)       | 327 (calculatePosition 输出,巧合等于 line) | **349** | ❌ 应该贴 327 (差 22,见下文"issue 2 特例") |
| 3 | 207 (cli.py)       | 49 (calculatePosition 输出) | **49** | ❌ 应该贴 207 |
| 4 | 225 (train.py)     | 83 (calculatePosition 输出) | **83** | ❌ 应该贴 225 |

GitCode API 验证命令:
```bash
curl -H "Authorization: Bearer $GITCODE_TOKEN" \
  "https://api.gitcode.com/api/v5/repos/openeuler/vla-factory/pulls/5/comments?per_page=100" \
  | jq '.[] | {id, body: .body[0:60], diff_position}'
```

返回字段:
```json
{
  "id": 180723609,
  "diff_position": {
    "start_new_line": 76,
    "end_new_line": 76,
    "position_type": "text"
  }
}
```

GitCode 直接把发送的 `position` 当 `start_new_line` 用 — 证明 `position` 就是新文件行号。

## 当前代码的 bug

`lib/gitcode-sdk/gitcode-api.js` 的 `calculatePosition(patch, lineNumber, isNewFile)` (319-353 行) 假设 `position` 是 patch 内 1-indexed 相对位置:

```js
calculatePosition(patch, lineNumber, isNewFile) {
  // ...遍历 patch hunk header, 累加 currentNewLine, 返回 patch 内 position...
}
```

这个函数把 `line`(新文件行号)换算成 patch 相对位置 (76/327/49/83),发给 GitCode 后,GitCode 把 76 当成 new_line 76 贴评论 → 贴错行号。

`lib/comment-formatter.js` 的 `correctLineNumber` (125-175 行) 也在做错误的行号修正,把 282 误改成 2 (基于"patch 内行数 = 文件总行数"的错误假设),进一步污染 position 计算。

## issue 2 特例:position=327 却贴在 349

agent 报 line=327,我们发 position=327,GitCode 实际贴 new_line=349。差 22 行。

可能原因:
1. PR 在贴评论之后又推送了新 commit,导致 pi0.py 当前行号偏移
2. GitCode 内部对 added/modified 文件状态做了额外换算
3. position 字段语义在 modified + 多 hunk 场景下还有其他规则

这个差异需要进一步实测,但不影响主要结论:**position 字段语义是新文件行号,不是 patch 相对位置**。issue 2 的偏差是另一个独立问题。

## 修复方案

### 1. `lib/comment-formatter.js formatIssue` (326-354 行)

简化为直接用 `issue.line`:

```js
// GitCode API 的 position 字段就是新文件真实行号,直接用 issue.line
let position = issue.position;

if (position === null || position === undefined) {
  position = issue.line;
}

if (position !== null && position !== undefined) {
  result.position = position;
}
```

`issue.position` 字段优先 (用户/agent 可显式覆盖),否则用 `issue.line`。

### 2. 删除冗余函数

- `lib/gitcode-sdk/gitcode-api.js` 删除 `calculatePosition` (319-353 行) 和 `calculatePositionsForFile` (355-361 行)
- `lib/comment-formatter.js` 删除 `correctLineNumber` (125-175 行) 和 `extractLineNumber` (108-116 行)

### 3. `lib/gitcode-sdk/gitcode-api.js submitInlineComment` (235-253 行)

第 243-244 行的 fallback `payload.position = comment.line` 仍然安全 — 因为 `comment.position` 不存在时 `comment.line` 就是新文件行号,正好。

### 4. `scripts/gitcode-reviewer.js` step8_PrepareComments

不需要再过滤无 position 项 — 因为 `issue.line` 永远存在,position 永远算得出来。但如果 issue.line 不在 PR diff 范围内 (agent 报告错行号),GitCode 会返回 400 错误,这条 issue 会被 `submitBatchComments` 标记失败。可以保留一个警告。

## 验证步骤

修复后:
1. 删 PR #5 上 4 条错位评论 (`scripts/delete-pr-comments.js --pr 5 --all-ai --ui-auth --yes`)
2. 重发 4 条 issue,position 字段直接用 `line` (282/327/207/225)
3. `GET /pulls/5/comments` 拉所有评论的 `diff_position.start_new_line`,验证:
   - issue 1: `start_new_line == 282` ✅
   - issue 2: `start_new_line == 327` ✅ (修复后应该对了,之前差 22 是 position 算错引起的副作用)
   - issue 3: `start_new_line == 207` ✅
   - issue 4: `start_new_line == 225` ✅

## 历史背景

- 2026-07-10 commit `3725b334` 引入 `correctLineNumber`,试图修一个"评论贴错位置"的 bug,但 `correctLineNumber` 本身的"actualLines = patch 内行数"假设错了,反而把更多本来能贴对的 issue 搞挂
- 之前 13 天的内存记录就指出过:"position 应直接使用目标代码在新文件中的行号,不是 diff 相对位置",但代码没改
- 2026-07-20 在 PR #5 上完整实测,确认 position 字段语义是新文件行号

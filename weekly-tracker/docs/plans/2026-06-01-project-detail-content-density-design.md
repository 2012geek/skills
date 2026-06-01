# 项目详情页内容密度优化设计

## 问题

项目详情页中 LLM 生成的进展描述（目标卡片的 overallProgress 和周详情中的 thisWeekDescription）内容过于密集、扁平，缺乏视觉层次。以 agent-chiplet-offload 为例，单周描述包含 20 条已完成、7 条进行中、11 条下一步，用户难以快速理解项目状态。

## 根因

1. **LLM prompt 无条目限制** — 没有要求合并同类项或限制数量
2. **前端渲染单调** — `renderMd()` 只做基础 markdown → HTML 转换，所有条目视觉权重相同

## 方案

### LLM Prompt 优化（lib/llm.js）

涉及 3 个函数：`synthesizeWithFiles`、`generateOverallProgress`、`generateBaselineProgress`

改动：
- 每个分类（已完成/进行中/下一步）最多 6 条
- 要求 LLM 将相关改动按主题分组，使用 `#### 主题名` 子标题
- 每项格式：`**功能名** — 一句话结论，引用关键文件`
- 合并同类小改动，不要逐条罗列

### 前端渲染优化（project.js + style.css）

改动：
- `renderMd()` 新增 `####` → `<h5>` 渲染（主题分组标签）
- `renderMd()` 新增 `` `file` `` → 蓝色等宽标签样式
- 分类区块用不同左边框颜色（绿/黄/灰）区分
- 条目超过 8 条时默认折叠，显示"展开全部"按钮

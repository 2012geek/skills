# 项目详情页内容密度优化实施计划

## 步骤

1. **优化 LLM prompt** — 修改 `lib/llm.js` 中 `synthesizeWithFiles`、`generateOverallProgress`、`generateBaselineProgress` 的 system prompt
2. **增强 renderMd** — 修改 `public/project.js` 中 `renderMd()` 支持 `####` 子标题、文件引用标签样式
3. **增强 CSS** — 修改 `public/style.css` 增加分类边框色、文件标签样式、折叠按钮样式
4. **添加折叠逻辑** — 在 `project.js` 中为长列表添加展开/折叠功能

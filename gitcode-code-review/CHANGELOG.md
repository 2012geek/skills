# Code Review Skill 更新日志

## [2.2.0] - 2026-01-22

### 修复 🐛

- **PR URL 修复**: 修复了 `getPRUrl` 方法生成的网页链接
  - 之前：`https://gitcode.com/{owner}/{repo}/pulls/{number}` (错误)
  - 现在：`https://gitcode.com/{owner}/{repo}/pull/{number}` (正确)
  - 说明：GitCode API 端点使用 `/pulls/`，但网页 URL 使用 `/pull/`

### 改进 ✨

- **文档更新**: 更新 README.md，补充准确的功能描述和使用成功样例
  - 添加 PR #46 审查样例（Shebang 格式错误）
  - 添加 PR #49 审查样例（5 项代码质量问题）
  - 修正功能描述（三维度审查 → 多代理并行审查）
  - 更新运行命令示例

### 实际使用案例

**PR #46**: https://gitcode.com/openeuler/lerobot_ros2/pull/46
- 发现 1 个问题：Shebang 格式错误
- 评论链接：https://gitcode.com/openeuler/lerobot_ros2/pulls/46#comment-3e2f95dbf1a709fb6c42270de371885f28c1e693

**PR #49**: https://gitcode.com/openeuler/lerobot_ros2/pull/49
- 发现 5 个问题：API 误用、硬编码路径、脚本错误处理
- 评论链接：
  - https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-e808d6d8a90c42c7e25007941d9890066fa319fb
  - https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-abf5425df1f35aeb68b2ca086efaace96c4f43c8
  - https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-ebd2b4a3752b3d97ea6ca1c0ce85b476830106c9
  - https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-e10ab653f58ba4138071dbb54e9c5ceda5286e44
  - https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-77b06b16d266071507367d38db7abc7eeb687c68

## [2.1.0] - 2026-01-21

### 修复 🐛

- **关键修复**: 修复了 `buildReviewContext` 方法遗漏 `fullContent` 字段的 bug
  - 之前：虽然获取了完整文件内容，但没有传递到 context.json 和 prompt 中
  - 现在：完整文件内容正确传递，避免上下文不足导致的幻觉

### 改进 ✨

- **上下文验证**: 在 prompt 中添加了明确的上下文验证指导
  - 提醒在提出问题前验证变量是否已定义
  - 列出常见误报示例（如 "变量未定义"）
  - 强调仔细阅读完整文件内容

## [2.0.0] - 2026-01-20

### 新增 ✨

- 支持基于 Claude 语义理解的代码检视（非规则式）
- 支持行内评论（评论在特定代码行）
- 详细的检视格式：问题描述、上下文代码、修复方案、参考资料
- 完整文件内容获取以提供充分上下文

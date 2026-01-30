---
name: gitcode-ci-repair
description: >
  自动修复 GitCode MR 的 CI 失败问题，通过迭代分析和修复直到门禁检查通过。
  监控 CI 标签状态，解析 bot 评论中的失败消息，生成修复方案，
  使用 git commit --amend 提交修复，循环直到 CI 通过。
  适用于需要自动修复 GitCode MR 的 CI 失败、迭代修复失败的 pre-commit 钩子
  或自动化 CI 修复循环的场景。
---

# GitCode CI 自动修复工具

自动修复 GitCode MR 门禁检查失败的工具，通过迭代分析和修复直到 CI 通过。

## 工作流程

1. **指定 MR** - 用户输入 MR 链接或编号（如: https://gitcode.com/openeuler/lerobot_ros2/pull/50）
2. **检查标签** - 获取 PR 的 labels（标签）
3. **触发测试** - 如果没有 `ci_failed` 或 `ci_successful` 标签，发表 `/retest` 评论触发重新测试
4. **成功退出** - 如果检测到 `ci_successful` 标签，输出成功信息并结束
5. **获取失败** - 如果检测到 `ci_failed` 标签，查找最新的 CI 失败评论
6. **解析检查项** - 从评论中提取每个检查项目的结果（✅ 成功 / ❌ 失败）
7. **生成修复方案** - 分析失败问题并自动生成修复方案
8. **执行修复** - 执行修复命令并使用 `git commit --amend` 提交（不产生新 commit）
9. **触发重测** - 发表 `/retest` 评论，返回步骤 2 继续下一轮
10. **循环直到成功** - 重复上述步骤直到 CI 通过

## 使用方法

### 命令行方式

```bash
# 使用 MR 编号
node skills/gitcode-ci-repair/scripts/repair.js 50

# 使用完整 URL
node skills/gitcode-ci-repair/scripts/repair.js https://gitcode.com/openeuler/lerobot_ros2/pull/50
```

### Claude Code 调用

直接告诉 Claude：
- "修复 MR #50 的 CI 失败"
- "使用 gitcode-ci-repair skill 修复 https://gitcode.com/openeuler/lerobot_ros2/pull/50"

## 支持的修复类型

| 问题类型 | 检查项 | 修复方案 |
|---------|-------|---------|
| 代码格式 | ruff | 运行 `ruff format` 格式化代码 |
| 代码检查 | ruff | 运行 `ruff check --fix` 自动修复 |
| 类型检查 | mypy | 添加缺失的类型注解 `dict[str, T]` |
| 导入顺序 | pre-commit | 调整 import 顺序（stdlib → third-party） |
| 未使用变量 | ruff F841 | 删除变量或重命名为 `_variable` |
| 嵌套条件 | ruff SIM102 | 合并多个 if 为单个条件 |
| 提交信息 | commit_msg | 添加 Signed-off-by 行 |

## 配置文件

在项目根目录创建 `config.json`：

```json
{
  "gitcode": {
    "token": "your_gitcode_token",
    "baseUrl": "https://api.gitcode.com",
    "owner": "openeuler",
    "repo": "lerobot_ros2"
  }
}
```

## 提交策略

- **始终使用 `git commit --amend`** - 不产生新的 commit 记录
- **使用 `git push -f` 强制推送** - 更新远程分支
- **最大迭代次数 10 次** - 防止无限循环

## 技术架构

```
gitcode-ci-repair/
├── SKILL.md              # Skill 文档（给 Claude 读取）
├── README.md             # 详细使用说明
├── lib/
│   └── gitcode-api.js    # GitCode API 封装
└── scripts/
    └── repair.js         # 主修复流程脚本
```

## 依赖要求

- Node.js >= 18
- GitCode access token（访问令牌）
- Git CLI
- Python 环境（用于运行 pre-commit 钩子）

## 输出示例

```
========================================
🔧 GitCode CI Auto-Repair
========================================

📋 MR #50: feat: merge video_2_img into master
🏷️  Labels: ci_failed, openeuler-cla/yes

--- 迭代 1/10 ---

❌ 失败项 (2):
   1. pre-commit: FAILED
   2. commit_msg: FAILED

💡 修复方案:
   1. 运行 pre-commit 自动修复
      命令: SKIP=gitleaks pre-commit run --all-files
   2. 添加 Signed-off-by
      命令: git commit --amend --signoff --no-edit

🔧 执行修复...
   应用: 运行 pre-commit 自动修复
   应用: 添加 Signed-off-by

📝 提交修复 (git commit --amend)...
   ✅ 修复已提交并推送

🔄 触发 /retest...
✅ 修复完成，等待 CI 结果...

========================================
🎉 CI 修复成功！
========================================
✅ MR #50 的所有检查已通过
```

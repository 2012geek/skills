# GitCode CI 自动修复工具

自动修复 GitCode MR 门禁检查失败的工具，通过迭代分析和修复直到 CI 通过。

## 功能特性

- ✅ **自动检测 CI 状态** - 监控 PR 的 labels 标签
- ✅ **解析失败检查项** - 从 bot 评论中提取具体失败信息
- ✅ **生成修复方案** - 根据失败类型自动生成修复命令
- ✅ **自动应用修复** - 执行修复命令（ruff、mypy、prettier 等）
- ✅ **使用 git commit --amend** - 不产生新的 commit 记录
- ✅ **循环修复直到通过** - 自动重测直到 CI 成功

## 快速开始

### 1. 配置文件

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

### 2. 运行修复

```bash
# 使用 MR 编号
node skills/gitcode-ci-repair/scripts/repair.js 50

# 使用完整 URL
node skills/gitcode-ci-repair/scripts/repair.js https://gitcode.com/openeuler/lerobot_ros2/pull/50
```

### 3. 在 Claude Code 中使用

直接告诉 Claude：
- "修复 MR #50 的 CI 失败"
- "使用 gitcode-ci-repair skill 修复 https://gitcode.com/openeuler/lerobot_ros2/pull/50"

## 工作流程图

```
┌─────────────────────────────────────────────────────────────┐
│                    用户指定 MR                               │
└────────────────────────┬────────────────────────────────────┘
                         ▼
            ┌──────────────────────────────┐
            │   检查 PR Labels（标签）      │
            └──────────────────────────────┘
                         │
                ┌────────┴────────┐
                ▼                 ▼
          ┌──────────┐      ┌──────────┐
          │ 无标签   │      │ci_failed │
          └────┬─────┘      └────┬─────┘
               │                │
               ▼                ▼
         发表 /retest      解析失败项
         等待 30s          生成修复
               │                │
               ▼                ▼
         ┌──────────────────────┐
         │  执行修复            │
         │  - pre-commit       │
         │  - ruff/mypy        │
         │  - git commit --amend│
         │  - git push -f      │
         └──────────┬───────────┘
                    │
                    ▼
              发表 /retest
                    │
                    └──────► 返回检查（循环）
                               │
                               ▼
                        ┌──────────────┐
                        │ ci_successful│
                        └──────────────┘
                               │
                               ▼
                          ✅ 成功退出
```

## 支持的修复类型

| 检查项 | 错误类型 | 修复命令 |
|-------|---------|---------|
| **ruff** | F841 未使用变量 | `ruff check --fix .` |
| **ruff** | SIM102 嵌套 if | `ruff check --fix .` |
| **ruff-format** | 格式问题 | `ruff format .` |
| **mypy** | 缺失类型注解 | 手动添加 `dict[str, T]` |
| **prettier** | Markdown 格式 | `prettier --write .md` |
| **commit_msg** | 缺少 Signed-off-by | `git commit --amend --signoff` |

## 修复规则详解

### 1. ruff 自动修复

```bash
# 运行 ruff 自动修复
ruff check --fix .

# 常见修复：
# - 删除未使用的导入和变量
# - 合并嵌套的 if 条件
# - 简化代码结构
```

### 2. ruff 格式化

```bash
# 统一代码格式
ruff format .

# 修复：
# - 统一缩进
# - 调整空行
# - 统一引号风格
```

### 3. mypy 类型检查

```bash
# 检查类型错误
mypy .

# 手动修复：
# - 添加类型注解: data: dict[str, Any]
# - 导入 typing 模块
```

### 4. commit_msg 修复

```bash
# 添加 Signed-off-by
git commit --amend --signoff --no-edit

# 修复：
# - 添加: Signed-off-by: <name> <email>
# - 符合 DCO（Developer Certificate of Origin）
```

## 输出示例

```
========================================
🔧 GitCode CI 自动修复工具
========================================
📋 MR #50: feat: merge video_2_img into master
📍 openeuler/lerobot_ros2

--- 迭代 1/10 ---

🏷️  当前标签: ci_failed, openeuler-cla/yes

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
⏳ 等待 60 秒...

--- 迭代 2/10 ---

🏷️  当前标签: ci_successful

========================================
🎉 CI 修复成功！
========================================
✅ MR #50 的所有检查已通过
🔗 https://gitcode.com/openeuler/lerobot_ros2/pull/50
```

## 依赖要求

| 依赖 | 版本要求 | 说明 |
|-----|---------|------|
| Node.js | >= 18 | 运行 repair.js 脚本 |
| Git | 最新 | 提交和推送代码 |
| Python | >= 3.8 | 运行 pre-commit 钩子 |
| pre-commit | 最新 | 代码质量检查 |

## 注意事项

1. **Git 操作**: 使用 `git commit --amend` 会修改最近的 commit，确保分支没有其他人使用
2. **强制推送**: 使用 `git push -f` 会覆盖远程分支，请确认分支安全性
3. **等待时间**: 每次 /retest 后需要等待 30-60 秒让 CI 运行
4. **最大迭代**: 最多 10 次迭代，超过后需要手动检查

## 故障排除

### 问题: 无法连接 GitCode API

**解决方案**: 检查 `config.json` 中的 token 是否正确。

### 问题: pre-commit 运行失败

**解决方案**: 确保本地已安装 Python 环境：
```bash
pip install pre-commit
pre-commit install
```

### 问题: git push 失败

**解决方案**: 确认推送到正确的远程仓库（fork 而非上游）：
```bash
git remote -v
```

## 技术架构

```
gitcode-ci-repair/
├── SKILL.md              # Skill 文档（Claude 读取）
├── README.md             # 详细使用说明
├── lib/
│   └── gitcode-api.js    # GitCode API 封装层
└── scripts/
    └── repair.js         # 主修复流程脚本
```

## 许可证

MIT License

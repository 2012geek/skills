# GitCode PR 自动化技能

自动化 GitCode Pull Request 创建，使用 LLM 分析生成语义化 PR 描述。

## ✨ 成功案例

**[PR #50: [新增] 视频预处理工具，并优化视频模块与模型导出](https://gitcode.com/openeuler/lerobot_ros2/pull/50)**

该 PR 使用此技能自动更新，包含：

- ✅ 语义化变更描述（新增/移动/修改）
- ✅ LLM 智能特征提取
- ✅ Claude API 生成的中文标题
- ✅ Markdown 格式的测试命令
- ✅ 集成在 PR 正文中的测试验证报告

### 生成的 PR 结构

```markdown
### 主要变更

- **修改视频工具模块** (`src/lerobot/datasets/video_utils.py`)
  - 添加视频解码后端自动选择功能，支持基于图像的时间戳同步加载

- **新增视频处理** (`src/tools/preprocessor/video_to_images.py`)
  - 提供视频到图像的转换功能，支持 PyAV 和 Decort 解码，多进程处理与 GPU 加速

- **移动Export model** (`src/tools/transfer_model/export_model.py`)
  - 导出模型为 ONNX 格式并转换为 Ascend OM 模型

- **新增完整的测试套件** (`tests/tools/preprocessor/`)
  - 提供视频到图像的转换功能，支持 PyAV 和 Decort 解码，多进程处理与 GPU 加速

---

## 如何测试

**测试命令**

```bash
pytest tests/tools/preprocessor/test_preprocess_videos_pyav.py -v
pytest tests/tools/preprocessor/ -v
```

## 测试验证报告

### 测试执行输出

#### 语法检查输出
```bash
$ python -m py_compile tests/tools/preprocessor/test_*.py src/tools/preprocessor/*.py

=== 语法检查结果 ===
✓ tests/tools/preprocessor/test_preprocess_videos_pyav.py: 语法检查通过
✓ tests/tools/preprocessor/test_preprocess_videos_real.py: 语法检查通过
✓ tests/tools/preprocessor/test_preprocess_videos_simple.py: 语法检查通过
...
=== 语法检查完成 ===
所有文件语法检查通过 ✅
```

### 验证结论

| 验证项 | 状态 | 说明 |
|--------|------|------|
| Python 语法检查 | ✅ 通过 | 所有 7 个文件语法正确 |
| 测试框架结构 | ✅ 通过 | 4 个测试文件 |
| 测试用例覆盖 | ✅ 通过 | 覆盖主要功能场景 |
```

## 🚀 快速开始

### 1. 配置

在项目根目录创建 `config.json`：

```json
{
  "gitcode": {
    "token": "your_gitcode_token",
    "baseUrl": "https://api.gitcode.com",
    "owner": "your_org",
    "repo": "your_repo"
  }
}
```

### 2. 生成 PR 描述

```bash
# 基础版本（不使用 LLM）
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js <prNumber>

# 使用 LLM 分析（从 ~/.claude/settings.json 读取 API 配置）
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js 50

# 非交互模式（自动确认 PR 更新）
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js 50 <<< "y"
```

## 📁 项目结构

```
skills/gitcode-pr/
├── SKILL.md                 # 技能文档
├── README.md                # 本文件
├── lib/
│   └── gitcode-api.js      # GitCode API 客户端
└── scripts/
    ├── generate-semantic-desc-v3.js  # 主 PR 描述生成器
    ├── browser-pr.js        # 浏览器自动化 PR 创建
    └── create-pr.js         # 本地仓库 PR 创建
```

## 🎯 核心特性

### LLM 驱动分析

- **理解实际代码变更** - 分析文件内容生成准确描述
- **智能特征提取** - 过滤问答格式，提取功能性关键词
- **适配任何代码库** - 无需修改即可使用
- **生成准确描述** - 真实反映代码实际功能

### 动态变更类型

| 文件状态 | 类型标签 |
|-------------|------------|
| `added` | 新增 |
| `renamed` | 移动 |
| `modified` | 修改 |
| `deleted` | 删除 |

### 中文 PR 标题生成

使用 Claude API 生成简洁中文标题（10-50 字符）：

- 格式：`[动作] [具体功能描述]`
- 示例：
  - ✅ `新增视频预处理工具，支持多进程解码`
  - ✅ `修复视频解码内存泄漏问题`
  - ✅ `优化模型导出流程，支持 ONNX 格式`
  - ❌ `更新代码结构`（过于泛泛）

### Markdown 格式测试命令

测试命令自动包装为代码块：

```markdown
**测试命令**

```bash
pytest tests/tools/preprocessor/test_preprocess_videos_pyav.py -v
pytest tests/tools/preprocessor/ -v
```
```

### 测试验证报告

技能自动生成：
- 语法检查结果 (`python -m py_compile`)
- 测试框架验证 (`pytest --collect-only`)
- 验证结论表格

## 📊 优化对比

| 方面 | 优化前 | 优化后 |
|--------|--------|-------|
| PR 摘要 | "本 PR 所做的工作" 章节 | 已移除，直接显示"主要变更" |
| 测试命令 | 纯文本格式 | Markdown 代码块 |
| PR 标题 | 英文或不准确 | 中文，由 Claude API 生成 |
| 特征提取 | 简单逐行过滤 | 智能段落级提取 |
| 格式对齐 | 不一致 | 统一使用 `  - ` 前缀 |

## 🔧 环境要求

- Node.js >= 18
- GitCode 访问令牌
- （可选）Claude API 配置（位于 `~/.claude/settings.json`）

## 📝 使用示例

### 更新现有 PR

```bash
# 使用语义化描述更新 PR #50
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js 50

# 自动确认（非交互模式）
node skills/gitcode-pr/scripts/generate-semantic-desc-v3.js 50 <<< "y"
```

### 创建新 PR

```bash
# 使用浏览器自动化
node skills/gitcode-pr/scripts/browser-pr.js source-repo branch target-repo target-branch
```

## 🔌 API 集成

技能会自动从 `~/.claude/settings.json` 读取 Claude API 配置：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your_token_here",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  }
}
```

完全支持自定义端点（如 `api.z.ai`）。

## 🤝 贡献

此技能设计用于任何 GitCode 仓库。如需改进或发现问题，请参考主项目仓库。

## 📄 许可证

与父项目相同。

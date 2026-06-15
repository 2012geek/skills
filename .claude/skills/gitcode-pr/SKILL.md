---
name: gitcode-pr
description: >
  自动化 GitCode Pull Request 创建和语义化 PR 描述生成。
  使用 LLM 分析文件变更，无需硬编码规则即可生成准确描述。
  适用于：创建 Pull Request、自动生成 LLM 分析的 PR 描述、生成反映实际代码变更的语义化描述、或面向 GitCode 仓库的操作。
---

# GitCode Pull Request 创建工具

自动创建 Pull Request 并使用 LLM 分析生成语义化 PR 描述。

## 可用脚本

| 脚本 | 用途 |
|--------|---------|
| `generate-semantic-desc-v3.js` | **推荐** - LLM 驱动的语义化 PR 描述生成 |
| `browser-pr.js` | 浏览器自动化 PR 创建 |
| `create-pr.js` | 本地仓库 PR 创建 |

## 使用方法

### 生成语义化 PR 描述（推荐）

```bash
# 基础版本（不使用 LLM）
cd gitcode-pr && node scripts/generate-semantic-desc-v3.js <prNumber>

# 使用 LLM 分析文件内容（从 ~/.claude/settings.json 读取 API 配置）
cd gitcode-pr && node scripts/generate-semantic-desc-v3.js 50

# 非交互模式（自动确认更新）
cd gitcode-pr && node scripts/generate-semantic-desc-v3.js 50 <<< "y"
```

### 使用浏览器创建 PR

```bash
cd gitcode-pr && node scripts/browser-pr.js <source-repo> <source-branch> <target-repo> <target-branch>
```

## 设计理念

### LLM 驱动分析

v3 版本使用 LLM 替代硬编码规则：

1. **理解实际代码变更** - 不再"凭空想象"不存在的功能
2. **适配任何代码库** - 无需修改即可适用于任何项目
3. **生成准确描述** - 真实反映代码的实际功能

### v2 vs v3 改进对比

| 方面 | v2 (硬编码) | v3 (LLM 驱动) |
|--------|-----------------|-------------------|
| 功能检测 | If/else 规则（脆弱） | LLM 分析（灵活） |
| 准确性 | 可能猜测错误 | 基于实际代码变更（正确） |
| 维护成本 | 需为每种情况添加规则 | 一个 prompt 处理所有情况 |
| 变更类型 | 全部标记为"新增"（不准确） | 动态识别：新增/移动/修改 |
| 测试指令 | 静态模板 | LLM 生成 + 备用方案 |

## 输出示例

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

### 语法检查输出

```bash
$ python -m py_compile tests/tools/preprocessor/test_*.py

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

## 工作原理

1. **从 GitCode API 获取文件变更**
2. **LLM 分析**（如果提供 API 密钥）：
   - 发送文件内容和状态到 LLM
   - 获取实际功能摘要
3. **备用内容分析**（如果没有 LLM）：
   - 分析代码结构（函数、导入）
   - 生成智能描述
4. **按类型组织**：
   - 源代码文件（工具、模块）
   - 测试文件（聚合为测试套件）
5. **验证输出**：
   - 移除重复功能
   - 过滤非代码文件
6. **动态变更类型**：
   - `added` → 新增
   - `renamed` → 移动
   - `modified` → 修改
   - `deleted` → 删除
7. **LLM 测试指令**（如果提供 API 密钥）：
   - 生成可运行的测试命令
   - 创建审查者测试步骤
   - 失败时回退到模板

## 核心特性

### 智能特征提取
- 段落级分组，保持语义完整性
- 过滤问答格式和非功能性内容
- 仅保留包含功能性关键词的描述
- 每个文件最多 3 个核心特征

### 中文 PR 标题生成
- 使用 Claude API 生成简洁中文标题（10-50 字符）
- 格式：`[动作] [具体功能描述]`
- 示例：
  - ✅ `新增视频预处理工具，支持多进程解码`
  - ✅ `修复视频解码内存泄漏问题`
  - ❌ `更新代码结构`（过于泛泛）

### Markdown 格式测试命令
- 自动包装为代码块
- 清理冗余前缀文字
- 仅包含可执行的 bash 命令

## 配置

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

### Claude API 配置（可选）

脚本会自动从 `~/.claude/settings.json` 读取 API 配置：

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "your_token_here",
    "ANTHROPIC_BASE_URL": "https://api.anthropic.com"
  }
}
```

支持自定义端点（如 `api.z.ai`）。

## 成功案例

**[PR #50: [新增] 视频预处理工具，并优化视频模块与模型导出](https://gitcode.com/openeuler/lerobot_ros2/pull/50)**

该 PR 使用此技能自动更新，包含：
- ✅ 语义化变更描述（新增/移动/修改）
- ✅ LLM 智能特征提取
- ✅ Claude API 生成的中文标题
- ✅ Markdown 格式的测试命令
- ✅ 集成在 PR 正文中的测试验证报告

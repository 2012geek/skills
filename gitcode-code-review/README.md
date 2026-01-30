# GitCode PR 代码审查 Skill

自动审查 GitCode 仓库 Pull Request 的 Claude Code Skill。基于多代理并行审查机制，支持 Bug 扫描、安全检测、API 误用识别和逻辑错误分析。

## 功能特性

- **多代理并行审查** - 5 个专业代理同时分析代码：
  - Bug Scanner (Diff) - 扫描明显的语法错误、类型错误、API 误用
  - Bug Scanner (Diff-2) - 冗余扫描，提高准确率
  - Code Analyzer - 查找安全问题、逻辑错误、性能问题
  - Semantic Analyzer - 理解代码意图，发现深层逻辑问题
  - Python @classmethod Checker - 检测 Python 类中 @classmethod 装饰器使用问题
  - Issue Validator - 二次验证问题真实性
- **置信度评分** - 只发布置信度 >= 80 的高质量问题
- **自动去重** - 相同问题只报告一次
- **行内评论** - 直接将审查意见附加到代码行
- **自动添加参考资料** - 根据问题类型自动添加官方文档链接

## 快速开始

### 1. 配置 GitCode Token

在项目根目录创建 `config.json` 文件：

```json
{
  "gitcode": {
    "token": "your_personal_access_token",
    "owner": "openeuler",
    "repo": "lerobot_ros2",
    "baseUrl": "https://api.gitcode.com"
  },
  "codeReview": {
    "confidenceThreshold": 80,
    "skipValidation": false
  }
}
```

### 2. 获取 GitCode Personal Access Token

1. 访问 [GitCode](https://gitcode.com) 并登录
2. 点击右上角头像 → 个人设置
3. 找到「访问令牌」选项
4. 点击「新建访问令牌」，勾选 `repo` 和 `pull_request` 权限
5. **立即复制保存** Token（只显示一次）

### 3. 运行审查

```bash
# 生成代理 prompts（供手动分析）
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 46

# 从 JSON 文件提交评论
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 46 --issues-from-json issues.json

# 跳过验证（快速模式）
node skills/gitcode-code-review/scripts/gitcode-reviewer.js --pr 46 --issues-from-json issues.json --skip-validation
```

## 使用成功样例

### 样例 1: PR #46 - Shebang 格式错误

**PR**: https://gitcode.com/openeuler/lerobot_ros2/pull/46

**发现的问题**:
| 文件 | 行号 | 问题类型 | 严重性 |
|------|------|----------|--------|
| `examples/lekiwi/evaluate_dataset.py` | 1 | syntax_error | error |

**问题描述**: Shebang 格式错误 - `# !/usr/bin/env python` 应为 `#!/usr/bin/env python`

**评论链接**: https://gitcode.com/openeuler/lerobot_ros2/pulls/46#comment-3e2f95dbf1a709fb6c42270de371885f28c1e693

### 样例 2: PR #49 - 多项代码质量问题

**PR**: https://gitcode.com/openeuler/lerobot_ros2/pull/49

**发现的问题** (5 条):
| 文件 | 行号 | 问题类型 | 严重性 |
|------|------|----------|--------|
| `src/tool/ASR/funasr_client.py` | 109 | API 误用（废弃 API） | warning |
| `src/tool/ASR/funasr_client.py` | 17 | 硬编码路径 | warning |
| `src/tool/ASR/install.sh` | 9 | exit 缺少返回码 | warning |
| `src/tool/ASR/install.sh` | 46 | cmake 缺少错误检查 | warning |
| `src/tool/ASR/install.sh` | 27 | wget 缺少错误检查 | warning |

**评论链接**:
- https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-e808d6d8a90c42c7e25007941d9890066fa319fb
- https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-abf5425df1f35aeb68b2ca086efaace96c4f43c8
- https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-ebd2b4a3752b3d97ea6ca1c0ce85b476830106c9
- https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-e10ab653f58ba4138071dbb54e9c5ceda5286e44
- https://gitcode.com/openeuler/lerobot_ros2/pulls/49#comment-77b06b16d266071507367d38db7abc7eeb687c68

### 样例 3: PR #34 - 多语言代码审查（Python + C++ + Markdown）

**PR**: https://gitcode.com/openeuler/ledog_ros2/pull/34

**项目**: openeuler/ledog_ros2 - ROS2 硬件接口包

**发现的问题** (8 条):

| 文件 | 行号 | 问题类型 | 严重性 | 语言 |
|------|------|----------|--------|------|
| `calibration_service.py` | 33 | logic_error | error | Python |
| `so101_system_hardware.cpp` | 1721 | error_handling | warning | C++ |
| `so101_system_hardware.cpp` | 1850 | deprecated_api | warning | C++ |
| `so101_system_hardware.cpp` | 1864 | error_handling | warning | C++ |
| `so101_system_hardware.hpp` | 1467 | code_style | warning | C++ |
| `README.md` | 97 | missing_license | warning | Markdown |
| `package.xml` | 5 | invalid_spdx | warning | XML |
| `README.en.md` | 763 | hardcoded_path | info | Markdown |

**问题摘要**:
1. **Python 逻辑错误**: 创建了 UnifiedCalibrator 但未调用校准方法 (严重)
2. **C++ JSON 解析**: 缺少异常处理，可能导致崩溃
3. **C++ 弃用 API**: 使用已弃用的 usleep() 而非 std::this_thread::sleep_for
4. **C++ 错误处理**: ReadPos 失败时未返回错误状态
5. **C++ 头文件**: 使用相对路径包含，不符合最佳实践
6. **文档**: 缺少许可证声明 (TODO)
7. **配置**: package.xml 许可证字段无效
8. **文档**: 硬编码个人路径

**亮点**:
- ✅ 发现跨语言问题（Python + C++）
- ✅ 覆盖多种问题类型（逻辑错误、错误处理、API 弃用、代码风格、文档）
- ✅ 提供 C++ 现代化建议（usleep → sleep_for）
- ✅ 识别许可证和法律相关问题
- ✅ 包含修复代码和详细解释

## JSON 文件格式

创建 `issues.json` 文件：

```json
[
  {
    "file": "examples/lekiwi/evaluate_dataset.py",
    "line": 1,
    "type": "syntax_error",
    "severity": "error",
    "confidence": 95,
    "title": "Shebang 格式错误",
    "description": "Shebang 缺少 ! 符号，导致脚本无法直接执行",
    "contextCode": "# !/usr/bin/env python\n# 应改为:\n#!/usr/bin/env python",
    "fix": {
      "code": "#!/usr/bin/env python",
      "explanation": "修复 shebang 格式，确保 # 和 ! 之间没有空格"
    },
    "needsValidation": false
  }
]
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 文件路径（相对于仓库根目录） |
| line | number | 是 | 问题行号（在新文件中的行号） |
| type | string | 是 | 问题类型：syntax_error, bug, security, logic_error, api_misuse |
| severity | string | 是 | 严重程度：error, warning |
| confidence | number | 是 | 置信度 0-100，只报告 >= 80 |
| title | string | 是 | 问题标题 |
| description | string | 是 | 详细描述 |
| contextCode | string | 是 | 上下文代码 |
| fix | object | 是 | 修复方案（code + explanation） |
| needsValidation | boolean | 否 | 是否需要二次验证 |

## 目录结构

```
skills/gitcode-code-review/
├── SKILL.md                    # Skill 主文档（Claude Code 读取）
├── README.md                   # 本文件（用户参考）
├── CHANGELOG.md                # 更新日志
├── agents/                     # 代理定义目录
│   ├── pre-check.md            # 前置检查代理
│   ├── bug-scanner-diff.md     # Bug 扫描代理
│   ├── bug-scanner-diff-2.md   # Bug 扫描代理（冗余）
│   ├── code-analyzer.md        # 代码问题分析代理
│   ├── semantic-analyzer.md    # 语义深度分析代理
│   ├── python-classmethod-checker.md  # Python @classmethod 检查代理
│   └── issue-validator.md      # 问题验证代理
├── lib/                        # 工具库
│   ├── gitcode-api.js          # GitCode API 封装
│   ├── comment-formatter.js    # 评论格式化器
│   ├── agent-runner.js         # 代理运行器
│   └── variable-tracker.js     # 变量追踪工具（防误报）
└── scripts/                    # 脚本
    └── gitcode-reviewer.js     # 主审查脚本
```

## 审查规则

### 高信度问题标准

只报告满足以下条件的问题：

1. **编译/解析错误** - 语法错误、类型错误、缺少导入
2. **明确的逻辑错误** - 无论如何输入都会产生错误结果
3. **安全问题** - SQL 注入、XSS、硬编码敏感信息
4. **明显的 API 误用** - 不符合标准用法
5. **严重的错误处理问题** - 空 catch 块、吞掉异常

### 不报告的情况

- 代码风格问题
- linter 可捕获的问题
- 预先存在的问题
- 可能不是问题的地方（不确定时不报告）
- 需要额外上下文才能判断的问题

## 输出示例

### 控制台输出

```
============================================================
🔍 GitCode PR 审查工具
============================================================
审查 PR #46

Step 1: 前置检查...
  ✅ 通过前置检查

Step 2: 收集上下文...
  ✅ 4 个文件, 0 个 CLAUDE.md

...

============================================================
✅ 成功发布 1/1 条评论
============================================================

📋 审查意见链接:
   PR 页面: https://gitcode.com/openeuler/lerobot_ros2/pull/46

   行内评论:
   - examples/lekiwi/evaluate_dataset.py:1 → https://gitcode.com/.../pull/46#comment-xxx
```

### 行内评论格式

```markdown
❌ **Shebang 格式错误**

Shebang 缺少 ! 符号，导致脚本无法直接执行。正确的格式应该是 `#!/usr/bin/env python`。

**上下文代码**:
```
# !/usr/bin/env python
```

**修复方案**:
```
#!/usr/bin/env python
```

修复 shebang 格式，确保 # 和 ! 之间没有空格

---
🤖 generated by ai@claude
```

## 参考资料

- [SKILL.md](SKILL.md) - 完整 Skill 文档
- [GitCode API 文档](https://docs.gitcode.com/docs/apis/)
- [官方 code-review 插件](https://github.com/anthropics/claude-code/tree/main/plugins/code-review)

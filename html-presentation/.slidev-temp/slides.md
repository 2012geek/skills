---
theme: seriph
highlighter: shiki
lineNumbers: true
drawings:
  persist: true
editor: false
transition: slide
title: Presentation
mdc: true
download: true
info: true
canCopy: true
transitionSlide: true
mouseWheel: true
fonts:
  sans: ["Microsoft YaHei", "微软雅黑", "sans-serif"]
  serif: ["Microsoft YaHei", "微软雅黑", "sans-serif"]
  mono: ["Consolas", "Monaco", "Courier New", "monospace"]
---

---
theme: seriph
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
editor: false
transition: none
download: false
info: false
canCopy: true
transitionSlide: false
mouseWheel: true
recording:
  enabled: false
  video: false
  audio: false
class: text-left
---

layout: center
class: text-center

# Claude Code 实战案例集

> **从编程语言到自然语言** - Claude Code 在实际项目中的应用记录

**文档信息**
- **版本**：v2.0 <!-- v-click -->
- **创建日期**：2026-01-27 <!-- v-click -->
- **最后更新**：2026-01-29 <!-- v-click -->
- **作者**：陈乐宁 <!-- v-click -->
---

## 📑 快速导航

### 实战案例概览

| 案例 | 业务场景 | 核心工具 | Skill 路径 |
|------|----------|----------|-----------|
| [🔍 案例1：代码检视](#案例1代码检视-skill) | 自动审查 PR 代码质量 | code-review agent + Hooks | [gitcode-code-review](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-code-review) |
| [🚀 案例2：自动提 PR](#案例2自动提-pr-skill) | 自动生成 PR 描述和测试用例 | Templates + Agents | [gitcode-pr](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-pr) |
| [🔧 案例3：门禁自动修复](#案例3门禁问题自动修复-skill) | CI/CD 门禁失败自动修复 | Page Analysis + Retry | [gitcode-ci-repair](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-ci-repair) |
| [✅ 案例4：UT 自动添加](#案例4ut-自动添加) | 自动生成单元测试 | API Analysis + Mock Generation | - |
| [🏗️ 案例5：AI 功能开发](#案例5ai-代码功能开发) | 重构视频转换代码 | Refactoring + Debugging | - |
---
layout: two-cols
---

## 

<div style="font-size: 0.9em; line-height: 1.2;">

- 📝 直接编辑文件（不是建议代码） <!-- v-click -->

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

- 🧠 理解整个代码库 <!-- v-click -->
- ⚡ 执行命令（测试、构建、Git 操作） <!-- v-click -->
- 🎯 自主规划（Plan Mode） <!-- v-click -->

</div>

</template>
---

## 🎯 实战案例
---
layout: two-cols
---

## 

<div style="font-size: 0.9em; line-height: 1.2;">

- **业务场景**：开发团队需要人工审查每个 PR，耗时耗力 <!-- v-click -->

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

- **痛点**： <!-- v-click -->
  - 人工审查容易遗漏细节 <!-- v-click -->
  - 审查标准不一致 <!-- v-click -->
  - 重复性工作多 <!-- v-click -->

</div>

</template>
---

**❌ 误报案例 - shape 未定义**

[PR #46 - 误报问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46/diffs?file=src%252Ftool%252Ftransfer_model%252Fexport_model.py&version=7&expired=false)

**问题现象**：
<img src="https://github.com/user-attachments/assets/df287dc9-87df-4d83-ad4f-39a9ef2e980e" width="800"/>

**根因定位**：
Git 只获取了部分修改代码，导致上下文缺失
<img src="https://github.com/user-attachments/assets/c3aa1161-246c-4443-b145-83ca041d92bf" width="800"/>

**解决方案**：
添加误报机制
<img src="https://github.com/user-attachments/assets/a4797cbe-b446-4644-abb4-195b193f290f" width="800"/>
---

## **❌ 漏报案例 - classmethod 问题**
<div style="font-size: 0.85em;">

[PR #51 - 未发现的问题](https://gitcode.com/openeuler/lerobot_ros2/pull/51)

**问题代码**：
```python
class ACTPolicy(PreTrainedPolicy):
    def __init__(self, config: ACTConfig):
        super().__init__(config)

    @classmethod
    def is_next_pred_need_obs(cls) -> bool:
        # ❌ 问题：使用 cls._action_queue 但实例方法中没有定义
        return len(cls._action_queue) == 0 if hasattr(cls, "_action_queue") else True
```

<img src="https://github.com/user-attachments/assets/684b95f9-6926-400c-83aa-86f959a064d3" width="400"/>

**解决方案**：
添加专门的 agent 检查类方法问题
<img src="https://github.com/user-attachments/assets/edbfd903-2250-4521-850d-c1150e9a09ff" width="800"/>

#### 🏗️ 系统架构

<img src="https://github.com/user-attachments/assets/57bb395a-f768-422d-a26b-abd1e83ab9fc" width="1000"/>

#### ⚠️ 调试过程中的坑

**坑1：规格描述导致隐形脚本**

❌ **错误做法**：
```
"检查函数不超过50行"
```

结果生成了 50+ 行的 AST 检测脚本：
```python
import ast

def check_function_length(file_path, max_lines=50):
    # ... 50+ 行代码
```

✅ **正确做法**：
```
"使用 LLM 进行语义分析，识别潜在的代码问题"
```

#### ✅ 最佳实践

> 💡 **核心建议**
> - 使用 **LLM 语义分析**，避免规格性描述（如"函数不超过50行"）
> - 让 Claude 先给出方案（调研模式），避免从零开始写 Skill
> - 集成官方 agents，再添加自定义模式

> ⚠️ **常见误区**
> - 不要使用"检查函数不超过50行"这种规格性描述
> - 样例代码要明确标注"这是样例"，否则会被当成答案

</div>
---

### 案例2：自动提 PR Skill

**📦 对应 Skill**：[gitcode-pr](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-pr)

#### 🎯 问题背景
- **业务场景**：开发者提交代码后需要手动写 PR 描述和测试用例 <!-- v-click -->
- **痛点**： <!-- v-click -->
  - PR 描述格式不统一 <!-- v-click -->
  - 测试用例编写繁琐 <!-- v-click -->
  - 重复性工作多 <!-- v-click -->
---

#### 💡 解决方案
使用 LLM 自动总结修改内容，按照固定模板生成 PR 描述和测试用例
---

#### 📊 实测效果

**成功案例**：
[PR #50 - 自动生成](https://gitcode.com/openeuler/lerobot_ros2/pull/50)

<img src="https://github.com/user-attachments/assets/50b68745-5523-4eec-8469-365d0c084046" width="800"/>
<img src="https://github.com/user-attachments/assets/dc0e88d0-565e-42ec-a424-194ac19a711f" width="800"/>
<img src="https://github.com/user-attachments/assets/cc57bc87-7caa-4d6e-bce8-c6441e8c6cde" width="800"/>

**特点**：
- 自动分析代码变更 <!-- v-click -->
- 生成结构化的 PR 描述 <!-- v-click -->
- 自动创建测试用例模板 <!-- v-click -->
---

#### 🏗️ 系统架构

<img src="https://github.com/user-attachments/assets/b001a433-df0e-4a8c-9ce7-380078ab86b7" width="1000"/>
---

#### ⚠️ 调试过程中的坑

**坑1：样例当成答案**

调试测试用例时，没有明确告诉 Claude 不要调整 PR 描述，结果把 PR 描述改坏了

```markdown
❌ 错误指令：
"参考以下样例生成测试用例：[样例内容]"

✅ 正确指令：
"参考以下样例生成测试用例模板（不要修改PR描述）：[样例内容]"
```
---

#### ✅ 最佳实践

> 💡 **核心建议**
> - 模板要足够详细，否则每次生成结果不一致
> - 明确标注样例，避免被当成答案

> ⚠️ **常见误区**
> - 给样例时必须明确"这是样例，参考格式"
> - 调试一部分时，要锁定其他部分
---
layout: two-cols
---

## 

<div style="font-size: 0.9em; line-height: 1.2;">

- **业务场景**：CI/CD 门禁失败后需要手动修复代码 <!-- v-click -->

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

- **痛点**： <!-- v-click -->
  - 手动修复耗时长 <!-- v-click -->
  - 需要反复提交验证 <!-- v-click -->
  - 影响开发效率 <!-- v-click -->

</div>

</template>
---
layout: two-cols
---

## 

- **业务场景**：开发新功能后需要编写单元测试 <!-- v-click -->
- **痛点**： <!-- v-click -->
  - 测试用例编写繁琐 <!-- v-click -->

<template v-slot:right>

  - 需要构造各种测试数据 <!-- v-click -->
  - Mock 复杂依赖 <!-- v-click -->

</template>
---
layout: two-cols
---

## 

<div style="font-size: 0.9em; line-height: 1.2;">

- **业务场景**：重构视频转换代码 <!-- v-click -->

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

- **需求**： <!-- v-click -->
  - 优化 GPU/CPU 切换逻辑 <!-- v-click -->
  - 统一代码架构 <!-- v-click -->
  - 注释英文化 <!-- v-click -->
   - 优化前：CPU 版本和 GPU 版本分别修改代码 <!-- v-click -->
   - 优化后：自动回退到 CPU，可靠性增强 <!-- v-click -->
   - 统一代码注释风格 <!-- v-click -->
   - 优化前：使用目录中 `images` 变量隐藏判断 <!-- v-click -->
   - 优化后：增加 `backend=image` 参数，符合框架规范 <!-- v-click -->

</div>

</template>
---

## 🎓 实战总结

### 工具对比

| 维度 | CLI 版本 | VSCode 扩展 |
|------|----------|-------------|
| **速度** | 🚀 更快 | 🐢 较慢 |
| **图片支持** | ❌ | ✅ |
| **推荐场景** | 熟练开发者 | 新手/可视化需求 |

### 调试技巧汇总

#### 🎯 通用调试方法

```bash
# 1. 打印调试信息
"把每一步的调试信息打印出来"

# 2. 逐步定位
"一步一步定位问题，从简单到复杂"

# 3. 对比分析
"重构前用例好的，重构后用例坏的，对比每一行代码"
```

#### ⚠️ 常见陷阱

| 陷阱 | 症状 | 解决方案 |
|------|------|----------|
| **API 失败** | 说 API 不可用 | 多问一句"是否有其他方式？" |
| **钻牛角尖** | 反复尝试不成功 | 人工介入，给出明确提示 |
| **偷懒** | 简化实现 | 主动引导，明确要求 |
| **规格描述** | 生成检测脚本 | 改用 LLM 语义分析 |

#### 💡 核心原则

> **最重要的事**
>
> 💡 **不要仅依靠自己的现有知识**，多给 Claude 讲清楚需求，让 Claude 来负责设计方案。
>
> **原因**：Claude 拥有更全面的知识库和更强的分析能力，过度限制反而会降低效果
>
> **示例**：
> - ❌ 错误："写一个函数来检测代码质量"
> - ✅ 正确："这个项目需要自动审查 PR 代码质量，我发现的问题有 X、Y、Z，请设计一个完整的解决方案"
---
layout: two-cols
---

## 

- [案例1：代码检视](#案例1代码检视-skill)中误报 `shape` 变量未定义 <!-- v-click -->
- 漏报 `classmethod` 中的潜在问题 <!-- v-click -->

<template v-slot:right>

- 报出代码中不存在的变量名或函数调用 <!-- v-click -->

</template>
---

#### ⚠️ 上下文约束

**问题描述**：
LLM 模型有最大上下文长度限制（如 Claude 200K tokens），超出限制会导致 API 报错。

**实际案例**：
```
API Error: 400 {"type":"error","error":{"message":"Invalid API parameter, please check the documentation. Request 186773 input tokens exceeds the model's maximum context length 202750","code":"1210"},"request_id":"202601281529202c77e5b03eed4ee9"}
```

**解决方案**：
- **分批次处理**：将大项目拆分为多个小模块分别分析 <!-- v-click -->
- **使用摘要/压缩**：先对代码库生成摘要，再基于摘要进行分析 <!-- v-click -->
- **优先级排序**：优先分析核心模块，再逐步扩展 <!-- v-click -->
- **利用长上下文模型**：使用支持 200K tokens 的 Claude 模型 <!-- v-click -->
- **增量分析**：仅分析变更的部分，而非整个代码库 <!-- v-click -->

> 💡 **最佳实践**
> - 在 skill 中实现智能分块逻辑
> - 使用 Git diff 仅分析变更的文件
> - 对于大型项目，建议先生成架构文档再分析
---
layout: two-cols
---

## 

- 调试过程中使用 `git push -f`，删除了分支的所有代码和历史记录 <!-- v-click -->
- 幸运的是通过 Claude 的帮助找回了代码 <!-- v-click -->
- 缺少对危险命令的验证机制 <!-- v-click -->

<template v-slot:right>

- 没有 Human-in-the-Loop 检查点 <!-- v-click -->
   - 是否真的需要执行此命令？ <!-- v-click -->
   - 是否已备份重要数据？ <!-- v-click -->

</template>
---
layout: two-cols
---

## 

<div style="font-size: 0.9em; line-height: 1.2;">

   - 安全优先，特别是 `rm` 等破坏性命令 <!-- v-click -->
   - 保持人工审核 <!-- v-click -->
   - 从编程语言到自然语言的演进 <!-- v-click -->
   - 降低编程门槛 <!-- v-click -->
   - 当前仍需编程基础 <!-- v-click -->
   - 需要引导模型定位问题 <!-- v-click -->
- [x] **明确指令**：使用命令式沟通（`git submit`） <!-- v-click -->

</div>

<template v-slot:right>

<div style="font-size: 0.9em; line-height: 1.2;">

- [x] **小步快跑**：一次处理一个任务 <!-- v-click -->
- [x] **常用命令**：`git`/`rm` 等准确且高效 <!-- v-click -->
- [x] **Worktree**：多任务并行时避免干扰 <!-- v-click -->
- [x] **Plan Mode**：探索代码库再设计方案 <!-- v-click -->
- [ ] 不要使用规格性描述（如"函数不超过50行"） <!-- v-click -->
- [ ] 不要一次性干很多事 <!-- v-click -->
- [ ] 不要让 Claude 钻牛角尖 <!-- v-click -->
- [ ] 不要忘记标注样例 <!-- v-click -->

</div>

</template>
---
layout: two-cols
---

## 

- **[Claude Code 官方文档](https://code.claude.com/docs/en/overview)** - 完整文档 <!-- v-click -->
- **[VS Code 扩展文档](https://code.claude.com/docs/en/vs-code)** - 集成指南 <!-- v-click -->
- **[Claude Code 最佳实践](https://www.anthropic.com/engineering/claude-code-best-practices)** - 官方建议 <!-- v-click -->
- **[anthropics/skills GitHub](https://github.com/anthropics/skills)** - 官方示例 <!-- v-click -->
- **[Agent Skills 工程博客](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)** - 设计理念 <!-- v-click -->
- **[Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)** - 构建自定义代理 <!-- v-click -->

<template v-slot:right>

- **[Claude Agent Skills 深度剖析](https://leehanchung.github.io/blogs/2025/10/26/claude-skills-deep-dive/)** - 第一性原理分析 <!-- v-click -->
- **[Claude Code 技术参考手册](https://blakecrosley.com/guide/claude-code)** - 完整技术参考 <!-- v-click -->
- **[Claude Code 定制指南](https://alexop.dev/posts/claude-code-customization-guide-claudemd-skills-subagents/)** - 配置详解 <!-- v-click -->
- **[Claude Code 提示词库（2026）](https://www.aipromptlibrary.app/blog/claude-code-prompt-library)** - 40+ 提示模板 <!-- v-click -->
- **[CLI 速查表](https://shipyard.build/blog/claude-code-cheat-sheet/)** - 命令快速参考 <!-- v-click -->

</template>
---

## 🎯 快速开始

### 选择合适的版本

```bash
# 新手或偏好可视化
→ 使用 VSCode 扩展

# 熟练开发者或需要完整功能
→ 使用 CLI 版本

# 需要图片输入
→ 必须使用 VSCode 扩展

# 自动化脚本
→ 使用 CLI 版本
```

### Skills 开发建议

- **从小处着手**：先实现简单功能 <!-- v-click -->
- **充分测试**：在不同场景验证 <!-- v-click -->
- **明确边界**：清晰定义职责范围 <!-- v-click -->
- **复用优先**：查看官方仓库避免重复 <!-- v-click -->
- **渐进式开发**：使用 Plan Mode 探索代码库 <!-- v-click -->
---

**反馈渠道**：如有问题或建议，欢迎提 Issue 或 PR

**版本历史**：
- v2.0 (2026-01-29): 案例驱动重构，突出实战经验 <!-- v-click -->
- v1.0 (2026-01-27): 初始版本 <!-- v-click -->

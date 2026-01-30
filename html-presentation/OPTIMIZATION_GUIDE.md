# HTML Presentation Skill - LLM 优化方案

## 📋 方案概述

使用 LLM（大语言模型）优化 Markdown 内容，使生成的演示文稿更美观、更专业、更易理解。

## 🎯 优化目标

1. **内容更精炼**：提取核心要点，删除冗余
2. **标题更吸引**：简洁有力，突出重点
3. **视觉更丰富**：合理使用图表、图片、代码高亮
4. **代码更清晰**：添加注释、高亮关键行、分步展示

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    optimizer.js (主控制器)                   │
└─────────────────────────────────────────────────────────────┘
    │
    ├── PresentationOptimizer (内容优化器)
    │   ├── Content Analyzer Agent (内容分析)
    │   ├── Content Optimizer Agent (内容优化)
    │   └── Visual Enhancer Agent (视觉增强)
    │
    ├── CodeBlockOptimizer (代码优化器)
    │   ├── 添加代码注释
    │   ├── 建议高亮行
    │   └── 分步展示
    │
    └── VisualEnhancer (视觉增强器)
        ├── 生成 Mermaid 图表
        ├── 推荐表格布局
        └── 建议配色方案
```

## 📁 新增文件

```
html-presentation/
├── agents/
│   ├── content-analyzer.md       ✨ NEW
│   ├── content-optimizer.md      ✨ NEW
│   └── code-processor.md         ✨ NEW
│
├── scripts/
│   ├── optimizer.js              ✨ NEW
│   └── build.js                  ⚡ MODIFY
│
├── prompts/
│   ├── content-analysis.txt      ✨ NEW
│   ├── content-optimization.txt  ✨ NEW
│   └── code-processing.txt       ✨ NEW
│
└── lib/
    ├── llm-optimizer.js          ✨ NEW
    ├── code-enhancer.js          ✨ NEW
    └── markdown-utils.js         ✨ NEW
```

## 🔄 优化流程

### Phase 1: 内容分析
```javascript
// 1. 读取原始 Markdown
const content = fs.readFileSync('input.md', 'utf-8');

// 2. 分析内容结构
const analysis = await ContentAnalyzer.analyze(content);

// 输出:
{
  "structure": [
    { "title": "Claude Code 概述", "type": "概念介绍", "importance": "high" }
  ],
  "codeBlocks": [
    { "language": "python", "location": "示例1", "needsExplanation": true }
  ]
}
```

### Phase 2: 内容优化
```javascript
// 3. 优化每张幻灯片
const optimized = await ContentOptimizer.optimize(content, analysis);

// 优化示例:
// 原: "Claude Code 和 Skills 系统的概念介绍和使用方法详解"
// 优: "Claude Code & Skills 系统"

// 原: 长段落描述...
// 优:
// - 核心功能 1
// - 核心功能 2
// - 核心功能 3
```

### Phase 3: 代码处理
```javascript
// 4. 处理代码块
for (const codeBlock of analysis.codeBlocks) {
  const optimized = await CodeBlockOptimizer.optimize(codeBlock);

  // 添加注释
  // 建议高亮行
  // 生成分步展示
}
```

### Phase 4: 视觉增强
```javascript
// 5. 生成视觉元素
const visuals = VisualEnhancer.suggestVisualizations(content, analysis);

// 示例输出:
// - 在"工作原理"章节添加 Mermaid 流程图
// - 在"特性对比"章节使用表格
// - 在"架构说明"章节添加架构图
```

## 💡 具体优化示例

### 示例 1: 标题优化

**优化前**:
```markdown
## Claude Code 和 Skills 系统的完整使用指南和最佳实践
```

**优化后**:
```markdown
## Claude Code & Skills 实战指南
```

### 示例 2: 内容提炼

**优化前**:
```markdown
Claude Code 是一个功能强大的 AI 编程助手，它可以帮助开发者完成各种编程任务，包括代码编写、调试、重构等。它支持多种编程语言，并且能够理解整个项目的上下文。
```

**优化后**:
```markdown
### Claude Code 的核心能力

- 🤖 **AI 辅助编程**：代码生成、重构、优化
- 📂 **项目级理解**：全库上下文分析
- 🔍 **智能调试**：快速定位问题
- 🌐 **多语言支持**：Python/JS/Go/等
```

### 示例 3: 代码优化

**优化前**:
````python
def process_data(data):
    result = []
    for item in data:
        if item.valid:
            processed = item.transform()
            result.append(processed)
    return result
`````

**优化后**:
```python
# 数据处理：过滤并转换有效数据
def process_data(data):
    """处理数据列表，返回转换后的有效数据"""
    result = []
    for item in data:           # ← 遍历数据
        if item.valid:           # ← 验证数据
            processed = item.transform()
            result.append(processed)
    return result                # ← 返回结果
```

### 示例 4: 可视化建议

**原始内容**:
```markdown
## 工作流程

1. 用户输入命令
2. Claude 分析需求
3. 执行任务
4. 返回结果
```

**优化建议**:
```markdown
## 工作流程

```mermaid
flowchart LR
    A[用户输入] --> B[Claude 分析]
    B --> C[执行任务]
    C --> D[返回结果]
```
```

## 🚀 实现步骤

### Step 1: 创建基础结构
```bash
# 已完成 ✅
- 创建 prompts/ 目录
- 创建 3 个 prompt 模板
- 创建 3 个 agent 定义
- 创建 optimizer.js 框架
```

### Step 2: 实现 LLM 调用
```javascript
// lib/llm-optimizer.js

class LLMOptimizer {
  async callLLM(prompt) {
    // 集成 Claude Code 的 LLM 能力
    // 使用 @anthropic-ai SDK
    // 返回结构化结果
  }
}
```

### Step 3: 集成到 build.js
```javascript
// scripts/build.js

async function build(inputPath, outputPath, config = {}) {
  // 新增：优化步骤
  if (config.optimize !== false) {
    const { optimizePresentation } = require('./optimizer');
    content = await optimizePresentation(inputPath);
  }

  // 继续原有流程...
}
```

### Step 4: 添加配置选项
```bash
# 使用优化
node build.js input.md --optimize

# 指定优化级别
node build.js input.md --optimize --level full

# 只显示建议
node build.js input.md --optimize --dry-run
```

## 📊 预期效果

### 内容质量提升
- ✅ 标题更简洁
- ✅ 要点更突出
- ✅ 结构更清晰

### 视觉效果提升
- ✅ 适当使用图表
- ✅ 代码高亮清晰
- ✅ 布局更合理

### 开发效率提升
- ✅ 自动化内容优化
- ✅ 代码自动注释
- ✅ 可视化建议

## 🎨 配色建议

```javascript
// 根据内容类型推荐配色方案

const colorSchemes = {
  技术: {
    primary: '#2196F3',    // 蓝色
    accent: '#FF9800',     // 橙色
    background: '#1E1E1E'  // 深色
  },
  产品: {
    primary: '#4CAF50',    // 绿色
    accent: '#9C27B0',     // 紫色
    background: '#FAFAFA'  // 浅色
  },
  学术: {
    primary: '#607D8B',    // 蓝灰色
    accent: '#E91E63',     // 粉色
    background: '#FFFFFF'  // 白色
  }
};
```

## 📝 下一步行动

### Phase 1: 已完成 ✅

1. ✅ **创建 lib/llm-optimizer.js** - 实现 LLM 调用
2. ✅ **创建 lib/code-enhancer.js** - 代码增强工具
3. ✅ **创建 lib/markdown-utils.js** - Markdown 解析工具
4. ✅ **完善 optimizer.js** - 实现完整的优化流程
5. ✅ **添加 npm scripts** - 便捷命令

### Phase 2: 已完成 ✅

1. ✅ **修改 build.js** - 集成优化步骤
2. ✅ **添加 --optimize flag** - 构建时启用优化
3. ✅ **添加 --optimize-level flag** - 支持 basic/full 模式
4. ✅ **添加便捷 npm scripts** - build:opt, dev:opt 等
5. ✅ **测试优化效果** - 使用实际文档测试

### Phase 3: 已完成 ✅

1. ✅ **实现缓存机制** - 文件持久化缓存
2. ✅ **增量优化** - 基于哈希的变更检测
3. ✅ **效果评估** - 指标收集和报告

## 🚀 使用方法

### 1. 基础优化（无需 API Key）

```bash
# 开发模式 + 基础优化
npm run dev:opt -- slides.md

# 构建静态 HTML + 基础优化
npm run build:opt -- slides.md output.html --mode build
```

### 2. 完整优化（需要 API Key）

```bash
# 设置 API Key
export ANTHROPIC_API_KEY="your-key-here"

# 开发模式 + LLM 优化
npm run dev:opt:full -- slides.md

# 构建静态 HTML + LLM 优化
npm run build:opt:full -- slides.md output.html --mode build
```

### 3. 缓存和增量优化

```bash
# 增量优化（自动检测文件变更）
node scripts/optimizer.js slides.md

# 强制重新优化
node scripts/optimizer.js slides.md --force

# 查看缓存统计
node scripts/optimizer.js slides.md --cache-stats

# 清理过期缓存
node scripts/optimizer.js slides.md --cache-clean
```

### 4. 指标报告

优化完成后自动显示：
- **性能指标**：平均优化时间
- **缓存统计**：命中率、条目数
- **内容指标**：处理/优化的幻灯片数、代码块数
- **错误信息**：优化过程中的错误列表

## 📊 Phase 3 新增功能

### 持久化缓存
- 自动缓存 LLM 调用结果（7天有效期）
- 显著减少 API 调用成本
- 支持手动清理过期缓存

### 增量优化
- 基于文件内容哈希的变更检测
- 自动跳过未更改的文件
- 支持强制重新优化 (`--force`)

### 指标收集
- 实时性能监控
- 缓存命中率统计
- 内容处理量化指标
- 错误追踪和报告

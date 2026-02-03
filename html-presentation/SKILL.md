---
name: html-presentation
description: >
  Slidev 演示文稿生成工具 v4.0。使用 Markdown 编写，生成基于 Slidev 的交互式演示文稿。
  支持自动动画、片段过渡、演讲者备注、代码行号、鼠标滚轮翻页、中文显示优化。
  适用于：技术分享、产品介绍、教学演示、会议报告。
license: MIT
version: 4.0.0
---

# Slidev Presentation Skill v4.0

## 概述

本 skill 用于将 Markdown 转换为交互式 HTML 演示文稿，基于 Slidev 框架。

### 核心功能

- **📝 Markdown 编写** - 简单直观的语法
- **🚀 Dev 模式** - 实时预览，完整工具栏
- **🎨 多主题** - seriph, default, apple-basic, github 等
- **💻 代码高亮** - Shiki 语法高亮
- **📝 演讲者备注** - Note: 语法支持
- **🔢 代码行号** - 可选显示
- **🖱️ 鼠标滚轮** - 滚轮翻页支持
- **📐 内容滚动** - 长内容自动滚动
- **🎯 Vue 组件** - 完整 Vue.js 支持
- **📊 Mermaid 图表** - 内置支持
- **🧮 LaTeX 公式** - 内置支持
- **🤖 LLM 优化** - 可选内容优化

### Dev 模式特性

- **✅ 绘图/标注工具** (按 'd')
- **✅ 演讲者视图** (按 'p')
- **✅ 幻灯片概览** (按 'o')
- **✅ 全屏模式** (按 'f')
- **✅ 摄像头** (按 'c')
- **✅ 演讲者备注** (按 's')
- **✅ 实时重载** - 文件更改自动刷新
- **✅ 内容滚动** - 长幻灯片滚动支持

### Build 模式特性

- **✅ 静态 HTML 文件** - 易于部署
- **✅ PDF 导出** - 支持导出为 PDF
- **✅ 内容滚动** - 长内容滚动支持
- **❌ 工具栏受限** - 无绘图功能

## 工作流程

```
1. 编写 Markdown (slides.md)
   ↓
2. 运行构建脚本 (build.js)
   ↓
3. Dev 模式: 启动实时预览服务器
   Build 模式: 生成静态 HTML
```

## 使用方法

### Dev 模式（默认）

```bash
# 启动开发服务器（默认端口 3030）
node skills/html-presentation/scripts/build.js slides.md

# 自定义端口
node skills/html-presentation/scripts/build.js slides.md --port 8080

# 启用内容优化（基础级别）
node skills/html-presentation/scripts/build.js slides.md --optimize

# 启用 LLM 内容优化（需要 API key）
node skills/html-presentation/scripts/build.js slides.md --optimize --optimize-level full
```

### Build 模式

```bash
# 构建静态 HTML
node skills/html-presentation/scripts/build.js slides.md output.html --mode build

# 自定义主题
node skills/html-presentation/scripts/build.js slides.md output.html --theme seriph

# 禁用代码行号
node skills/html-presentation/scripts/build.js slides.md output.html --no-line-numbers
```

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--mode` | dev | dev 或 build |
| `--theme` | seriph | Slidev 主题 |
| `--title` | Presentation | 演示文稿标题 |
| `--no-line-numbers` | false | 禁用代码行号 |
| `--port` | 3030 | Dev 服务器端口 |
| `--host` | 0.0.0.0 | Dev 服务器主机 |
| `--optimize` | false | 启用内容优化 |
| `--optimize-level` | basic | basic 或 full |

### 可用主题

- `default` - 默认主题
- `seriph` - Serif 主题（默认）
- `apple-basic` - Apple 风格
- `cb` - CB 主题
- `github` - GitHub 风格
- `shibainu` - 柴犬主题
- `simula` - Simula 主题
- `dracula` - Dracula 主题

## Markdown 语法

### 基础语法

```markdown
# 幻灯片标题 1

内容...

---

# 幻灯片标题 2

- 列表项 1
- 列表项 2
```

### 演讲者备注

```markdown
# 演讲标题

演讲内容...

Note: 这是给演讲者看的备注，按 S 键查看。
```

### 代码块（自动高亮）

````markdown
```javascript
function hello() {
  console.log('Hello, World!');
}
```
````

### 双栏布局

```markdown
<div class="container">

<div class="column">

**左侧**

- 要点 1
- 要点 2

</div>

<div class="column">

**右侧**

- 要点 A
- 要点 B

</div>

</div>
```

## 快捷键

| 按键 | 功能 |
|------|------|
| `→` `Space` `Scroll Down` | 下一张 |
| `←` `Scroll Up` | 上一张 |
| `↓` `↑` | 垂直导航 |
| `F` | 全屏模式 |
| `O` | 幻灯片概览 |
| `S` | 演讲者视图（含备注） |
| `D` | 绘图模式 |
| `P` | 演讲者视图 |
| `C` | 摄像头 |
| `ESC` | 退出概览 |

## 优化级别

### Basic（默认 --optimize）

- ✅ 代码语法高亮
- ✅ 自动行高亮（函数、返回值、控制流）
- ✅ 代码复杂度分析
- ✅ 无需 API key
- ❌ 无内容重组

### Full（--optimize-level full）

- ✅ 所有基础功能
- ✅ LLM 驱动的内容优化
- ✅ 标题简化
- ✅ 关键点提取
- ✅ 视觉元素建议
- ⚠️ 需要 ANTHROPIC_API_KEY

## 技术实现

### Slidev 配置

```javascript
{
  theme: 'seriph',
  highlighter: 'shiki',
  lineNumbers: true,
  drawings: { persist: true },
  transition: 'slide',
  mouseWheel: true
}
```

### 字体优化

```css
/* 微软雅黑 Black Bold */
* {
  font-family: "Microsoft YaHei", "微软雅黑", sans-serif !important;
  font-weight: 900 !important;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 900 !important;
  text-align: left !important;
}
```

## 目录结构

```
skills/html-presentation/
├── SKILL.md              # 本文档
├── README.md             # 用户文档
├── package.json          # 依赖配置
├── scripts/
│   ├── build.js          # 主构建脚本 v4.0
│   ├── build-slidev.js   # Slidev 构建器
│   ├── slidev-generator.js  # Slidev Markdown 生成器
│   ├── optimizer.js      # 内容优化器
│   └── serve.js         # 开发服务器
├── lib/                  # 工具库
│   ├── slide-optimizer.js
│   ├── llm-optimizer.js
│   ├── code-enhancer.js
│   └── cache.js
└── components/           # Vue 组件
```

## 依赖项

- **@slidev/cli** ^52.11.5 - Slidev 框架
- **marked** ^11.2.0 - Markdown 解析器
- **js-yaml** ^4.1.0 - YAML 解析器

## 更新日志

### v4.0.0 (2025-02-03)

**Breaking Changes:**
- ❌ 移除 Reveal.js 支持
- ❌ 移除 PPTX 导出功能
- ❌ 移除 --framework 选项
- ❌ 移除 --no-sidebar、--no-export、--no-auto-animate 选项

**改进:**
- ✅ 简化为 Slidev-only
- ✅ 统一 Dev 模式为默认
- ✅ 更新文档为 Slidev-only

### v3.1.0 (2025-01-27)

- ✅ 新增 slidev-generator.js
- ✅ 智能幻灯片分片
- ✅ 自动 frontmatter 生成
- ✅ 代码块保护

### v3.0.0 (2025-01-26)

- ✅ 双框架支持
- ✅ 微软雅黑字体

## 常见问题

### Q: 如何禁用代码行号？
A: 使用 `--no-line-numbers` 选项。

### Q: 演讲者备注如何使用？
A: 在 Markdown 中添加 `Note: 备注内容`，演示时按 `S` 键查看。

### Q: 如何更换主题？
A: 使用 `--theme <主题名>` 选项，如 `--theme github`。

### Q: Dev 模式和 Build 模式有什么区别？
A: Dev 模式提供实时预览和完整工具栏（绘图、演讲者视图等），Build 模式生成静态 HTML 文件便于部署。

### Q: 内容优化需要 API key 吗？
A: Basic 级别不需要，Full 级别需要 ANTHROPIC_API_KEY。

## 参考资料

- [Slidev 官网](https://sli.dev/)
- [Slidev 主题](https://sli.dev/themes/)
- [Markdown 语法](https://commonmark.org/)

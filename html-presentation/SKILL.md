---
name: html-presentation
description: >
  HTML 演示文稿生成工具 v2.1。使用 Markdown 编写，生成基于 reveal.js 的交互式 HTML 演示文稿。
  支持自动动画、片段过渡、演讲者备注、侧边栏导航、可调整布局、PPTX 导出、代码行号、鼠标滚轮翻页、中文显示优化。
  适用于：技术分享、产品介绍、教学演示、会议报告。
license: MIT
version: 2.1.0
---

# HTML Presentation Skill v2.1

## 概述

本 skill 用于将 Markdown 转换为交互式 HTML 演示文稿，基于 reveal.js 框架。

### 核心功能 (v2.1 新增)

- **✨ 自动动画** - data-auto-animate 平滑过渡
- **🎬 片段效果** - fade-up 逐项显示
- **📝 演讲者备注** - Note: 语法支持
- **🔢 代码行号** - 高亮代码带行号
- **🖱️ 鼠标滚轮** - 滚轮翻页支持
- **🎯 总页数显示** - 右下角进度计数
- **📐 r-fit-text** - 封面标题自适应
- **🌙 Moon 主题** - 科技感代码高亮

### 原有功能

- **Markdown 编写** - 简单直观的语法
- **侧边栏导航** - 可拖拽调整宽度（150-800px）
- **PPTX 导出** - 一键导出为 PowerPoint 格式
- **代码高亮** - 支持多种编程语言和主题
- **中文优化** - WCAG 对比度检查，确保文字可读性
- **响应式布局** - Flexbox 居中显示
- **自包含 HTML** - 单文件分享

## 工作流程

```
1. 编写 Markdown (slides.md)
   ↓
2. 运行构建脚本 (build.js)
   ↓
3. 生成 HTML (index.html)
   ↓
4. 浏览器打开演示
```

## 使用方法

### 基础用法

```bash
# 构建演示文稿（包含所有 v2.1 新特性）
node skills/html-presentation/scripts/build.js slides.md

# 指定输出路径
node skills/html-presentation/scripts/build.js slides.md my-presentation.html

# 自定义代码高亮主题
node skills/html-presentation/scripts/build.js slides.md --highlight moon

# 禁用特定功能
node skills/html-presentation/scripts/build.js slides.md --no-auto-animate --no-mouse-wheel
```

### v2.1 新特性

#### 1. 自动动画 (Auto-Animate)

所有幻灯片默认启用 `data-auto-animate`，元素在幻灯片间自动平滑过渡。

```markdown
# 幻灯片 1

- 项目 A
- 项目 B

---

# 幻灯片 2

- 项目 A
- 项目 B
- 项目 C  ← 新增项目会平滑出现
```

#### 2. 片段效果 (Fragments)

列表项自动添加 `fade-up` 片段效果，逐项显示。

```markdown
## 功能列表

- 功能一  ← 按空格逐个显示
- 功能二
- 功能三
```

#### 3. 演讲者备注 (Speaker Notes)

使用 `Note:` 语法添加演讲者备注，按 `S` 键查看。

```markdown
# 重要观点

这是演讲内容。

Note: 这里可以添加演讲提示，例如：强调这个观点，可以举例说明...
```

#### 4. 代码行号

代码块自动显示行号，使用 Monokai 科技感主题。

````markdown
```javascript
// 代码自动带行号
function hello() {
  console.log('Hello, World!');
}
```
````

#### 5. 鼠标滚轮翻页

使用鼠标滚轮上下翻页。

## 配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `--title` | Presentation | 演示文稿标题 |
| `--theme` | dracula | Reveal.js 主题 |
| `--highlight` | monokai | 代码高亮主题 |
| `--no-sidebar` | false | 禁用侧边栏 |
| `--no-export` | false | 禁用 PPTX 导出按钮 |
| `--no-auto-animate` | false | 禁用自动动画 |
| `--no-mouse-wheel` | false | 禁用鼠标滚轮 |
| `--no-line-numbers` | false | 禁用代码行号 |

### 可用主题

- `black` - 经典黑色
- `white` - 简洁白色
- `league` - 专业风格
- `beige` - 柔和米色
- `night` - 深色夜间
- `dracula` - 德古拉主题（默认）
- `solarized` - Solarized 配色

### 可用代码高亮主题

- `monokai` - 科技感（默认）
- `moon` - Moon 主题
- `atom-one-dark` - Atom One Dark
- `atom-one-light` - Atom One Light
- `github` - GitHub 主题
- `github-dark` - GitHub Dark
- `nord` - Nord 主题
- `obsidian` - Obsidian 主题
- `solarized-dark` - Solarized Dark
- `solarized-light` - Solarized Light
- `tomorrow` - Tomorrow 主题

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

### 代码块（自动带行号）

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
| `ESC` | 退出概览 |

## 技术实现

### v2.1 新增

```javascript
// 自动动画配置
autoAnimate: true,
autoAnimateEasing: 'ease',
autoAnimateDuration: 0.3,

// 鼠标滚轮
mouseWheel: true,

// 链接预览
previewLinks: true,

// 代码行号
highlight: {
  lineNumbers: true
}
```

```css
/* 封面标题自适应 */
.reveal .r-fit-text {
  display: inline-block;
  max-width: 100%;
}

/* 片段淡入效果 */
.reveal .fragment.fade-up {
  opacity: 0;
  transform: translateY(20px);
}

/* 总页数计数器 */
.reveal .slide-number-total {
  position: fixed;
  bottom: 20px;
  right: 20px;
}
```

### 原有特性

```javascript
// 侧边栏宽度范围：150px - 800px
if (newWidth >= 150 && newWidth <= 800) {
  sidebar.style.width = newWidth + 'px';
}

// WCAG 对比度检查
function ensureContrast(textColor, bgColor) {
  const contrast = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  if (contrast < 3) {
    return isDarkColor(bgColor) ? 'FFFFFF' : '1E293B';
  }
  return textColor;
}
```

## 目录结构

```
skills/html-presentation/
├── SKILL.md              # 本文档
├── README.md             # 用户文档
├── package.json          # 依赖配置
├── templates/            # 演示文稿模板
│   └── default.md        # 默认模板
└── scripts/
    ├── build.js          # 主构建脚本 (v2.1)
    ├── init.js           # 初始化脚本
    └── serve.js          # 开发服务器
```

## 依赖项

- **marked** ^11.2.0 - Markdown 解析器
- **reveal.js** 4.6.1 - 演示框架（CDN）
- **pptxgenjs** 3.12.0 - PPTX 生成（CDN）
- **highlight.js** - 代码高亮（CDN）
- **line-numbers.js** - 代码行号（CDN）

## 更新日志

### v2.1.0 (2025-01-26)

**新增功能：**
- ✨ 自动动画 (data-auto-animate)
- 🎬 fade-up 片段效果
- 📝 演讲者备注支持
- 🔢 代码行号显示
- 🖱️ 鼠标滚轮翻页
- 🎯 总页数计数器
- 📐 r-fit-text 封面优化
- 🌙 Monokai 代码主题

**改进：**
- 🎨 更新默认代码主题为 monokai
- ⚡ 优化动画性能
- 📊 更详细的构建输出

### v2.0.0 (2025-01-26)

- ✅ 水平侧边栏布局（编号 + 标题）
- ✅ 可拖拽调整宽度（150-800px）
- ✅ PPTX 导出功能
- ✅ WCAG 对比度检查
- ✅ Flexbox 居中显示
- ✅ 移除 toggle 功能

## 常见问题

### Q: 如何禁用自动动画？
A: 使用 `--no-auto-animate` 选项。

### Q: 演讲者备注如何使用？
A: 在 Markdown 中添加 `Note: 备注内容`，演示时按 `S` 键查看。

### Q: 如何更换代码高亮主题？
A: 使用 `--highlight <主题名>` 选项，如 `--highlight moon`。

### Q: 代码行号太多了怎么办？
A: 使用 `--no-line-numbers` 禁用行号显示。

## 参考资料

- [reveal.js 官网](https://revealjs.com/)
- [reveal.js auto-animate](https://revealjs.com/auto-animate/)
- [Markdown 语法](https://commonmark.org/)
- [PptxGenJS 文档](https://gitbrent.github.io/PptxGenJS/)

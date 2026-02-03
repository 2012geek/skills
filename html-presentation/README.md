# Slidev Presentation

使用 Markdown 创建交互式 HTML 演示文稿。

## 快速开始

```bash
# 1. 初始化演示文稿
node skills/html-presentation/scripts/init.js my-presentation

# 2. 编辑 slides.md
# 3. 构建演示文稿
cd my-presentation
npm run build

# 4. 在浏览器中打开 dist/index.html
```

## 功能特性

| 功能 | 说明 |
|------|------|
| 📝 Markdown | 简单直观的语法 |
| 🎨 多主题 | seriph, default, apple-basic, github 等 |
| 🚀 Dev 模式 | 实时预览，完整工具栏 |
| 💻 代码高亮 | Shiki 语法高亮 |
| 📝 演讲者备注 | Note: 语法支持 |
| 🎯 Vue 组件 | 完整 Vue.js 支持 |
| 📊 Mermaid 图表 | 内置支持 |
| 🧮 LaTeX 公式 | 内置支持 |
| 🇨🇳 中文优化 | 微软雅黑字体 |

## 命令

```bash
# Dev 模式（默认）- 实时预览
node skills/html-presentation/scripts/build.js slides.md

# 构建静态 HTML
node skills/html-presentation/scripts/build.js slides.md output.html --mode build

# 自定义主题
node skills/html-presentation/scripts/build.js slides.md --theme github

# 启用内容优化
node skills/html-presentation/scripts/build.js slides.md --optimize
```

## 主题

- `default` - 默认主题
- `seriph` - Serif 主题（默认）
- `apple-basic` - Apple 风格
- `cb` - CB 主题
- `github` - GitHub 风格
- `shibainu` - 柴犬主题
- `simula` - Simula 主题
- `dracula` - Dracula 主题

## 目录结构

```
my-presentation/
├── slides.md         # 演示内容
├── package.json      # 项目配置
├── dist/
│   └── index.html    # 生成的演示文稿
└── assets/           # 资源文件（可选）
```

## 模式

### Dev 模式（默认）

- ✅ 绘图/标注工具 (按 'd')
- ✅ 演讲者视图 (按 'p')
- ✅ 幻灯片概览 (按 'o')
- ✅ 全屏模式 (按 'f')
- ✅ 摄像头 (按 'c')
- ✅ 演讲者备注 (按 's')
- ✅ 实时重载
- ❌ 需要运行服务器

### Build 模式

- ✅ 静态 HTML 文件
- ✅ 易于部署
- ✅ PDF 导出
- ❌ 工具栏受限

## 示例

查看 `demo-presentation/` 目录获取完整示例。

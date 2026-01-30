# HTML Presentation

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
| 🎨 多主题 | 7 种内置主题 |
| 📱 响应式 | 自适应屏幕大小 |
| 🔍 侧边栏 | 可拖拽调整宽度 |
| 📤 PPTX 导出 | 一键导出 PowerPoint |
| 💻 代码高亮 | 支持多种语言 |
| 🇨🇳 中文优化 | WCAG 对比度检查 |

## 命令

```bash
# 构建演示文稿
node skills/html-presentation/scripts/build.js slides.md

# 开发模式（自动重载）
npm run dev

# 自定义主题
node skills/html-presentation/scripts/build.js slides.md --theme white
```

## 主题

- `black` - 经典黑色
- `white` - 简洁白色
- `league` - 专业风格
- `beige` - 柔和米色
- `night` - 深色夜间
- `dracula` - 德古拉主题
- `solarized` - Solarized 配色

## 目录结构

```
my-presentation/
├── slides.md         # 演示内容
├── package.json      # 项目配置
├── dist/
│   └── index.html    # 生成的演示文稿
└── assets/           # 资源文件（可选）
```

## 示例

查看 `demo-presentation/` 目录获取完整示例。

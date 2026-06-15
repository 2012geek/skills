---
name: html-presentation
description: "从 Markdown 生成漂亮的 Slidev 演示文稿，支持 AI 质量验证。使用 Claude 视觉能力评估幻灯片质量，自动修复布局问题。支持多种 Slidev 主题、三层缓存系统、人工干预模式。"
license: MIT
---

# HTML-Presentation

从 Markdown 生成漂亮的 Slidev 演示文稿，支持 AI 质量验证。

## Usage

Generate a presentation from markdown:
```bash
cd html-presentation && node cli.js generate <input.md> --theme <theme-name>
```

With AI-powered quality verification:
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
cd html-presentation && node cli.js generate <input.md> --verify --threshold 80
```

Interactive mode with human intervention:
```bash
cd html-presentation && node cli.js generate <input.md> --verify --interactive
```

## Features

- **Smart Layout Selection**: Automatically chooses appropriate Slidev layouts based on content
- **Content Analysis**: Character-based metrics for code, text, and images
- **AI Quality Judgment**: Uses Claude vision to evaluate slide visual quality
- **Automatic Layout Fixing**: AI-powered fixes for layout issues
- **Three-Layer Caching**: L1 (memory), L2 (disk), L3 (semantic) for performance
- **Human Intervention**: Interactive mode when AI needs help
- **Multiple Slidev Themes**: Support for seriph, default, apple-basic, etc.

## Options

- `--theme <name>`: Slidev theme (default: seriph)
- `--verify`: Enable AI-powered verification
- `--no-verify`: Disable verification (default)
- `--threshold <score>`: Quality threshold 0-100 (default: 80)
- `--max-iterations <n>`: Max auto-fix attempts (default: 3)
- `--interactive`: Enable human intervention mode

## Examples

# Basic generation
cd html-presentation && node cli.js generate README.md --theme seriph

# With verification
cd html-presentation && node cli.js generate docs/guide.md --verify --threshold 85

# Interactive mode
cd html-presentation && node cli.js generate content.md --verify --interactive

## Output

Generates a Slidev presentation file:
- `<input>.slides.md` - The presentation file
- Can be opened in Slidev for preview/editing
- Supports export to PDF, images, etc.

## v2.0 Features

- ✅ AI-powered quality assessment (Claude vision)
- ✅ Automatic layout fixing
- ✅ Multi-layer caching system
- ✅ Human intervention fallback
- ✅ Real-time slide verification

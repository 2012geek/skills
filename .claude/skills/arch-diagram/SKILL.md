---
name: arch-diagram
description: "Automatically generate architecture diagrams from codebase analysis. Use when the user wants to: (1) Visualize system architecture from a directory or file, (2) Create professional SVG diagrams with D2 auto-layout, (3) Document code structure visually for documentation or presentations"
---

# Architecture Diagram Generator

## Overview

Generate professional architecture diagrams (SVG) from any codebase automatically. This skill analyzes code structure and generates D2 diagrams for high-quality SVG output.

**★ Insight ─────────────────────────────────────**
**Architecture Visualization Strategy**
- **D2 Diagramming**: Modern diagram scripting language with beautiful auto-layout
- **Direct Workflow**: Analyze → D2 → SVG (no intermediate formats)
- **Server-friendly**: Pure CLI workflow, no browser or GUI required
`─────────────────────────────────────────────────`

## Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Architecture Diagram Generation (D2 CLI)      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. CODE ANALYSIS           2. D2 RENDERING                     │
│  ┌─────────────────┐       ┌─────────────────┐                  │
│  │ analyze_codebase│  ───▶ │  render_d2.py   │                  │
│  │      .py        │       │  (D2 CLI wrapper)│                  │
│  └─────────────────┘       └─────────────────┘                  │
│           │                         │                            │
│           ▼                         ▼                            │
│  architecture.md           output-architecture.svg              │
│     (LLM review)                                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Analyze Codebase

Run the analysis script on your target directory or file:

```bash
cd arch-diagram && python scripts/analyze_codebase.py /path/to/code --output architecture.md
```

**What it does:**
- Scans directory structure and files
- Detects project type (Python, JavaScript, Java, Go, etc.)
- Extracts imports and dependencies
- Generates LLM prompt for architecture analysis

**Output:** `architecture.md` - Contains analysis prompt for LLM processing

**Process the prompt through LLM:**
The generated file contains a structured prompt. Send this to your LLM to get the actual architecture analysis. The LLM should return:
- Project overview
- Components and their relationships
- Data flows and external dependencies
- Architecture patterns used

## Step 2: Write D2 Diagram

Based on the LLM analysis, write a D2 diagram directly. Here's a basic template:

```d2
# Architecture Diagram
direction: down

# Components
User: 用户 {
  shape: person
}

Controller: 控制器
Service: 服务层
Database: 数据库

# Relationships
User -> Controller: 请求
Controller -> Service: 调用
Service -> Database: 查询

# Layout
near: Controller & Service
near: Service & Database
```

**Key D2 concepts:**
- `direction: down` - Top-down flow (or `right`, `up`, `left`)
- `shape: person` - Person icon (or omit for default rectangle)
- `near:` - Keep components close together
- `-->` - Dotted arrow for indirect relationships

**See also:** [D2 Tour](https://d2lang.com/tour/) for more syntax examples

## Step 3: Render to SVG

### D2 CLI (Required)

Install D2 diagramming CLI:

**macOS:**
```bash
brew install d2
```

**Linux:**
```bash
# Download latest version (check https://github.com/terrastruct/d2/releases for latest)
# IMPORTANT: Use correct filename format: d2-vX.X.X-linux-amd64.tar.gz
wget https://github.com/terrastruct/d2/releases/download/v0.7.1/d2-v0.7.1-linux-amd64.tar.gz -O /tmp/d2.tar.gz
tar -xzf /tmp/d2.tar.gz -C /tmp
sudo mkdir -p /usr/local/bin
sudo cp /tmp/d2-v0.7.1/bin/d2 /usr/local/bin/d2
chmod +x /usr/local/bin/d2

# Alternative: Install to ~/.local/bin for user-only installation
mkdir -p ~/.local/bin
cp /tmp/d2-v0.7.1/bin/d2 ~/.local/bin/d2
chmod +x ~/.local/bin/d2
# Add to PATH if needed: export PATH="$HOME/.local/bin:$PATH"
```

**Windows:**
Visit https://d2lang.com/tour/install/

**Verify installation:**
```bash
d2 --version
```

### Python Dependencies

```bash
cd arch-diagram && pip install -r requirements.txt
```

## Usage Examples

### Example 1: Complete Workflow

```bash
# Step 1: Analyze codebase
cd arch-diagram && python scripts/analyze_codebase.py ~/projects/my-api --output api-arch.md

# Step 2: Review analysis with LLM and write D2 diagram
# Create api-arch.d2 based on the architecture analysis

# Step 3: Render SVG
d2 api-arch.d2 -o api-architecture.svg --layout elk
```

### Example 2: Single File Analysis

```bash
cd arch-diagram && python scripts/analyze_codebase.py ~/projects/app/main.py
```

### Example 3: Direct D2 Rendering

```bash
# Use D2 CLI directly for more control
d2 input.d2 -o output.svg --layout elk --theme 1

# Available layouts: elk (layered), dagre (directed graph)
# Available themes: 0-100 (default theme is 0)
d2 input.d2 -o output.svg --layout elk --theme 3
```

## Success Case: GitCode CI Repair

**Project:** GitCode CI Repair - Automated CI failure fixing system

**Diagram:** `gitcode-ci-repair/gitcode-ci-repair-clean-no-groups.svg`

**What it shows:**
- Complete iterative repair workflow (12 steps with numbered flow)
- Three architectural layers: User (orange), Core (blue), External (green)
- ELK layered layout for clear top-down flow
- Clean design without visual group boxes

**Key techniques used:**
- `direction: down` - Top-down flowchart layout
- `near: directives` - Compact component spacing
- ELK layout algorithm - Professional layered hierarchy
- Color-coded layers - Visual distinction without boundaries

**D2 source:** `gitcode-ci-repair/gitcode-ci-repair-clean-no-groups.d2`

This demonstrates the skill's ability to generate complex, process-oriented architecture diagrams that clearly communicate system workflows and component interactions.

## DSL Reference

For advanced DSL customization, see `references/structurizr_dsl.md` for:
- Complete element types (person, softwareSystem, container, component)
- Relationship syntax
- View types (systemLandscape, systemContext, container, component)
- Styling options for rich diagrams

## Troubleshooting

**D2 CLI not found:**
```bash
# macOS
brew install d2

# Linux (use correct tar.gz filename)
wget https://github.com/terrastruct/d2/releases/download/v0.7.1/d2-v0.7.1-linux-amd64.tar.gz -O /tmp/d2.tar.gz
tar -xzf /tmp/d2.tar.gz -C /tmp
sudo cp /tmp/d2-v0.7.1/bin/d2 /usr/local/bin/d2
chmod +x /usr/local/bin/d2

# Verify
d2 --version
```

**Network/Proxy issues downloading D2:**
```bash
# If using a proxy, set environment variables
export http_proxy=http://127.0.0.1:10809
export https_proxy=http://127.0.0.1:10809

# Then retry download with proxy
wget -e use_proxy=yes https://github.com/terrastruct/d2/releases/download/v0.7.1/d2-v0.7.1-linux-amd64.tar.gz -O /tmp/d2.tar.gz
```

**D2 syntax errors:**
- Check D2 syntax at https://d2lang.com/tour/
- Ensure all labels are properly quoted if they contain special characters
- Verify all connections use `->` or `-->`

**SVG rendering issues:**
```bash
# Try different layout algorithms (ELK is recommended for architecture diagrams)
d2 input.d2 -o output.svg --layout elk    # Layered layout (recommended)
d2 input.d2 -o output.svg --layout dagre  # Directed graph

# Increase timeout for complex diagrams
cd arch-diagram && python scripts/render_d2.py input.d2 --timeout 60
```

**Generated diagram looks incomplete:**
- Verify the D2 file contains all components and connections
- Check that `direction` is set appropriately (down, right, up, left)
- Try different layout algorithms (--layout elk or --layout dagre)

## Resources

### scripts/
- `analyze_codebase.py` - Code structure analysis and LLM prompt generation
- `render_d2.py` - D2 CLI wrapper for SVG rendering

## Links

- [D2 Diagramming Language](https://d2lang.com/)
- [D2 Tour & Tutorial](https://d2lang.com/tour/)
- [D2 Installation Guide](https://d2lang.com/tour/install/)
- [D2 Releases](https://github.com/terrastruct/d2/releases)
- [D2 Playground](https://play.d2lang.com/)
- [ELK Layout Algorithm](https://www.eclipse.org/elk/)

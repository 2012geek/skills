---
name: contributor-statistic
description: "分析 GitHub 仓库贡献者活动，使用 LLM 判断重要提交并生成中文贡献统计报告"
license: MIT
---

# contributor-statistic

分析 GitHub 仓库贡献者活动，使用 LLM 判断重要提交并生成中文贡献统计报告。

## Usage

### 分析远程仓库

```
node scripts/analyze.js --repo https://github.com/owner/repo
```

### 分析本地仓库

```
node scripts/analyze.js --local /path/to/repo
```

### 指定时间范围

```
node scripts/analyze.js --repo https://github.com/owner/repo --since 2024-01-01 --until 2024-12-31
```

## CLI Options

| Option        | Description                        | Default      |
|---------------|------------------------------------|--------------|
| `--repo`      | GitHub 仓库 URL                    | -            |
| `--local`     | 本地仓库路径                       | -            |
| `--since`     | 起始日期 (YYYY-MM-DD)              | 30 days ago  |
| `--until`     | 结束日期 (YYYY-MM-DD)              | today        |
| `--output`    | 输出文件路径                       | stdout       |
| `--format`    | 输出格式 (text/markdown/json)      | text         |

## Workflow

1. **收集提交数据** - 使用 simple-git 从本地仓库或克隆远程仓库获取 git log
2. **统计贡献者活动** - 汇总每位贡献者的提交数、行变更数、活跃时间
3. **筛选重要提交** - 根据行变更阈值筛选大变更提交
4. **LLM 分析** - 使用 Anthropic API 对重要提交进行语义分析，判断其重要性
5. **生成报告** - 按贡献者汇总分析结果，生成中文统计报告
6. **输出结果** - 将报告输出到指定路径或 stdout

## Directory Structure

```
contributor-statistic/
├── SKILL.md              # Skill definition
├── README.md             # User-facing documentation
├── package.json          # Dependencies and scripts
├── config.json           # Configuration template
├── agents/               # Agent definitions
├── lib/                  # Core libraries
├── scripts/              # Executable scripts
│   └── analyze.js        # Main analysis script
└── tests/                # Test files
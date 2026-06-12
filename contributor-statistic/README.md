# contributor-statistic

分析 GitHub 仓库贡献者活动，使用 LLM 判断重要提交并生成中文贡献统计报告。

## 功能

- 收集仓库贡献者的提交活动和行变更统计
- 使用 LLM 语义分析判断重要提交
- 生成中文贡献统计报告
- 支持远程仓库和本地仓库分析
- 支持自定义时间范围

## 安装

```bash
cd contributor-statistic && npm install
```

## 使用

```bash
# 分析远程仓库
npm run analyze -- --repo https://github.com/owner/repo

# 分析本地仓库
npm run analyze -- --local /path/to/repo

# 指定时间范围
npm run analyze -- --repo https://github.com/owner/repo --since 2024-01-01 --until 2024-12-31
```

## 配置

编辑 `config.json` 设置 Anthropic API Key 和分析参数：

```json
{
  "anthropic": {
    "apiKey": "your-api-key"
  },
  "contributorStatistic": {
    "maxImportantCommits": 5,
    "lineChangeThreshold": 100
  }
}
```
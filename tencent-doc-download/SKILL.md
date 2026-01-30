---
name: tencent-doc-download
description: "腾讯文档空间下载工具。用于递归下载腾讯文档空间中的所有文档，支持 Markdown 格式导出、会话保持、目录结构保留。已成功下载 101 个文档。"
license: MIT
---

# 腾讯文档空间下载 Skill

## 概述

本 skill 用于从腾讯文档空间批量下载文档，自动转换为 Markdown 格式，保持目录结构。

### 核心功能

- **自动登录保持** - 使用 userDataDir 保存会话，一次登录长期有效
- **递归下载** - 自动展开目录，下载所有子文档
- **Markdown 转换** - 使用 Turndown 将 HTML 转换为 Markdown
- **目录结构保留** - 文件按原始目录组织保存
- **内容智能提取** - 使用正确的选择器 `.css-1t3wwj8 e1w3g4nf1` 获取文档内容

## 工作流程

```
1. 首次登录 → 保存会话
2. 访问空间 → 获取文档列表
3. 递归处理 → 展开目录，下载子文档
4. 点击文档 → 提取内容
5. HTML → Markdown → 保存文件
```

## 使用场景

当用户需要：
- 批量下载腾讯文档空间的所有文档
- 将腾讯文档转换为 Markdown 格式
- 备份腾讯文档到本地

## 快速开始

### 1. 首次登录（仅一次）

```bash
cd skills/tencent-doc-download
npm install
node scripts/login_manual.js
```

浏览器会自动打开，扫码或密码登录后，等待 90 秒让会话保存。

### 2. 下载文档

```bash
node scripts/download.js
```

## 配置选项

编辑 `scripts/download.js` 中的 `DEFAULT_CONFIG`:

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `spaceUrl` | string | `https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1` | 腾讯文档空间 URL |
| `outputDir` | string | `./tencent_auto_download` | 输出目录 |
| `headless` | boolean | `false` | 是否无头模式（首次登录需设为 false） |
| `timeout` | number | `60000` | 页面加载超时（毫秒） |
| `skipExisting` | boolean | `true` | 跳过已存在的文件 |
| `userDataDir` | string | `./.tencent-docs-session` | 会话保存目录 |

## 目录结构

```
skills/tencent-doc-download/
├── SKILL.md                    # 本文档
├── scripts/
│   ├── download.js             # 主下载脚本
│   ├── login_manual.js         # 手动登录脚本
│   └── debug-real-content.js   # 内容调试工具
├── tencent_auto_download/      # 下载的文档
└── .tencent-docs-session/     # 保存的会话
```

## 技术实现

### 内容选择器

文档内容位于 `.css-1t3wwj8` 或包含 `e1w3g4nf1` 的元素中：

```javascript
const contentArea = document.querySelector('.css-1t3wwj8, [class*="e1w3g4nf1"]');
```

### 子文档发现

使用"展开前后对比法"：
1. 记录展开前所有 node-id
2. 点击 switcher 展开目录
3. 记录展开后所有 node-id
4. 差值即为子文档

### 目录+文件概念

腾讯文档中，一个节点可以既是目录又是文件：
- 有 switcher = 可以展开显示子文档
- 节点本身也可以有独立内容

## 常见问题

### Q: 会话过期怎么办？
A: 重新运行 `node scripts/login_manual.js` 重新登录。

### Q: 如何下载不同的空间？
A: 修改 `scripts/download.js` 中的 `DEFAULT_CONFIG.spaceUrl`。

### Q: 下载的内容不完整？
A: 检查选择器是否正确匹配 `.css-1t3wwj8` 元素。

## 更新日志

### v1.0.0 (2025-01-23)
- ✅ 实现基本下载功能
- ✅ 支持会话保持
- ✅ 递归处理目录
- ✅ 修复内容选择器（使用 `.css-1t3wwj8`）
- ✅ 成功下载 101 个文档

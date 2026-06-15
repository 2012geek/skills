---
name: tencent-doc-sync
description: "腾讯文档智能同步工具。显示详细统计（扫描/无变化/需更新/新增/更新/删除），支持 Hash 对比和删除同步，集成内容下载功能。"
license: MIT
---

# 腾讯文档智能同步 Skill

## 概述

本 skill 用于智能同步腾讯文档到本地 Markdown 仓库，提供详细的同步统计，并支持内容下载。

### 核心功能

- **智能 Hash 对比** - 忽略 `synced_at` 时间戳，只对比实际内容变化
- **详细统计** - 显示扫描数、无变化数、需更新数、新增、更新、删除
- **删除同步** - 自动删除本地多余文档
- **空文件夹处理** - 自动创建占位文档
- **内容下载** - 使用 Puppeteer 自动下载文档实际内容

## 快速开始

### 1. 安装依赖

```bash
cd tencent-doc-sync && npm install
```

### 2. 获取登录二维码（首次使用）

**重要：** 如果会话已过期，需要先获取登录二维码。

```bash
# 仅截图保存
cd tencent-doc-sync && node scripts/login.js

# 截图并发送到邮箱（需配置邮箱密码）
cd tencent-doc-sync && node scripts/login.js --email

# 指定输出路径
cd tencent-doc-sync && node scripts/login.js --output=/path/to/qr.png
```

**自动完成步骤：**
1. ✅ 打开腾讯文档首页
2. ✅ 点击右上角"登录"按钮
3. ✅ 同意用户协议
4. ✅ 点击微信登录图标
5. ✅ 点击 "Log in now" 按钮
6. ✅ **点击 "Agree" 按钮（关键步骤！）**
7. ✅ 等待二维码出现
8. ✅ 检测并验证二维码
9. ✅ 截图保存（只有检测到二维码才会保存）

**注意：** 脚本会自动检测二维码，如果没有检测到二维码不会保存截图。

### 3. 运行同步

#### 方式1：仅同步结构（快速）

```bash
cd tencent-doc-sync && ./test-sync.sh
# 或
cd tencent-doc-sync && node src/smart-sync.js
```

#### 方式2：下载内容 + 同步（推荐）

```bash
cd tencent-doc-sync && node src/smart-sync.js --download
```

#### 方式3：强制重新下载所有内容

```bash
cd tencent-doc-sync && node src/smart-sync.js --download --force
```

### 3. 查看统计

```
============================================================
📊 同步统计
============================================================

📋 扫描结果:
  • 总扫描文档: 91 个
  • 无变化文档: 91 个
  • 需更新文档: 0 个

🔧 执行操作:
  • 新增: 0 个
  • 更新: 0 个
  • 删除: 0 个
  • 失败: 0 个

📁 文件夹统计:
  • 总文件夹数: 21 个

✅ 同步完成！
============================================================
```

## 配置选项

### 命令行参数

| 参数 | 简写 | 说明 |
|------|------|------|
| `--download` | `-d` | 启用内容下载模式（使用 Puppeteer 下载实际内容） |
| `--force` | `-f` | 强制重新下载所有内容（忽略已存在的文件） |
| `--help` | `-h` | 显示帮助信息 |

### 配置常量

编辑 `src/smart-sync.js` 中的常量：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `REPO_DIR` | string | `/Users/chenlening/workspace/mylerobot-doc` | 目标仓库路径 |
| `DOCS_DIR` | string | `tencent-docs` | 文档目录名 |
| `META_FILE` | string | `.sync-metadata.json` | 元数据文件名 |

### 下载器配置

编辑 `src/core/downloader.js` 中的配置：

| 配置项 | 说明 |
|--------|------|
| `spaceUrl` | 腾讯文档空间 URL |
| `headless` | 是否使用无头模式（false = 显示浏览器） |
| `skipExisting` | 是否跳过已存在的文件 |
| `userDataDir` | 会话数据保存目录 |

## 目录结构

```
tencent-doc-download/
├── SKILL.md                     # 本文档
├── package.json                 # 依赖配置
├── scripts/
│   ├── get-qr-code.js          # 登录二维码获取工具（推荐）
│   └── download.js             # 原始下载脚本（备用）
├── src/
│   ├── smart-sync.js           # 主同步脚本
│   ├── core/                   # 核心逻辑
│   │   └── downloader.js       # 内容下载器
│   └── utils/                  # 工具模块
│       ├── hash.js             # Hash 计算
│       ├── logger.js           # 日志输出
│       └── metadata.js         # 元数据管理
├── test-sync.sh                # 测试脚本
└── .tencent-docs-session/      # 会话数据（保留）
```

## 工作流程

### 仅同步结构（默认）

```
1. 扫描本地文档
2. 对比远程文档树
3. 创建/更新/删除文档占位符
4. 保存元数据
```

### 下载内容 + 同步（--download）

```
1. 启动浏览器（Puppeteer）
2. 登录腾讯文档（首次需手动）
3. 遍历文档树，下载实际内容
4. 转换为 Markdown 格式
5. 扫描本地文档
6. 对比并同步结构
7. 保存元数据
```

## 工具模块说明

### hash.js
- `generateHash(content)` - 生成内容哈希（忽略 synced_at）
- `compareContent(c1, c2)` - 对比两个内容是否相同

### logger.js
- `displayStats(stats)` - 显示统计信息
- `separator(char, length)` - 输出分隔线

### metadata.js
- `loadMetadata(file)` - 加载元数据
- `saveMetadata(file, data)` - 保存元数据
- `getLastSyncTime(meta)` - 获取上次同步时间

## 常见问题

### Q: 为什么所有文档都显示"需更新"？
A: 已修复！现在 Hash 计算会忽略 `synced_at` 时间戳，只对比实际内容。

### Q: 为什么文档内容是"文档内容待提取"？
A: 默认的同步模式只创建文档结构。使用 `--download` 参数下载实际内容：
```bash
cd tencent-doc-sync && node src/smart-sync.js --download
```

### Q: 如何更换目标仓库？
A: 修改 `src/smart-sync.js` 中的 `REPO_DIR` 常量。

### Q: 如何获取登录二维码？
A: 使用专门的登录脚本：
```bash
cd tencent-doc-sync && node scripts/login.js
```
脚本会自动完成所有登录步骤（包括点击 Agree 按钮），并验证二维码是否出现。

### Q: 为什么需要点击 Agree 按钮？
A: 这是腾讯文档的安全机制。登录流程需要：
1. 点击"登录"
2. 点击微信登录
3. 点击 "Log in now"
4. **点击 "Agree"** ← 关键步骤！
5. 才会显示二维码

脚本会自动完成所有步骤，并验证二维码是否真的出现。

### Q: 首次下载需要登录怎么办？
A: 脚本会自动打开浏览器窗口，手动登录后按 Enter 继续。登录信息会保存在 `.tencent-docs-session/` 目录。

### Q: 测试脚本做了什么？
A: `test-sync.sh` 会：
1. Git stash 备份当前状态
2. 运行同步
3. 检查是否有不必要的文件变化
4. 自动恢复备份

### Q: 下载速度慢怎么办？
A: Puppeteer 需要等待页面加载，这是正常的。可以：
1. 使用 `--skip-existing` 跳过已下载的文档
2. 检查网络连接
3. 关闭其他占用带宽的应用

## 更新日志

### v2.2.0 (2026-02-28)
- ✅ 添加专门的登录二维码获取工具 `scripts/get-qr-code.js`
- ✅ 自动完成所有登录步骤（包括点击 Agree 按钮）
- ✅ 自动检测并验证二维码是否出现
- ✅ 改进文档和错误处理
- ✅ 固化登录流程，避免重复犯错

### v2.1.0 (2026-02-28)
- ✅ 集成内容下载功能（Puppeteer + Turndown）
- ✅ 添加 `--download` 参数支持
- ✅ 添加 `--force` 强制重新下载
- ✅ 改进文档和帮助信息

### v2.0.0 (2026-02-28)
- ✅ 修复 Hash 对比 bug（忽略 synced_at）
- ✅ 显示详细统计（扫描/无变化/需更新/新增/更新/删除）
- ✅ 重构为模块化结构
- ✅ 添加自动化测试脚本

### v1.0.0 (2025-01-23)
- ✅ 基本同步功能
- ✅ 文档下载功能

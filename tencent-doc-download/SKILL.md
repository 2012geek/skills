---
name: tencent-doc-sync
description: "腾讯文档智能同步工具。显示详细统计（扫描/无变化/需更新/新增/更新/删除），支持 Hash 对比和删除同步。"
license: MIT
---

# 腾讯文档智能同步 Skill

## 概述

本 skill 用于智能同步腾讯文档到本地 Markdown 仓库，提供详细的同步统计。

### 核心功能

- **智能 Hash 对比** - 忽略 `synced_at` 时间戳，只对比实际内容变化
- **详细统计** - 显示扫描数、无变化数、需更新数、新增、更新、删除
- **删除同步** - 自动删除本地多余文档
- **空文件夹处理** - 自动创建占位文档

## 快速开始

### 1. 安装依赖

```bash
cd skills/tencent-doc-sync
npm install
```

### 2. 运行同步

```bash
./test-sync.sh
# 或
node src/smart-sync.js
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

编辑 `src/smart-sync.js` 中的常量：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `REPO_DIR` | string | `/Users/chenlening/workspace/mylerobot-doc` | 目标仓库路径 |
| `DOCS_DIR` | string | `tencent-docs` | 文档目录名 |
| `META_FILE` | string | `.sync-metadata.json` | 元数据文件名 |

## 目录结构

```
tencent-doc-sync/
├── SKILL.md                # 本文档
├── src/
│   ├── smart-sync.js       # 主同步脚本
│   ├── core/               # 核心逻辑（待扩展）
│   └── utils/              # 工具模块
│       ├── hash.js         # Hash 计算
│       ├── logger.js       # 日志输出
│       └── metadata.js     # 元数据管理
├── test-sync.sh            # 测试脚本
└── .tencent-docs-session/  # 会话数据（保留）
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

### Q: 如何更换目标仓库？
A: 修改 `src/smart-sync.js` 中的 `REPO_DIR` 常量。

### Q: 测试脚本做了什么？
A: `test-sync.sh` 会：
1. Git stash 备份当前状态
2. 运行同步
3. 检查是否有不必要的文件变化
4. 自动恢复备份

## 更新日志

### v2.0.0 (2026-02-28)
- ✅ 修复 Hash 对比 bug（忽略 synced_at）
- ✅ 显示详细统计（扫描/无变化/需更新/新增/更新/删除）
- ✅ 重构为模块化结构
- ✅ 添加自动化测试脚本

### v1.0.0 (2025-01-23)
- ✅ 基本同步功能
- ✅ 文档下载功能

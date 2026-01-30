# HTML Presentation Skill - 架构说明 (v3.1.1)

## 📁 文件结构

```
skills/html-presentation/
├── scripts/
│   ├── build.js                    ⭐ 主入口
│   ├── build-reveal.js              → Reveal.js 构建器
│   ├── build-slidev.js              → Slidev 构建器
│   ├── slidev-generator.js          ✨ NEW - Slidev Markdown 生成器
│   ├── init.js                      → 初始化脚本
│   └── serve.js                     → 静态文件服务器
├── components/                       → Vue 组件
├── node_modules/                     → 依赖
└── package.json                      → 依赖配置
```

## 🔄 工作流程

```
用户命令: node build.js input.md
   ↓
build.js (默认 mode: 'dev')
   ↓
startDevMode()
   ↓
1. 生成 Slidev Markdown (slidev-generator.js)
   ├─ 读取原始 Markdown
   ├─ 智能分片 (H1/H2 检测)
   ├─ 添加 frontmatter
   └─ 插入 --- 分隔符
   ↓
2. 启动 Slidev Dev Server
   ├─ npx @slidev/cli
   ├─ 自动回答 'y'
   └─ 监听 127.0.0.1:3030
   ↓
浏览器访问: http://localhost:3030
```

## 🆕 slidev-generator.js (NEW)

**功能**: 将原始 Markdown 转换为 Slidev 格式

**核心特性**:
1. ✅ 智能幻灯片分片
   - H1 (#) → 新幻灯片
   - H2 (##) → 检测主要章节，创建新幻灯片
   - 保留现有 `---` 分隔符

2. ✅ 自动添加 Frontmatter
```yaml
---
theme: seriph
highlighter: shiki
lineNumbers: true
drawings:
  persist: true
editor: false
transition: slide
download: true
info: true
canCopy: true
transitionSlide: true
mouseWheel: true
fonts:
  sans: ["Microsoft YaHei","微软雅黑","sans-serif"]
  serif: ["Microsoft YaHei","微软雅黑","sans-serif"]
  mono: ["Consolas","Monaco","Courier New","monospace"]
class: text-left
---
```

3. ✅ 处理代码块
   - 保持代码块完整性
   - 不在代码块内分片

## 📊 生成的幻灯片结构

**输入**: 异构编程技术洞察.md (1245 行)
**输出**: 23 张幻灯片

### 幻灯片分片规则

1. **H1 标题** → 新幻灯片
2. **主要章节** (H2 包含关键词) → 新幻灯片
   - 需求背景分析
   - NVIDIA CUDA
   - Intel oneAPI
   - ARM big.LITTLE
   - Apple M1
   - 综合方案设计
   - 实施路线图
3. **现有 `---`** → 保持为分隔符

## 🚀 使用方式

### 1. 开发模式（默认）

```bash
node build.js "陈乐宁技术洞察/异构编程技术洞察.md"
```

**流程**:
1. slidev-generator 生成临时 `.slidev-temp-dev.md`
2. 启动 Slidev 开发服务器
3. 支持完整工具栏、Vue 组件、实时重载

### 2. 生成独立 Slidev 文件

```bash
node scripts/slidev-generator.js \
  "陈乐宁技术洞察/异构编程技术洞察.md" \
  "陈乐宁技术洞察/slidev-deck.md"
```

**输出**: `陈乐宁技术洞察/slidev-deck.md` (23 张幻灯片)

### 3. 构建静态 HTML

```bash
node build.js "陈乐宁技术洞察/异构编程技术洞察.md" \
  "陈乐宁技术洞察/presentation.html" \
  --mode build
```

## 🌐 网络访问

### 当前状态
- Slidev 监听: `127.0.0.1:3030` (仅本机)
- 反向代理: `0.0.0.0:3031` → `localhost:3030`

### 访问地址
```
Local (direct):     http://localhost:3030
Local (proxy):      http://localhost:3031
Network (proxy):    http://192.168.136.125:3031
```

### 启动代理
```bash
node proxy-server.js
```

## 📝 配置文件

### slidev.config.ts
```typescript
import { defineConfig } from '@slidev/cli'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3030,
    strictPort: true
  },
  vite: {
    server: {
      host: '0.0.0.0',
      port: 3030
    }
  }
})
```

### vite.config.ts
```typescript
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3030
  }
})
```

**注意**: 配置文件目前未完全生效，Slidev CLI 不支持 `--host` 参数

## 🎯 最佳实践

### 推荐工作流

1. **编辑源文件**: `陈乐宁技术洞察/异构编程技术洞察.md`
2. **生成预览**:
   ```bash
   node build.js "陈乐宁技术洞察/异构编程技术洞察.md"
   ```
3. **浏览器访问**: http://localhost:3030
4. **实时重载**: 保存 markdown 自动刷新

### 导出为独立文件

```bash
# 生成 Slidev Markdown（可手动编辑）
node scripts/slidev-generator.js \
  "陈乐宁技术洞察/异构编程技术洞察.md" \
  "陈乐宁技术洞察/slidev-deck.md"

# 启动 Slidev（使用生成的文件）
npx @slidev/cli "陈乐宁技术洞察/slidev-deck.md" --port 3030
```

## 🔧 技术细节

###幻灯片处理器 (SlideProcessor)

**状态管理**:
- `slides[]` - 存储所有幻灯片
- `currentSlide` - 当前正在处理的幻灯片
- `inCodeBlock` - 是否在代码块中
- `codeBlockContent` - 代码块内容缓冲

**处理流程**:
```javascript
1. 逐行扫描 Markdown
2. 检测代码块边界 (```)
3. 检测 H1/H2 标题
4. 检测 --- 分隔符
5. 累积内容到 currentSlide
6. 遇到分隔符时 finalizeSlide()
```

### Frontmatter 生成器

**配置来源**:
- `CONFIG` 对象定义默认值
- 可通过环境变量或参数覆盖

**字体配置**:
- Sans: 微软雅黑 (中文优先)
- Serif: 微软雅黑
- Mono: Consolas/Monaco/Courier New

## 📦 模块导出

**slidev-generator.js**:
```javascript
module.exports = {
  generateSlidevMarkdown  // 主生成函数
};
```

**build.js**:
```javascript
module.exports = {
  build,              // 主构建函数
  DEFAULT_CONFIG,     // 默认配置
  REVEAL_THEMES,      // Reveal.js 主题列表
  SLIDEV_THEMES       // Slidev 主题列表
};
```

## 🐛 已知限制

1. **网络访问**: Slidev CLI 不支持 `--host` 参数
   - 配置文件方式未生效
   - 需要使用反向代理

2. **主题安装**: 首次运行可能提示安装主题
   - seriph 是内置主题，应该不需要安装
   - 其他主题可能需要手动安装

3. **YAML 解析**: 复杂的 markdown 内容可能导致 YAML 错误
   - 避免在标题中使用特殊字符
   - 代码块内容保持原样

## 🔄 版本历史

### v3.1.1 (2025-01-27)
- ✅ 新增 `slidev-generator.js`
- ✅ 智能幻灯片分片
- ✅ 自动 frontmatter 生成
- ✅ 代码块保护

### v3.1.0
- ✅ 默认开发模式
- ✅ Vue 组件示例
- ✅ 内容滚动优化

### v3.0.0
- ✅ 双框架支持
- ✅ 微软雅黑字体

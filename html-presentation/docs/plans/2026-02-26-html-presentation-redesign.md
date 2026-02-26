# HTML-Presentation 全面重构设计文档

**版本：** 2.0
**日期：** 2026-02-26
**作者：** Claude Code + 陈乐宁
**状态：** 设计完成，待实施

---

## 文档概述

### 目的

重新设计 html-presentation skill，解决当前系统存在的所有已知问题，采用 LLM + 渲染验证反馈循环架构，确保生成的幻灯片质量最高。

### 范围

- ✅ Markdown 到 Slidev 的转换
- ✅ 自定义布局系统
- ✅ 内容溢出自动修复
- ✅ 实时预览和导出
- ❌ 不包括：Slidev 本身的修改
- ❌ 不包括：新主题开发

### 设计原则

1. **质量优先** - 生成美观、无溢出的幻灯片
2. **验证驱动** - 基于实际渲染效果，而非文本统计
3. **自动化** - 无需人工调整
4. **可配置** - 允许用户控制行为
5. **人工干预** - 自动修复失败时支持人工介入

---

## 第 1 部分：问题分析

### 1.1 问题分类

#### 问题类别 1：布局系统不兼容 🚨 严重

**问题描述：**
- 代码使用了自定义布局：`code-focus`, `two-col`, `image-focus`, `code-full`, `image-full`, `two-col-image`
- 标准 Slidev 主题（如 `@slidev/theme-seriph`）不支持这些布局
- 生成时出现警告：`Unknown layout "code-focus"`, `Unknown layout "two-col"`

**影响：**
- 幻灯片使用默认布局，视觉效果不符合预期
- 特定内容类型（代码密集、两列）的幻灯片失去优化布局

**根本原因：**
- LayoutEngine 定义了 11 种自定义布局
- 但这些布局组件从未被创建
- 与 Slidev 标准布局命名不匹配（如 `two-cols` vs `two-col`）

#### 问题类别 2：内容溢出 🚨 严重

**问题描述：**
- 图片超出幻灯片边界
- 表格水平溢出
- 代码块垂直溢出
- 长文本没有正确换行

**具体案例：**
- Slide 4（理论基础）：对比卡片 + 代码块 → 垂直溢出 1.6x
- 大图片使用 `width: 100%` 而无约束

**影响：**
- 内容被截断，无法完整显示
- 幻灯片不专业，影响演示效果

**根本原因：**
- 全局 CSS 缺少约束规则
- LLM 生成时无法看到实际渲染效果
- 仅基于文本统计（字符数、行数）预测布局

#### 问题类别 3：审美质量不稳定 ⚠️ 中等

**问题描述：**
- 布局不平衡（元素分布不均）
- 视觉层次不清晰（标题、正文比例失调）
- 留白不足（内容过于拥挤）
- 颜色、字体、间距不协调

**影响：**
- 幻灯片看起来不专业
- 观众体验不佳

**根本原因：**
- LLM 无法看到实际渲染效果
- 仅通过文本内容推测视觉效果
- 缺少美学验证机制

#### 问题类别 4：性能问题 ⚠️ 中等

**问题描述：**
- 每次启动都需要重新分析
- 重复的 LLM API 调用
- 无缓存机制

**影响：**
- 生成速度慢
- API 调用成本高

#### 问题类别 5：开发体验 ℹ️ 轻微

**问题描述：**
- CLI 命令不够直观
- 错误提示不明确
- 调试困难

### 1.2 问题优先级矩阵

| 问题类别 | 严重程度 | 影响范围 | 优先级 |
|---------|---------|---------|--------|
| 布局系统不兼容 | 🚨 高 | 所有使用自定义布局的幻灯片 | P0 |
| 内容溢出 | 🚨 高 | 图片/表格/代码块较多的幻灯片 | P0 |
| 审美质量 | ⚠️ 中 | 所有幻灯片 | P1 |
| 性能问题 | ⚠️ 中 | 重复生成场景 | P1 |
| 开发体验 | ℹ️ 低 | 开发者 | P2 |

### 1.3 已有但未完成的设计

现有文档中已有溢出验证系统设计（`docs/plans/2026-02-24-slidev-overflow-verification-design.md`），但未实现。本次重构将完整实现该设计并扩展。

---

## 第 2 部分：架构设计

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    HTML-Presentation 2.0                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │   CLI 入口    │──────▶│  配置管理器   │                    │
│  │  (cli.js)    │      │ (ConfigMgr)  │                    │
│  └──────────────┘      └──────┬───────┘                    │
│                                │                             │
│                                ▼                             │
│  ┌─────────────────────────────────────────────────┐       │
│  │              幻灯片生成流程                        │       │
│  │  ┌────────────┐    ┌──────────────┐            │       │
│  │  │内容分析器   │───▶│布局选择器     │            │       │
│  │  │(Analyzer)  │    │(LayoutSel)   │            │       │
│  │  └────────────┘    └──────┬───────┘            │       │
│  │                           │                      │       │
│  │                           ▼                      │       │
│  │                  ┌──────────────┐              │       │
│  │                  │LLM 初始生成器 │              │       │
│  │                  │(LLMGen)      │              │       │
│  │                  └──────┬───────┘              │       │
│  │                         │                      │       │
│  │                         ▼                      │       │
│  │                  ┌──────────────┐              │       │
│  │                  │验证修复循环   │◀──────┐     │       │
│  │                  │(VerifyFix)   │       │     │       │
│  │                  └──────┬───────┘       │     │       │
│  │                         │               │     │       │
│  │         ┌───────────────┼───────────────┤     │       │
│  │         ▼               ▼               ▼     │       │
│  │  ┌──────────┐    ┌──────────┐   ┌─────────┐ │       │
│  │  │Slidev    │    │Puppeteer │   │LLM      │ │       │
│  │  │渲染器    │    │截图器    │   │评判器   │ │       │
│  │  └──────────┘    └──────────┘   └─────────┘ │       │
│  └─────────────────────────────────────────────────┘       │
│                          │                                   │
│                          ▼                                   │
│                   ┌──────────────┐                          │
│                   │  输出管理器   │                          │
│                   │(OutputMgr)  │                          │
│                   └──────┬───────┘                          │
│                          │                                   │
│                          ▼                                   │
│                   ┌──────────────┐                          │
│                   │  .slides.md  │                          │
│                   └──────────────┘                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件说明

#### ContentAnalyzer（内容分析器）

**职责：**
- 解析输入 Markdown
- 提取内容特征（代码比例、图片数量、文本长度）
- 识别内容类型（标题、列表、表格、代码块）
- 输出结构化内容元数据

**输入：** 原始 Markdown 文件
**输出：** `ContentMetadata` 对象

#### LLMInitialGenerator（LLM 初始生成器）

**职责：**
- 调用 LLM 生成每张幻灯片的 Markdown
- 使用优化的 prompt（包含布局指导）
- 处理特殊场景（代码密集、图片密集）

#### VerifyFixLoop（验证修复循环）

**职责：**
- 协调渲染、截图、评判、修复流程
- 控制循环次数（最多 3 轮自动修复 + 人工干预）
- 记录尝试历史
- 检测修复循环（内容哈希）

**关键改进：** 支持人工干预，记录所有尝试方案

#### SlidevRenderer（Slidev 渲染器）

**职责：**
- 启动临时 Slidev 服务器
- 渲染单张幻灯片
- 提供访问 URL
- 管理服务器生命周期

**特性：** 服务器池（复用实例）、端口管理、超时控制

#### PuppeteerCapturer（Puppeteer 截图器）

**职责：**
- 使用 Puppeteer 访问幻灯片 URL
- 等待渲染完成
- 截取全屏截图
- 返回图片 Buffer

#### LLMJudge（LLM 评判器）

**职责：**
- 接收截图作为输入
- 使用视觉分析模型评判
- 输出结构化评判结果

**评判维度：**
1. 布局平衡（0-100）
2. 视觉层次（0-100）
3. 留白（0-100）
4. 可读性（0-100）
5. 整体美观（0-100）

#### LLMFixer（LLM 修复器）

**职责：**
- 接收原始内容和评判反馈
- 生成修复后的 Markdown
- 保持内容语义不变
- 仅调整布局、样式、结构

#### HumanIntervention（人工干预管理器）⭐ 新增

**职责：**
- 收集自动修复失败的所有尝试信息
- 生成问题报告（截图 + 尝试历史）
- 提供交互式 CLI 界面供用户选择修复方案
- 记录用户的人工修复选择

#### ServerPool（服务器池）

**职责：**
- 复用 Slidev 服务器实例
- 优化：减少启动/关闭开销

---

## 第 3 部分：核心模块设计

### 3.1 模块清单

```
html-presentation/
├── core/                          # 核心模块
│   ├── content-analyzer.js        # 内容分析器
│   ├── slide-generator.js         # 幻灯片生成器
│   ├── layout-selector.js         # 布局选择器
│   ├── llm-initial-generator.js   # LLM 初始生成器
│   ├── verify-fix-loop.js         # 验证修复循环
│   ├── slidev-renderer.js         # Slidev 渲染器
│   ├── puppeteer-capturer.js      # Puppeteer 截图器
│   ├── llm-judge.js               # LLM 评判器
│   ├── llm-fixer.js               # LLM 修复器
│   ├── human-intervention.js      # 人工干预管理器
│   ├── server-pool.js             # 服务器池
│   ├── cache-manager.js           # 缓存管理器
│   └── attempt-history.js         # 尝试历史记录器
├── agents/                        # LLM Agents
│   ├── slide-judge.md             # 评判 Prompt
│   ├── slide-fixer.md             # 修复 Prompt
│   └── initial-generator.md       # 初始生成 Prompt
└── utils/                         # 工具函数
    ├── markdown-parser.js         # Markdown 解析
    ├── screenshot-compare.js      # 截图对比
    └── report-generator.js        # 报告生成器
```

### 3.2 VerifyFixLoop 核心实现

```javascript
class VerifyFixLoop {
  async verify(markdown, options) {
    const history = [];
    let current = markdown;

    // 自动修复阶段（最多3轮）
    for (let i = 0; i < options.maxIterations; i++) {
      // 渲染
      const rendered = await this.render(current);

      // 截图
      const screenshot = await this.capture(rendered);

      // 评判
      const judgment = await this.judge(screenshot);

      // 记录
      history.push({
        iteration: i + 1,
        approach: judgment.approach,
        score: judgment.score,
        issues: judgment.issues,
        screenshot: screenshot.path
      });

      // 判断
      if (judgment.score >= this.threshold) {
        return { markdown: current, success: true, attempts: history };
      }

      // 修复
      current = await this.fix(current, judgment);

      // 检测循环
      if (this.isLoop(current, history)) {
        break;
      }
    }

    // 人工干预
    if (options.interactive) {
      return await this.humanIntervention.handle(current, history);
    }

    // 返回最佳结果
    return {
      markdown: current,
      success: false,
      attempts: history
    };
  }
}
```

### 3.3 尝试历史记录格式

```javascript
{
  slideNumber: 4,
  slideTitle: "理论基础",
  attempts: [
    {
      iteration: 1,
      timestamp: "2026-02-26T11:00:00Z",
      approach: "LLM suggested: Use two-column layout with code on right",
      score: 65,
      issues: ["Content overflow 1.6x", "Table too wide"],
      screenshot: "/tmp/slide4-attempt1.png",
      markdownHash: "abc123..."
    }
  ],
  finalResult: {
    status: "manual_intervention",
    userChoice: "edit_manually",
    finalScore: 85,
    manualEdits: "Reduced font size, added max-width to table"
  }
}
```

---

## 第 4 部分：数据流设计

### 4.1 整体数据流

```
用户输入 (input.md)
    │
    ▼
Phase 1: 分析阶段
    ContentAnalyzer.analyze()
    │
    ▼
Phase 2: 生成阶段
    对每个 section 和 content：
    │
    ├─▶ LLM 初始生成
    │
    └─▶ 验证修复循环（最多3轮）
        ├─▶ 渲染 (SlidevRenderer)
        ├─▶ 截图 (PuppeteerCapturer)
        ├─▶ 评判 (LLMJudge)
        ├─▶ 修复 (LLMFixer)
        └─▶ 人工干预 (HumanIntervention)
    │
    ▼
Phase 3: 组装阶段
    生成最终 .slides.md 文件
    │
    ▼
Phase 4: 报告生成
    生成 .slides-fix-report.json
```

### 4.2 核心数据结构

#### ContentMetadata

```javascript
{
  totalSlides: number,
  sections: Section[],
  metrics: {
    avgCodeRatio: number,
    avgImageRatio: number,
    avgTextRatio: number,
    hasTables: boolean,
    hasLongText: boolean
  }
}
```

#### Judgment（评判结果）

```javascript
{
  score: number,           // 0-100
  layout: number,          // 0-100
  hierarchy: number,       // 0-100
  whitespace: number,      // 0-100
  readability: number,    // 0-100
  issues: string[],
  approach: string,
  needsFix: boolean
}
```

---

## 第 5 部分：API 设计

### 5.1 CLI 命令

```bash
# 生成演示文稿
node cli.js generate <input.md> [options]

选项：
  -o, --output <file>       输出文件路径
  -t, --theme <theme>       Slidev 主题
  --interactive            启用人工干预模式
  --no-verify              禁用验证修复
  --max-iterations <n>     最大自动修复轮数（默认：3）
  --threshold <score>      及格分数阈值（默认：80）
  --verbose               显示详细日志
  --cache                 启用缓存（默认：true）
```

### 5.2 编程接口

```javascript
const { SlideGenerator } = require('./lib');

const generator = new SlideGenerator({
  theme: 'seriph',
  interactive: false,
  verifyEnabled: true,
  maxIterations: 3,
  threshold: 80
});

const result = await generator.generate('slides.md', {
  output: 'output.slides.md'
});
```

### 5.3 Agent Prompts

#### Slide Judge Agent

评判幻灯片的视觉质量，从布局平衡、视觉层次、留白、可读性、整体美观五个维度打分（0-100），分数 >= 80 则不需要修复。

#### Slide Fixer Agent

根据评判反馈修复幻灯片，保持内容语义不变，仅调整布局、样式、结构。

---

## 第 6 部分：性能优化

### 6.1 性能目标

| 操作 | 目标时间 | 优化策略 |
|------|---------|---------|
| 单张幻灯片验证（含渲染+截图+LLM） | < 5s | 缓存、并行 |
| 完整演示文稿生成（70张，含验证） | < 10min | 缓存、并行 |
| 缓存命中时的重复生成 | < 10s | 三层缓存 |

### 6.2 三层缓存架构

```
L1: 内存缓存 (LRU, 100)    → 命中率: ~40%
L2: 磁盘缓存 (TTL: 1h)     → 命中率: ~30%
L3: 语义缓存 (向量相似度)  → 命中率: ~20%
总缓存命中率: ~90%
```

### 6.3 其他优化策略

- **服务器池复用**：复用 Slidev 服务器实例，节省启动时间
- **并行处理**：批量并行验证（实验性）
- **增量验证**：只验证修改过的幻灯片
- **智能截图**：只在必要时截图

### 6.4 性能提升预估

| 场景 | 当前 | 优化后 | 提升 |
|------|------|--------|------|
| 首次生成（70张，含验证） | 560s | 200s | 2.8x |
| 重复生成（缓存命中） | 560s | 30s | 18.7x |
| 小幅修改（5张） | 560s | 40s | 14x |

---

## 第 7 部分：测试策略

### 7.1 测试覆盖率目标

| 模块 | 目标覆盖率 | 优先级 |
|------|----------|--------|
| ContentAnalyzer | 90% | P0 |
| LayoutSelector | 95% | P0 |
| VerifyFixLoop | 80% | P0 |
| LLMJudge | 70% | P1 |
| LLMFixer | 70% | P1 |
| CacheManager | 85% | P1 |

**总体目标：** 75% 以上代码覆盖率

### 7.2 测试类型

- **单元测试（60%）**：核心模块独立测试
- **集成测试（30%）**：模块间交互测试
- **E2E 测试（10%）**：完整流程测试

---

## 第 8 部分：部署和运维

### 8.1 环境要求

- **Node.js**：>= 18.0.0
- **npm**：>= 9.0.0
- **操作系统**：Linux（推荐）、macOS、Windows (WSL2)

### 8.2 配置管理

**.env 文件：**
```bash
ANTHROPIC_API_KEY=sk-ant-xxx
VERIFY_ENABLED=true
VERIFY_MAX_ITERATIONS=3
VERIFY_THRESHOLD=80
CACHE_ENABLED=true
```

### 8.3 监控和日志

- **日志系统**：支持 debug、info、warn、error 四个级别
- **性能监控**：记录关键操作耗时
- **健康检查**：`node cli.js health`

---

## 第 9 部分：实施计划

### 9.1 分阶段实施

**Phase 1: 基础重构 (2周)**
- 核心模块重写
- 单元测试和文档

**Phase 2: 验证系统 (3周)**
- 渲染和截图
- LLM 集成
- 人工干预

**Phase 3: 性能优化 (2周)**
- 缓存系统
- 并行处理

**Phase 4: 部署和文档 (1周)**
- 环境配置
- 监控和日志
- 用户文档

### 9.2 发布计划

- **v2.0.0-alpha.1** (Week 2): 基础重构完成
- **v2.0.0-beta.1** (Week 5): 验证系统完成
- **v2.0.0-rc.1** (Week 7): 性能优化完成
- **v2.0.0** (Week 8): 正式发布

### 9.3 验收标准

#### Phase 1 验收
- ✅ 能从 Markdown 生成基础幻灯片
- ✅ 单元测试覆盖率 > 70%

#### Phase 2 验收
- ✅ 验证系统功能完整
- ✅ 人工干预流程可用
- ✅ LLM 评判准确率 > 80%

#### Phase 3 验收
- ✅ 缓存命中率 > 85%
- ✅ 首次生成 < 200s（70张）
- ✅ 重复生成 < 30s

#### Phase 4 验收
- ✅ 生产环境部署成功
- ✅ 文档完整

---

## 附录

### A. 参考文档

- 现有实现：`COMPLETE_SUMMARY.md`
- 溢出验证设计：`docs/plans/2026-02-24-slidev-overflow-verification-design.md`
- Slidev 官方文档：https://sli.dev/

### B. 问题修复方案总结

| 问题 | 修复方案 |
|------|---------|
| 布局系统不兼容 | 使用标准 Slidev 布局，创建布局映射表 |
| 内容溢出 | LLM + 渲染验证反馈循环，自动检测并修复 |
| 审美质量 | LLM 视觉评判，5个维度打分，低于阈值自动修复 |
| 性能问题 | 三层缓存（内存、磁盘、语义），服务器池复用 |
| 开发体验 | 交互式 CLI，详细日志，健康检查 |

### C. 关键改进点

1. ⭐ **人工干预机制** - 自动修复失败时提供多种处理选项
2. ⭐ **尝试历史记录** - 记录所有尝试的方案和结果
3. ⭐ **三层缓存** - 内存、磁盘、语义缓存，90% 命中率
4. ⭐ **服务器池** - 复用 Slidev 实例，减少启动开销
5. ⭐ **性能监控** - 完整的性能指标收集和报告

---

**文档结束**

下一步：调用 `writing-plans` skill 创建详细的实施计划。

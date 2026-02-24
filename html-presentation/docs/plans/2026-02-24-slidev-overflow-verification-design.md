# Slidev 幻灯片溢出自动修复系统设计文档

**日期:** 2026-02-24
**版本:** 1.0
**状态:** 设计完成，待实现

---

## 1. 问题陈述

### 1.1 根本原因

当前架构使用 LLM 基于**文本统计**（字符数、行数等）预测幻灯片布局，但 LLM **看不到实际渲染效果**：

- LLM 看到：2000 字符，25 行
- LLM 无法看到：渲染后实际占用多少屏幕空间
- 结果：LLM 判断 "OK"，但实际溢出屏幕

**具体案例：**
- Slide 4（理论基础）：对比卡片 + 代码块 + 说明 → 垂直溢出 1.6x
- Slide 3（快速导航）：5个卡片 3+2 布局 → 布局不对称

### 1.2 解决方案核心思路

**实时渲染验证 + LLM 反馈循环：**
1. 生成每张幻灯片时立即渲染
2. Puppeteer 截图 + 收集基本数据
3. LLM 查看截图，判断美观程度
4. 如果需要修复，LLM 重新生成该幻灯片
5. 循环直到满意

**关键优势：**
- ✅ 验证驱动，基于实际效果
- ✅ LLM 可以评判美观，而不仅是溢出
- ✅ 自动修复，无需人工干预

---

## 2. 系统架构

### 2.1 整体流程

```
slidev-generator.js (处理每张幻灯片)
    ↓
for each slide:
  生成 slide markdown
  ↓
  verifyAndFix() [新增]
  ├─> SlideVerifier.verify()
  │    ├─> 启动临时 Slidev (端口 3031)
  │    ├─> Puppeteer 访问幻灯片
  │    ├─> 截图 + 收集基本数据
  │    └─> 返回 {screenshot, basicInfo}
  ├─> askLLMToJudge()
  │    ├─> 将截图发送给 LLM
  │    ├─> LLM 判断美观程度
  │    └─> 返回 {score, issues, needsFix}
  ├─> if needsFix:
  │    └─> LLMSlideFixer.fix()
  │         ├─> 告知 LLM 具体问题
  │         └─> LLM 重新生成 markdown
  └─> 循环（最多 3 轮）
  ↓
  添加到最终输出
```

### 2.2 核心组件

**SlideVerifier（渲染验证器）**
- 职责：渲染幻灯片并收集客观数据
- 输出：`{screenshot: Buffer, basicInfo: Object}`
- 不做主观判断，只收集数据

**LLMSlideFixer（LLM 修复器）**
- 职责：根据 LLM 判断修复幻灯片
- 输入：原始内容 + LLM 反馈
- 输出：修复后的 markdown

**ServerPool（服务器池）**
- 职责：复用 Slidev 服务器实例
- 优化：减少启动/关闭开销

---

## 3. 关键设计决策

### 3.1 LLM 主导的美学判断

**不是硬编码规则，而是让 LLM 评判美观：**

```javascript
// ❌ 不做这些硬编码判断
if (scrollHeight > windowHeight * 1.2) {
  return 'overflow';
}

// ✅ 让 LLM 自己判断
const judgment = await llm.seeScreenshotAndJudge({
  screenshot,
  context: '这是一个演示文稿幻灯片'
});
```

**LLM 检查的维度：**
1. 布局平衡 - 元素分布合理
2. 视觉层次 - 标题、正文比例协调
3. 留白 - 适当的呼吸空间
4. 可读性 - 字体、间距合适
5. 整体美观 - 综合评分 0-100

### 3.2 边生成边验证

**时机：** 生成每张幻灯片时立即验证

**优势：**
- 即时反馈，不用等全部生成完
- 可以边生成边修复
- 增量式，不依赖缓存

### 3.3 最多 3 轮优化

**循环控制：**
```javascript
for (let iteration = 0; iteration < 3; iteration++) {
  const judgment = await verify(slide);

  if (!judgment.needsFix) break;

  slide = await fix(slide);

  // 防止循环：检测内容哈希
  if (hash(slide) === previousHash) {
    console.warn('检测到修复循环，停止');
    break;
  }
}
```

### 3.4 错误处理和降级

**降级策略：**
- LLM 不可用 → 跳过验证，保留原样
- Puppeteer 失败 → 跳过该幻灯片
- 服务器启动失败 → 重试 3 次
- 修复超时 → 保持当前状态

---

## 4. 文件结构

### 4.1 新建文件

```
scripts/
├── overflow-verifier.js     # 渲染验证器
├── llm-slide-fixer.js        # LLM 修复器
├── server-pool.js            # 服务器池
└── verify-debug.js            # 调试工具

lib/
├── verifier-cache.js         # 验证缓存
└── visual-analyzer.js         # 视觉分析工具

agents/
└── slide-judgment.md         # LLM 判断 prompt
```

### 4.2 修改文件

```
scripts/
├── build.js                   # 集成验证流程
└── slidev-generator.js         # 添加 verifyAndFix() 调用
```

### 4.3 无新增依赖

- ✅ puppeteer 已在 devDependencies
- ✅ 复用现有的 llm-optimizer
- ✅ Node.js 内置模块

---

## 5. 配置选项

### 5.1 环境变量

```bash
# 是否启用验证（默认 true）
VERIFY_ENABLED=true

# 最多修复轮数（默认 3）
VERIFY_MAX_ITERATIONS=3

# 分数阈值（默认 80）
VERIFY_SCORE_THRESHOLD=80

# 验证超时（默认 15000ms）
VERIFY_TIMEOUT=15000

# 日志级别（默认 info）
VERIFY_LOG_LEVEL=info
```

### 5.2 命令行选项

```bash
# 默认：启用验证
node scripts/build.js slides.md

# 禁用验证
node scripts/build.js slides.md --no-verify

# 调试模式
node scripts/build.js slides.md --verify-debug
```

---

## 6. 实现优先级

### Phase 1: MVP
- [ ] 基本的溢出检测
- [ ] LLM 修复功能
- [ ] 错误降级

### Phase 2: 增强
- [ ] 服务器池优化
- [ ] 结果缓存
- [ ] 调试工具

---

## 7. 预期效果

**解决当前问题：**
- ✅ Slide 4 的溢出会被自动检测并修复
- ✅ Slide 3 的布局不对称会被 LLM 发现并优化
- ✅ 所有美观问题都会被标记

**性能影响：**
- 首次启动：~30-40 秒（检测 18 张幻灯片）
- 后续启动：~2 秒（使用缓存）
- 有溢出需要修复：额外 ~15-20 秒

**用户体验：**
- 幻灯片自动优化，无需手动调整布局
- 可以选择禁用验证以加快启动
- 详细的日志输出，了解优化过程

---

## 8. 风险和限制

### 8.1 风险

1. **LLM 主观性**：审美判断可能不稳定
   - 缓解：设置分数阈值，低于阈值才修复

2. **性能开销**：渲染 + LLM 调用需要时间
   - 缓解：提供禁用选项

3. **修复失败**：LLM 可能返回无效内容
   - 缓解：降级到保持原样

### 8.2 限制

1. **需要网络**：LLM API 调用需要网络连接
2. **需要 Puppeteer**：依赖浏览器自动化
3. **启动时间**：首次启动会变慢

---

## 9. 后续优化方向

1. **并行验证**：同时验证多张幻灯片
2. **增量验证**：只验证修改过的幻灯片
3. **学习模式**：记录用户的手动调整，让 LLM 学习
4. **预设模板**：针对常见问题提供修复模板

---

**附录：快速开始**

实现完成后使用方法：

```bash
# 默认启用验证
cd html-presentation
npm run dev slides.md

# 查看优化过程
node scripts/build.js slides.md

# 调试特定幻灯片
node scripts/verify-debug.js slides.md 3
```

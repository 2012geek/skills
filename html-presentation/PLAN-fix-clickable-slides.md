# 计划：修复 Slidev 点击展开功能

**日期**: 2026-02-02
**问题**: `<details>` 标签在 Slidev 中不被正确渲染

## 🔍 问题诊断

### 当前尝试
```markdown
<details open>
<summary>✅ 成功案例</summary>
[内容]
</details>
```

### 根本原因
经过研究 Slidev 官方文档，发现：
1. Slidev 基于 **markdown-it** 解析器
2. markdown-it 默认**不支持** `<details>` 标签
3. 即使 HTML 标签被解析，也可能被转义或样式不生效

### 官方文档引用
根据 [Slidev 动画指南](https://sli.dev/guide/animations)：
- Slidev 支持 **`v-click`** 指令用于点击显示/隐藏
- Slidev 支持 **`v-after`** 指令顺序显示元素
- Slidev 支持 **`v-clicks`** 指令用于列表逐步显示
- Slidev 支持 **`v-motion`** 指令实现复杂动画

## 💡 解决方案

### 方案 1：使用 `v-click` + `v-after`（官方推荐）

**实现方式**：
```markdown
#### 📊 实测效果

<!-- 默认显示成功案例 -->
<div v-click.hide>
**✅ 成功案例 - 发现语义问题**
[PR #46](...)
<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 350px;"/>
</div>

<!-- 误报案例：在第2次点击后显示 -->
<div v-click=2>
**❌ 误报案例 - shape 未定义**
[PR #46](...)
**问题现象**：
<img src="/images/df287dc9-87df-4d83-ad4f-39a9ef2e980e.png"/>
**根因定位**：
...
**解决方案**：
...
</div>

<!-- 漏报案例：在第3次点击后显示 -->
<div v-click=3>
**❌ 漏报案例 - classmethod 问题**
[PR #51](...)
[内容...]
</div>
```

**原理**：
- 第1次点击进入幻灯片：显示标题（其他内容隐藏）
- 第2次点击：显示成功案例
- 第3次点击：显示误报案例
- 第4次点击：显示漏报案例

---

### 方案 2：使用 `v-clicks` 列表（逐步显示）

**实现方式**：
```markdown
#### 📊 实测效果

<v-clicks>
<details>
<summary>✅ 成功案例 - 发现语义问题</summary>
[PR #46](...)
<img src="..."/>
</details>

<details>
<summary>❌ 误报案例 - shape 未定义</summary>
[PR #46](...)
</details>

<details>
<summary>❌ 漏报案例 - classmethod 问题</summary>
[PR #51](...)
</details>
</v-clicks>
```

**原理**：
- 每次点击展开一个 `<details>` 块
- 需要 Slidev 支持 `<details>` + Vue 的组合

---

### 方案 3：直接使用 v-click 分离内容（最简单）

**实现方式**：
```markdown
#### 📊 实测效果

<div v-click>
**✅ 成功案例 - 发现语义问题**
[PR #46](...)
<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 350px;"/>
</div>

<div v-click=2>
**❌ 误报案例 - shape 未定义**
[PR #46](...)
**问题现象**：
<img src="/images/df287dc9-87df-4d83-ad4f-39a9ef2e980e.png"/>
</div>

<div v-click=3>
**❌ 漏报案例 - classmethod 问题**
[PR #51](...)
</div>
```

---

## 📋 实施步骤

### 第1步：验证当前问题
- [ ] 在浏览器开发者工具中检查是否有 `<details>` 元素
- [ ] 检查是否有 `.slidev-vclick-target` class
- [ ] 确认问题是否是 CSS 样式未生效

### 第2步：应用官方解决方案
- [ ] 移除 `<details>` 标签
- [ ] 使用 `<div v-click>` + `<div v-click=N>` 替代
- [ ] 测试点击功能是否正常

### 第3步：优化样式
- [ ] 添加 `.slidev-vclick-target` 自定义样式
- [ ] 调整动画效果（如缩放、淡入淡出）
- [ ] 优化图片显示约束

### 第4步：验证与迭代
- [ ] 在浏览器中测试点击交互
- [ ] 确认所有内容都可访问
- [ ] 根据效果微调样式

## 🎯 推荐方案

**方案 1 + 方案 3 的组合**：

1. **成功案例**：默认显示（无需点击）
2. **误报案例**：第2次点击显示
3. **漏报案例**：第3次点击显示

## 📚 参考资料

- [Slidev 官方文档 - 动画指南](https://sli.dev/guide/animations)
- [Slidev GitHub - v-click 使用](https://github.com/slidevjs/slidev)
- [VueUse Motion - v-click 文档](https://motion.vueuse.org/)
- [MDN - HTML details 元素](https://developer.mozilla.org/zh-CN/docs/Web/HTML/Reference/Elements/details)

## ⚠️ 注意事项

1. **点击次数限制**：需要在 frontmatter 中配置 `clicks` 增加总点击数
2. **幻灯片切换**：确保点击不会意外切换到下一页
3. **性能考虑**：大量 `v-click` 可能影响性能
4. **浏览器兼容**：确保目标浏览器支持 Vue 3

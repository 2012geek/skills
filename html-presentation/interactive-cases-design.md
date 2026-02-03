# 点击展开式幻灯片设计方案

## 📋 设计原则

1. **逻辑完备性**：每个案例页面包含所有必要信息
2. **渐进式披露**：默认显示核心内容，详情可点击展开
3. **用户控制**：演讲者可选择展开哪些部分
4. **视觉简洁**：默认页面不过载

---

## 💡 方案 A：按子案例折叠（推荐 ⭐）

### 实现方式

```markdown
#### 📊 实测效果

<details>
<summary>✅ 成功案例 - 发现语义问题</summary>

[PR #46 - 发现实际问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46)

<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>
</details>

<details>
<summary>❌ 误报案例 - shape 未定义</summary>

[PR #46 - 误报问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46/diffs)

**问题现象**：
<img src="/images/df287dc9-87df-4d83-ad4f-39a9ef2e980e.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

**根因定位**：
Git 只获取了部分修改代码，导致上下文缺失
<img src="/images/c3aa1161-246c-4443-b145-83ca041d92bf.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

**解决方案**：
添加误报机制
<img src="/images/a4797cbe-b446-4644-abb4-195b193f290f.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>
</details>

<details>
<summary>❌ 漏报案例 - classmethod 问题</summary>

[PR #51 - 未发现的问题](https://gitcode.com/openeuler/lerobot_ros2/pull/51)

[代码...]

<img src="/images/684b95f9-6926-400c-83aa-86f959a064d3.png" style="max-height: 300px; width: 50%; object-fit: contain;"/>

**解决方案**：
添加专门的 agent 检查类方法问题
<img src="/images/edbfd903-2250-4521-850d-c1150e9a09ff.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>
</details>
```

### 优点
- ✅ 每个子案例独立折叠
- ✅ 用户可选择展开感兴趣的案例
- ✅ 默认页面简洁

### 缺点
- ⚠️ 展开后可能仍然很长

---

## 💡 方案 B：两级折叠（默认展开一个）

### 实现方式

```markdown
#### 📊 实测效果

<details open>
<summary>✅ 成功案例 - 发现语义问题</summary>

[默认展开的内容...]
</details>

<details>
<summary>❌ 误报案例 - shape 未定义</summary>

[默认折叠的内容...]
</details>

<details>
<summary>❌ 漏报案例 - classmethod 问题</summary>

[默认折叠的内容...]
</details>
```

### 优点
- ✅ 保留一个成功案例作为默认展示
- ✅ 其他案例可按需展开

### 缺点
- ⚠️ 需要手动添加 `open` 属性

---

## 💡 方案 C：分层折叠（最灵活）

### 实现方式

```markdown
#### 📊 实测效果

**✅ 成功案例** - [PR #46](https://gitcode.com/openeuler/lerobot_ros2/pull/46)
<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 300px"/>

---

<details>
<summary>📋 其他案例详情 (2个误报/漏报案例)</summary>

**❌ 误报案例 - shape 未定义**

[完整内容...]

---

**❌ 漏报案例 - classmethod 问题**

[完整内容...]
</details>
```

### 优点
- ✅ 默认显示成功案例吸引注意
- ✅ 其他案例归纳在一起

### 缺点
- ⚠️ 成功案例仍占用空间

---

## 💡 方案 D：Tab 切换式（最专业）

### 实现方式

使用 Slidev 的 Tab 功能（如果支持）或 HTML 标签页：

```markdown
#### 📊 实测效果

<div class="tabs">

<!-- Tab 1: 成功案例 -->
<div class="tab">

**✅ 成功案例 - 发现语义问题**

[内容...]

</div>

<!-- Tab 2: 误报案例 -->
<div class="tab">

**❌ 误报案例 - shape 未定义**

[内容...]

</div>

<!-- Tab 3: 漏报案例 -->
<div class="tab">

**❌ 漏报案例 - classmethod 问题**

[内容...]

</div>

</div>
```

### 优点
- ✅ 专业视觉效果
- ✅ 每个案例独立显示

### 缺点
- ⚠️ 需要自定义 CSS
- ⚠️ Slidev 对 tabs 支持有限

---

## 🎯 推荐实施策略

### 组合方案：A + B

1. **成功案例**：使用 `<details open>` 默认展开
2. **误报案例**：使用 `<details>` 默认折叠
3. **漏报案例**：使用 `<details>` 默认折叠
4. **系统架构**：保持原样（单个大图）
5. **调试坑**：使用 `<details>` 折叠

---

## 📝 实施清单

### 需要修改的文件
- `.slidev-v4-temp.md` - 所有案例页面
- `slidev.config.ts` - 添加 details 样式

### CSS 样式优化

```css
/* 优化 details/summary 样式 */
details {
  margin: 1em 0;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 0.5em;
}

summary {
  cursor: pointer;
  font-weight: bold;
  padding: 0.5em;
  user-select: none;
}

summary:hover {
  background-color: #f5f5f5;
}

details[open] > summary {
  border-bottom: 1px solid #e0e0e0;
  margin-bottom: 0.5em;
}

/* 图片在 details 内也遵守约束 */
details img {
  max-height: 350px !important;
}
```

---

## 🚀 实施优先级

1. **立即修复**（高优先级）
   - 为所有子案例添加 `<details>` 标签
   - 成功案例默认展开，其他折叠

2. **样式优化**（中优先级）
   - 添加 details/summary CSS
   - 优化折叠样式

3. **高级功能**（低优先级）
   - 添加 Tab 切换（如果需要）
   - 添加点击统计（演讲者知道哪些被展开）

# 演示文稿标题

**由 Claude Code 创建** - *使用 Slidev 框架*

---

## 功能特性

- ✅ **Markdown 编写** - 简单直观
- ✅ **代码高亮** - Shiki 语法高亮
- ✅ **Dev 模式** - 实时预览，完整工具栏
- ✅ **Vue 组件** - 完整支持

---

## 代码示例

```javascript
// 创建一个简单的 Web 服务器
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.json({ message: 'Hello, World!' });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

# 双栏布局

<div class="container">

<div class="column">

**优点**

- 轻量级
- 无需安装
- 跨平台
- 易于分享

</div>

<div class="column">

**应用场景**

- 技术分享
- 产品介绍
- 教学演示
- 会议报告

</div>

</div>

---

## 代码高亮支持

支持多种编程语言语法高亮：

```python
def greet(name):
    return f"Hello, {name}!"

print(greet("Claude"))
```

```bash
# Dev 模式预览
node skills/html-presentation/scripts/build.js slides.md

# 构建静态 HTML
node skills/html-presentation/scripts/build.js slides.md output.html --mode build
```

---

# 感谢观看

**Thank You!**

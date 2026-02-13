# Agent 推荐文档类别功能设计

日期: 2025-02-11
作者: Claude
状态: 设计中

## 背景

当前 gitcode-code-review skill 提交的行内评审评论中，"官方参考资料"章节经常缺失。原因是 `comment-formatter.js` 的 `addOfficialReferences` 函数只能匹配预定义的关键词，无法覆盖所有问题类型。

## 问题分析

### 现状
1. `OFFICIAL_REFERENCES` 库只包含有限的关键词（argparse, bool, shebang, file-io, security 等）
2. Agent 输出的 JSON 中没有 `references` 字段
3. 当遇到新类型的问题（如 Python dataclass 可变默认值）时，无法匹配到参考资料

### 根本原因
- Agent 具备识别问题类型的能力，但没有机制传递这些信息
- CommentFormatter 只能根据关键词匹配，无法理解语义

## 设计方案

### 核心思路
Agent 推荐文档类别 → CommentFormatter 填充具体 URL

### 架构图

```
┌─────────────────┐      referenceCategories      ┌──────────────────┐
│   Agent         │ ───────────────────────────▶ │ CommentFormatter │
│ (识别问题类型)   │                                │ (填充URL)        │
└─────────────────┘                                └──────────────────┘
                                                           │
                                                           ▼
                                                  ┌────────────────────┐
                                                  │ REFERENCE_CATEGORIES │
                                                  │   (类别→URL映射)    │
                                                  └────────────────────┘
```

## 实现细节

### 1. Agent 输出格式扩展

添加 `referenceCategories` 字段（可选）：

```json
{
  "issues": [{
    "file": "path/to/file.py",
    "line": 42,
    "type": "logic_error",
    "severity": "warning",
    "confidence": 85,
    "title": "问题标题",
    "description": "详细描述",
    "contextCode": "代码片段",
    "fix": { "code": "修复代码", "explanation": "说明" },
    "referenceCategories": ["python_dataclass", "python_threading"]
  }]
}
```

### 2. 支持的文档类别

| 类别 | 说明 | URL |
|------|------|-----|
| `python_dataclass` | Python dataclasses | https://docs.python.org/3/library/dataclasses.html |
| `python_threading` | Python threading | https://docs.python.org/3/library/threading.html |
| `python_field` | dataclasses.field() | https://docs.python.org/3/library/dataclasses.html#dataclasses.field |
| `python_async` | Python asyncio | https://docs.python.org/3/library/asyncio.html |
| `python_mutable_default` | 可变默认值反模式 | https://docs.python.org/3/faq/programming.html#how-do-i-write-a-function-with-output-arguments-call-by-reference |
| `argparse` | argparse 命令行解析 | https://docs.python.org/3/library/argparse.html |
| `shebang` | Shebang 行 | https://en.wikipedia.org/wiki/Shebang_(Unix) |
| `security` | 安全问题 | https://owasp.org/www-project-top-ten/ |
| `error_handling` | 错误处理 | https://github.com/ryanmcdermott/clean-code-javascript#error-handling |

### 3. CommentFormatter 修改

#### 3.1 扩展 REFERENCE_CATEGORIES

```javascript
const REFERENCE_CATEGORIES = {
  // 新增：Python 相关类别
  'python_dataclass': [
    { title: 'Python dataclasses 官方文档', url: 'https://docs.python.org/3/library/dataclasses.html' },
    { title: 'PEP 557 - Data Classes', url: 'https://peps.python.org/pep-0557/' }
  ],
  'python_threading': [
    { title: 'Python threading 官方文档', url: 'https://docs.python.org/3/library/threading.html' }
  ],
  'python_field': [
    { title: 'dataclasses.field() 官方文档', url: 'https://docs.python.org/3/library/dataclasses.html#dataclasses.field' }
  ],
  'python_mutable_default': [
    { title: 'Python FAQ: Mutable Default Arguments', url: 'https://docs.python.org/3/faq/programming.html#why-are-default-values-shared-between-objects' },
    { title: 'Effective Python: Item 26 - Avoid Mutable Defaults', url: 'https://effectivepython.com/2015/02/11/avoid-mutable-defaults/' }
  ],
  // ... 保留原有类别
};
```

#### 3.2 修改 addOfficialReferences 函数

```javascript
addOfficialReferences(issue, body) {
  // 如果用户提供了 references，优先使用
  if (issue.references && issue.referenceCategories.length > 0) {
    // Agent 提供了完整 references（包括 URL），直接使用
    body += `**官方参考资料**:\n`;
    for (const ref of this.deduplicateRefs(issue.references)) {
      body += `- [${ref.title}](${ref.url})\n`;
    }
    body += `\n`;
    return body;
  }

  const refs = [];

  // 1. 优先使用 Agent 推荐的类别
  if (issue.referenceCategories && Array.isArray(issue.referenceCategories)) {
    for (const category of issue.referenceCategories) {
      if (REFERENCE_CATEGORIES[category]) {
        refs.push(...REFERENCE_CATEGORIES[category]);
      }
    }
  }

  // 2. 如果没有类别推荐，使用关键词匹配作为后备
  if (refs.length === 0) {
    const content = (issue.title + issue.description + (issue.contextCode || '')).toLowerCase();
    // 原有关键词匹配逻辑...
  }

  // 3. 添加匹配到的参考资料
  if (refs.length > 0) {
    body += `**官方参考资料**:\n`;
    const uniqueRefs = this.deduplicateRefs(refs);
    for (const ref of uniqueRefs) {
      body += `- [${ref.title}](${ref.url})\n`;
    }
    body += `\n`;
  }

  return body;
}

deduplicateRefs(refs) {
  const seen = new Set();
  return refs.filter(ref => {
    if (seen.has(ref.url)) return false;
    seen.add(ref.url);
    return true;
  });
}
```

### 4. Agent Prompts 修改

需要在以下 agent 的输出格式说明中添加 `referenceCategories` 字段：

1. `bug-scanner-diff.md`
2. `bug-scanner-diff-2.md`
3. `code-analyzer.md`
4. `semantic-analyzer.md`
5. `python-classmethod-checker.md`

修改内容（在每个 agent 的"输出格式"章节）：

```markdown
## 输出格式

严格按照以下 JSON 格式输出：

```json
{
  "issues": [
    {
      "file": "path/to/file.py",
      "line": 42,
      "type": "logic_error",
      "severity": "warning",
      "confidence": 85,
      "title": "简短描述问题",
      "description": "详细说明为什么这是个问题",
      "contextCode": "相关代码片段",
      "fix": {
        "code": "修复代码",
        "explanation": "修复说明"
      },
      "referenceCategories": ["python_dataclass"]  // 可选：推荐的文档类别
    }
  ]
}
```

**字段说明**：

| 字段 | 说明 |
|------|------|
| referenceCategories | 可选字段。推荐的文档类别数组，系统将自动填充对应的官方文档链接 |

**支持的文档类别**（根据问题类型选择相关类别）：

| 类别 | 适用场景 |
|------|----------|
| `python_dataclass` | dataclass 相关问题 |
| `python_threading` | threading/多线程相关问题 |
| `python_field` | dataclasses.field() 相关 |
| `python_mutable_default` | 可变默认值反模式 |
| `python_async` | asyncio 异步编程 |
| `argparse` | argparse 命令行参数解析 |
| `shebang` | Shebang 行格式 |
| `security` | 安全问题 |
| `error_handling` | 错误处理 |
| `file-io` | 文件 I/O 操作 |

**注意**：如果不填写此字段，系统将根据关键词自动匹配参考资料。
```

## 实施计划

### Phase 1: Core Infrastructure
1. 修改 `lib/comment-formatter.js`
   - 扩展 `REFERENCE_CATEGORIES`
   - 修改 `addOfficialReferences` 函数
   - 添加 `deduplicateRefs` 辅助函数

### Phase 2: Agent Prompts
2. 修改以下 agent prompts（添加 `referenceCategories` 字段说明）：
   - `agents/bug-scanner-diff.md`
   - `agents/bug-scanner-diff-2.md`
   - `agents/code-analyzer.md`
   - `agents/semantic-analyzer.md`
   - `agents/python-classmethod-checker.md`

### Phase 3: Testing
3. 测试验证
   - 使用包含 `referenceCategories` 的 JSON 测试
   - 验证输出评论是否包含正确的官方参考资料

## 预期效果

修改后，当 Agent 发现 Python dataclass 可变默认值问题时，可以输出：

```json
{
  "file": "latency_prober.py",
  "line": 377,
  "type": "logic_error",
  "severity": "warning",
  "confidence": 85,
  "title": "dataclass 中使用可变默认值 threading.Lock()",
  "description": "...",
  "contextCode": "...",
  "fix": { ... },
  "referenceCategories": ["python_dataclass", "python_mutable_default", "python_threading"]
}
```

最终评论将包含：

```
⚠️ **dataclass 中使用可变默认值 threading.Lock()**

...

**官方参考资料**:
- [Python dataclasses 官方文档](https://docs.python.org/3/library/dataclasses.html)
- [PEP 557 - Data Classes](https://peps.python.org/pep-0557/)
- [Python FAQ: Mutable Default Arguments](https://docs.python.org/3/faq/programming.html#why-are-default-values-shared-between-objects)
- [Effective Python: Item 26 - Avoid Mutable Defaults](https://effectivepython.com/2015/02/11/avoid-mutable-defaults/)
- [Python threading 官方文档](https://docs.python.org/3/library/threading.html)

---
🤖 generated by ai@claude
```

## 向后兼容

- `referenceCategories` 是可选字段
- 如果 Agent 不提供此字段，系统回退到原有的关键词匹配逻辑
- 现有的 Agent 输出格式仍然有效

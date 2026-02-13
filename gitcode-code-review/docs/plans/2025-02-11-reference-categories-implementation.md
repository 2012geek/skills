# Agent Reference Categories 功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 gitcode-code-review skill 添加 Agent 推荐文档类别功能，使代码审查评论能够包含更准确的官方参考资料链接。

**Architecture:** Agent 在输出 JSON 时添加 `referenceCategories` 字段（推荐文档类别），CommentFormatter 根据类别从 `REFERENCE_CATEGORIES` 映射表中获取对应的官方文档 URL，实现 Agent 判断与 URL 填充的分离。

**Tech Stack:** Node.js (JavaScript), GitCode API, Markdown 格式化

---

## Overview

本功能解决当前代码审查评论中"官方参考资料"章节经常缺失的问题。具体实现：

1. **Agent 输出扩展**：添加可选的 `referenceCategories` 字段，用于推荐文档类别
2. **CommentFormatter 增强**：扩展 `REFERENCE_CATEGORIES` 库，修改 `addOfficialReferences` 函数支持类别匹配
3. **向后兼容**：`referenceCategories` 为可选字段，不提供时回退到原有关键词匹配

---

## Task 1: 扩展 comment-formatter.js 的 REFERENCE_CATEGORIES

**Files:**
- Modify: `gitcode-code-review/lib/comment-formatter.js:6-50`

**Step 1: 扩展 REFERENCE_CATEGORIES 对象**

在 `OFFICIAL_REFERENCES` 对象中添加新的文档类别映射：

```javascript
// 在 OFFICIAL_REFERENCES 对象中添加以下内容（第 50 行之前）

  // Python dataclass 相关
  'python_dataclass': [
    { title: 'Python dataclasses 官方文档', url: 'https://docs.python.org/3/library/dataclasses.html' },
    { title: 'PEP 557 - Data Classes', url: 'https://peps.python.org/pep-0557/' }
  ],
  'python_threading': [
    { title: 'Python threading 官方文档', url: 'https://docs.python.org/3/library/threading.html' },
    { title: 'Python threading.Lock() 说明', url: 'https://docs.python.org/3/library/threading.html#lock-objects' }
  ],
  'python_field': [
    { title: 'dataclasses.field() 官方文档', url: 'https://docs.python.org/3/library/dataclasses.html#dataclasses.field' }
  ],
  'python_async': [
    { title: 'Python asyncio 官方文档', url: 'https://docs.python.org/3/library/asyncio.html' }
  ],
  'python_mutable_default': [
    { title: 'Python FAQ: Mutable Default Arguments', url: 'https://docs.python.org/3/faq/programming.html#why-are-default-values-shared-between-objects' },
    { title: 'Effective Python: Avoid Mutable Defaults', url: 'https://effectivepython.com/2015/02/11/avoid-mutable-defaults/' }
  ],
```

**Step 2: 验证语法正确性**

Run: `node -c lib/comment-formatter.js`
Expected: 无输出（语法正确）

**Step 3: 提交**

```bash
git add lib/comment-formatter.js
git commit -m "feat: 扩展 REFERENCE_CATEGORIES 添加 Python dataclass/threading 相关类别"
```

---

## Task 2: 修改 comment-formatter.js 的 addOfficialReferences 函数

**Files:**
- Modify: `gitcode-code-review/lib/comment-formatter.js:132-198`

**Step 1: 添加 deduplicateRefs 辅助函数**

在 `CommentFormatter` 类中添加去重辅助方法（在 `addOfficialReferences` 方法之前）：

```javascript
  /**
   * 对参考资料列表进行去重（根据 URL）
   * @param {Array} refs - 参考资料数组
   * @returns {Array} 去重后的参考资料数组
   */
  deduplicateRefs(refs) {
    const seen = new Set();
    return refs.filter(ref => {
      if (seen.has(ref.url)) return false;
      seen.add(ref.url);
      return true;
    });
  }
```

**Step 2: 修改 addOfficialReferences 函数实现**

完全替换 `addOfficialReferences` 方法（第 135-198 行）：

```javascript
  /**
   * 根据问题类型和内容自动添加官方参考资料
   */
  addOfficialReferences(issue, body) {
    // 如果用户提供了完整的 references（包括 URL），优先使用
    if (issue.references && issue.references.length > 0) {
      body += `**官方参考资料**:\n`;
      const uniqueRefs = this.deduplicateRefs(issue.references);
      for (const ref of uniqueRefs) {
        body += `- [${ref.title}](${ref.url})\n`;
      }
      body += `\n`;
      return body;
    }

    const refs = [];

    // 1. 优先使用 Agent 推荐的类别
    if (issue.referenceCategories && Array.isArray(issue.referenceCategories)) {
      for (const category of issue.referenceCategories) {
        if (OFFICIAL_REFERENCES[category]) {
          refs.push(...OFFICIAL_REFERENCES[category]);
        }
      }
    }

    // 2. 如果没有类别推荐，使用关键词匹配作为后备
    if (refs.length === 0) {
      const content = (issue.title + issue.description + (issue.contextCode || '')).toLowerCase();

      // Python argparse / bool 相关
      if (content.includes('argparse') || content.includes('type=bool') || content.includes('add_argument')) {
        refs.push(...OFFICIAL_REFERENCES.argparse);
      }
      if (content.includes('bool') && content.includes('argparse')) {
        refs.push(...OFFICIAL_REFERENCES.bool);
      }

      // Shebang 相关
      if (content.includes('shebang') || content.includes('#!')) {
        refs.push(...OFFICIAL_REFERENCES.shebang);
      }

      // 文件 I/O 相关
      if (content.includes('file') || content.includes('path') || content.includes('os.path') || content.includes('open(')) {
        refs.push(...OFFICIAL_REFERENCES['file-io']);
      }

      // 安全相关
      if (issue.type === 'security' || content.includes('sql') || content.includes('inject') || content.includes('xss')) {
        if (content.includes('sql') && content.includes('inject')) {
          refs.push(...OFFICIAL_REFERENCES['sql-injection']);
        } else if (content.includes('xss')) {
          refs.push(...OFFICIAL_REFERENCES.xss);
        } else {
          refs.push(...OFFICIAL_REFERENCES.security);
        }
      }

      // JavaScript 异步相关
      if (content.includes('async') || content.includes('await') || content.includes('promise')) {
        refs.push(...OFFICIAL_REFERENCES.async);
      }
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
```

**Step 3: 验证语法正确性**

Run: `node -c lib/comment-formatter.js`
Expected: 无输出（语法正确）

**Step 4: 提交**

```bash
git add lib/comment-formatter.js
git commit -m "feat: 支持 referenceCategories 字段，Agent 可推荐文档类别"
```

---

## Task 3: 修改 bug-scanner-diff.md agent prompt

**Files:**
- Modify: `gitcode-code-review/agents/bug-scanner-diff.md:108-168`

**Step 1: 在输出格式中添加 referenceCategories 字段说明**

找到 `## 输出格式` 章节，在 JSON 格式示例中的 `description` 字段后添加：

```markdown
      "description": "详细说明为什么这是个问题",
      "referenceCategories": ["python_dataclass"],  // 可选：推荐的文档类别
```

**Step 2: 在字段说明表格后添加新字段说明**

在 `## 字段说明` 表格后添加：

```markdown
| referenceCategories | array | 否 | 推荐的文档类别数组，系统将自动填充对应的官方文档链接 |
```

**Step 3: 在输出格式前添加支持的文档类别说明**

在 `## 输出格式` 标题后添加：

```markdown
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

**Step 4: 提交**

```bash
git add agents/bug-scanner-diff.md
git commit -m "docs: bug-scanner-diff 添加 referenceCategories 字段说明"
```

---

## Task 4: 修改 bug-scanner-diff-2.md agent prompt

**Files:**
- Modify: `gitcode-code-review/agents/bug-scanner-diff-2.md:108-168`

**Step 1: 复制 Task 3 的修改内容**

应用与 bug-scanner-diff.md 相同的修改：
1. 在 JSON 示例中添加 `referenceCategories` 字段
2. 在字段说明表格中添加新行
3. 在输出格式后添加支持的文档类别说明

**Step 2: 提交**

```bash
git add agents/bug-scanner-diff-2.md
git commit -m "docs: bug-scanner-diff-2 添加 referenceCategories 字段说明"
```

---

## Task 5: 修改 code-analyzer.md agent prompt

**Files:**
- Modify: `gitcode-code-review/agents/code-analyzer.md:113-189`

**Step 1: 在输出格式中添加 referenceCategories 字段说明**

找到 `## 输出格式` 章节，修改 JSON 格式示例：

```json
{
  "issues": [
    {
      "file": "path/to/file.py",
      "line": 42,
      "type": "security|logic|performance|error_handling",
      "severity": "critical|error|warning",
      "confidence": 90,
      "title": "问题标题",
      "description": "详细说明问题及其影响",
      "contextCode": "相关代码片段（5-10行）",
      "fix": {
        "code": "修复代码",
        "explanation": "修复说明"
      },
      "referenceCategories": ["python_dataclass", "python_mutable_default"]
    }
  ]
}
```

**Step 2: 添加字段说明和类别列表**

在 `## 字段说明` 表格中添加：

```markdown
| referenceCategories | array | 否 | 推荐的文档类别数组，系统将自动填充对应的官方文档链接 |
```

在输出格式后添加支持的文档类别说明（同 Task 3 Step 3）。

**Step 3: 提交**

```bash
git add agents/code-analyzer.md
git commit -m "docs: code-analyzer 添加 referenceCategories 字段说明"
```

---

## Task 6: 修改 semantic-analyzer.md agent prompt

**Files:**
- Modify: `gitcode-code-review/agents/semantic-analyzer.md:161-218`

**Step 1: 在输出格式中添加 referenceCategories 字段说明**

修改 JSON 格式示例，添加 `referenceCategories` 和 `references` 字段：

```json
{
  "issues": [
    {
      "file": "examples/lekiwi/evaluate_dataset.py",
      "line": 37,
      "type": "logic_error",
      "severity": "error",
      "confidence": 90,
      "title": "问题标题",
      "description": "详细说明问题、原因和影响",
      "contextCode": "问题代码及其上下文",
      "fix": {
        "code": "修复后的代码",
        "explanation": "修复的思路和原理"
      },
      "referenceCategories": ["python_dataclass"],  // 推荐类别
      "references": [  // 或者直接提供完整引用
        {
          "title": "相关文档标题",
          "url": "https://docs.example.com/..."
        }
      ]
    }
  ]
}
```

**Step 2: 添加字段说明**

在 `## 字段说明` 表格中添加：

```markdown
| referenceCategories | array | 否 | 推荐的文档类别数组，系统将自动填充对应的官方文档链接 |
| references | array | 否 | 直接提供的参考资料（包含 title 和 url），优先级高于 referenceCategories |
```

添加支持的文档类别说明（同 Task 3 Step 3）。

**Step 3: 提交**

```bash
git add agents/semantic-analyzer.md
git commit -m "docs: semantic-analyzer 添加 referenceCategories 字段说明"
```

---

## Task 7: 修改 python-classmethod-checker.md agent prompt

**Files:**
- Modify: `gitcode-code-review/agents/python-classmethod-checker.md`

**Step 1: 查找输出格式章节**

使用 Grep 工具找到该文件的输出格式章节位置：

Run: `grep -n "## 输出格式\|## Output Format\|output format" agents/python-classmethod-checker.md`

**Step 2: 应用相同的修改**

参考 Task 3 的修改内容，添加 `referenceCategories` 相关说明。

**Step 3: 提交**

```bash
git add agents/python-classmethod-checker.md
git commit -m "docs: python-classmethod-checker 添加 referenceCategories 字段说明"
```

---

## Task 8: 创建测试用例

**Files:**
- Create: `gitcode-code-review/tests/test-comment-formatter.test.js`

**Step 1: 创建测试文件目录**

Run: `mkdir -p gitcode-code-review/tests`

**Step 2: 编写测试用例**

```javascript
const { CommentFormatter } = require('../lib/comment-formatter');

// Mock config
const config = {};

describe('CommentFormatter - referenceCategories', () => {
  let formatter;

  beforeEach(() => {
    formatter = new CommentFormatter(config);
  });

  describe('addOfficialReferences with referenceCategories', () => {
    test('should add references for python_dataclass category', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'dataclass mutable default',
        description: 'Using mutable default in dataclass',
        contextCode: 'lock: threading.Lock = threading.Lock()',
        referenceCategories: ['python_dataclass', 'python_mutable_default']
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).toContain('**官方参考资料**:');
      expect(result).toContain('Python dataclasses 官方文档');
      expect(result).toContain('https://docs.python.org/3/library/dataclasses.html');
    });

    test('should fallback to keyword matching when no referenceCategories', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'argparse type=bool error',
        description: 'Using type=bool in argparse',
        contextCode: 'parser.add_argument("--verbose", type=bool)'
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).toContain('**官方参考资料**:');
      expect(result).toContain('argparse');
    });

    test('should not add references when no match', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'unknown issue',
        description: 'Some random issue'
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).not.toContain('**官方参考资料**:');
    });
  });

  describe('deduplicateRefs', () => {
    test('should remove duplicate URLs', () => {
      const refs = [
        { title: 'Doc 1', url: 'https://example.com/1' },
        { title: 'Doc 2', url: 'https://example.com/2' },
        { title: 'Doc 1 Duplicate', url: 'https://example.com/1' }
      ];

      const result = formatter.deduplicateRefs(refs);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://example.com/1');
      expect(result[1].url).toBe('https://example.com/2');
    });
  });
});
```

**Step 3: 验证测试文件语法**

Run: `node -c tests/test-comment-formatter.test.js`
Expected: 无输出（语法正确）

**Step 4: 提交**

```bash
git add tests/test-comment-formatter.test.js
git commit -m "test: 添加 referenceCategories 功能的测试用例"
```

---

## Task 9: 运行测试验证

**Files:**
- Test: `gitcode-code-review/tests/test-comment-formatter.test.js`

**Step 1: 安装测试依赖（如果需要）**

Run: `cd gitcode-code-review && npm install --save-dev jest`

**Step 2: 配置 test script**

在 `package.json` 中添加（如果没有）：

```json
{
  "scripts": {
    "test": "jest"
  }
}
```

**Step 3: 运行测试**

Run: `npm test`

Expected: 测试通过

**Step 4: 如果测试失败，修复并重新运行**

Run: `npm test -- --verbose`

**Step 5: 提交**

```bash
git add package.json
git commit -m "test: 配置测试运行环境"
```

---

## Task 10: 创建手动测试 JSON

**Files:**
- Create: `gitcode-code-review/tests/fixtures/reference-categories-test.json`

**Step 1: 创建测试 fixture**

```json
[
  {
    "file": "src/lerobot/async_inference/latency_prober.py",
    "line": 14,
    "type": "logic_error",
    "severity": "warning",
    "confidence": 85,
    "title": "dataclass 中使用可变默认值 threading.Lock()",
    "description": "在 @dataclass 中使用 `lock: threading.Lock = threading.Lock()` 是一个 Python 反模式。默认值在类定义时创建一次，所有实例将共享同一个锁对象。",
    "contextCode": "@dataclass\nclass LatencyRecord:\n    lock: threading.Lock = threading.Lock()",
    "fix": {
      "code": "lock: threading.Lock = field(default_factory=threading.Lock)",
      "explanation": "使用 field(default_factory=threading.Lock) 确保每个实例获得独立的锁。"
    },
    "referenceCategories": ["python_dataclass", "python_mutable_default", "python_threading"]
  }
]
```

**Step 2: 提交**

```bash
git add tests/fixtures/reference-categories-test.json
git commit -m "test: 添加 referenceCategories 手动测试 fixture"
```

---

## Task 11: 端到端测试

**Files:**
- Test: `gitcode-code-review/scripts/gitcode-reviewer.js`

**Step 1: 使用测试 JSON 运行审查脚本**

Run: `node gitcode-code-review/scripts/gitcode-reviewer.js --pr 58 --issues-from-json gitcode-code-review/tests/fixtures/reference-categories-test.json --dry-run`

Expected: 输出包含 "官方参考资料" 章节

**Step 2: 验证输出内容**

检查输出是否包含以下内容：
- `**官方参考资料**:`
- `Python dataclasses 官方文档`
- `https://docs.python.org/3/library/dataclasses.html`
- `Python threading 官方文档`

**Step 3: 如果验证通过，提交文档更新**

```bash
git add docs/
git commit -m "docs: 更新 SKILL.md 说明 referenceCategories 功能"
```

---

## Task 12: 更新 SKILL.md 文档

**Files:**
- Modify: `gitcode-code-review/SKILL.md:133-197`

**Step 1: 在 JSON 文件格式说明中添加 referenceCategories 字段**

在 `### 5. JSON 文件格式` 章节的 JSON 示例中添加：

```markdown
**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | string | 是 | 文件路径（相对于仓库根目录） |
| line | number | 是 | 问题行号（在新文件中的行号） |
| type | string | 是 | 问题类型：bug, security, logic_error, api_misuse |
| severity | string | 是 | 严重程度：error, warning |
| confidence | number | 是 | 置信度 0-100，只报告 >= 80 |
| title | string | 是 | 问题标题 |
| description | string | 是 | 详细描述 |
| contextCode | string | 是 | 上下文代码 |
| fix | object | 是 | 修复方案（code + explanation） |
| referenceCategories | array | 否 | 推荐的文档类别（如 ["python_dataclass", "python_threading"]） |
| references | array | 否 | 直接提供的参考资料（包含 title 和 url） |
```

**Step 2: 在审

查输出章节添加说明**

在 `### 5. 审查输出` 章节添加：

```markdown
#### 自动添加官方参考资料

系统会根据问题类型自动添加相关的官方文档链接：

1. **Agent 推荐类别**：如果 Agent 输出包含 `referenceCategories` 字段，系统将根据类别匹配对应的官方文档
2. **关键词匹配**：如果 Agent 没有推荐类别，系统会根据关键词自动匹配
3. **直接提供**：Agent 也可以直接在 `references` 字段中提供完整的参考资料链接

**支持的文档类别**：

| 类别 | 说明 |
|------|------|
| python_dataclass | Python dataclasses 相关 |
| python_threading | Python threading 多线程相关 |
| python_field | dataclasses.field() 相关 |
| python_mutable_default | 可变默认值反模式 |
| python_async | Python asyncio 异步编程 |
| argparse | argparse 命令行参数解析 |
| shebang | Shebang 行格式 |
| security | 安全问题 |
| error_handling | 错误处理 |
```

**Step 3: 提交**

```bash
git add SKILL.md
git commit -m "docs: 更新 SKILL.md 说明 referenceCategories 功能"
```

---

## Task 13: 更新 README.md

**Files:**
- Modify: `gitcode-code-review/README.md`

**Step 1: 在特性说明中添加 referenceCategories 功能**

在 README 的功能特性章节添加：

```markdown
### Agent 推荐文档类别

Agent 可以推荐文档类别，系统自动填充对应的官方文档链接：

```json
{
  "referenceCategories": ["python_dataclass", "python_mutable_default"]
}
```

输出评论将包含：

```
**官方参考资料**:
- [Python dataclasses 官方文档](https://docs.python.org/3/library/dataclasses.html)
- [Python FAQ: Mutable Default Arguments](...)
```
```

**Step 2: 提交**

```bash
git add README.md
git commit -m "docs: 更新 README.md 说明 referenceCategories 功能"
```

---

## Summary

完成以上 13 个任务后，gitcode-code-review skill 将具备以下能力：

1. **Agent 推荐**：5 个 agent 都可以推荐文档类别
2. **URL 映射**：CommentFormatter 根据类别自动填充官方文档 URL
3. **向后兼容**：`referenceCategories` 为可选字段，不提供时回退到关键词匹配
4. **扩展性强**：新的文档类别可以轻松添加到 `REFERENCE_CATEGORIES` 中

**文件修改清单**：
- `lib/comment-formatter.js` - 核心逻辑
- `agents/bug-scanner-diff.md` - Agent prompt
- `agents/bug-scanner-diff-2.md` - Agent prompt
- `agents/code-analyzer.md` - Agent prompt
- `agents/semantic-analyzer.md` - Agent prompt
- `agents/python-classmethod-checker.md` - Agent prompt
- `tests/test-comment-formatter.test.js` - 测试用例
- `tests/fixtures/reference-categories-test.json` - 测试数据
- `SKILL.md` - 文档
- `README.md` - 文档

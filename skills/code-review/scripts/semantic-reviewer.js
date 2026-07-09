#!/usr/bin/env node

/**
 * 基于 Claude 语义理解的代码检视工具
 *
 * 核心思想：
 * 1. 不使用固定规则，而是让 Claude 理解代码的语义和上下文
 * 2. 通过分析 PR 的完整上下文（标题、描述、代码变更）进行智能检视
 * 3. 检视重点是：代码意图、逻辑正确性、边界条件、潜在风险、可维护性
 * 4. 支持**行内评论**：将检视意见创建在对应的代码行上
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');

// 配置文件路径
const CONFIG_PATH = path.join(process.cwd(), 'config.json');
const DEFAULT_CONFIG = {
  gitcode: {
    token: '',
    owner: 'openeuler',
    repo: 'lerobot_ros2',
    baseUrl: 'https://api.gitcode.com'
  },
  codeReview: {
    outputDir: './review-reports',
    autoSubmit: true
  }
};

/**
 * GitCode API 封装
 */
class GitCodeAPI {
  constructor(config) {
    this.config = config.gitcode;
    this.headers = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Semantic-Code-Review/2.0'
    };
  }

  async request(endpoint, options = {}) {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);

    const requestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        ...this.headers,
        ...options.headers
      }
    };

    if (options.body) {
      requestOptions.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data);
            if (res.statusCode !== 200 && res.statusCode !== 201) {
              reject(new Error(`API 请求失败: ${res.statusCode} - ${JSON.stringify(jsonData)}`));
            } else {
              resolve(jsonData);
            }
          } catch (e) {
            resolve({ data });
          }
        });
      });

      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  }

  async getPR(prNumber) {
    return await this.request(`/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`);
  }

  async getPRFiles(prNumber) {
    return await this.request(`/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/files`);
  }

  /**
   * 提交行内评论（评论在特定代码行）
   * POST /api/v5/repos/{owner}/{repo}/pulls/{number}/comments
   *
   * body: 评论内容
   * path: 文件路径
   * position: diff 中的位置（从1开始）
   * commit_id: PR head commit 的 SHA
   * line: 可选，具体行号
   */
  async submitInlineComment(prNumber, comment) {
    const payload = {
      body: comment.body,
      path: comment.path,
      position: comment.position,
      commit_id: comment.commitId
    };

    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  /**
   * 提交整体评论（PR 级别）
   */
  async submitPRComment(prNumber, body) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ body })
      }
    );
  }

  /**
   * 批量提交评论
   */
  async submitBatchComments(prNumber, comments) {
    const results = [];
    for (const comment of comments) {
      try {
        const result = await this.submitInlineComment(prNumber, comment);
        results.push({ success: true, comment, result });
        console.log(`  ✅ 已提交行内评论: ${comment.path}:${comment.position}`);
      } catch (error) {
        results.push({ success: false, comment, error: error.message });
        console.log(`  ❌ 提交失败: ${comment.path}:${comment.position} - ${error.message}`);
      }
    }
    return results;
  }
}

/**
 * 检视意见解析器
 * 从 Claude 的检视输出中解析出结构化的行内评论
 */
class ReviewCommentParser {
  /**
   * 解析 diff 获取变更的行号
   */
  static parseDiffForPositions(patch) {
    const positions = [];
    if (!patch) return positions;

    const lines = patch.split('\n');
    let newPosition = 0; // 新文件中的行号
    let oldPosition = 0; // 旧文件中的行号
    let inHunk = false;
    let hunkOldStart = 0;
    let hunkNewStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 匹配 hunk 头: @@ -old_start,old_count +new_start,new_count @@
      const hunkMatch = line.match(/^@@\s+-(\d+),?\d*\s+\+(\d+),?\d*\s+@@/);
      if (hunkMatch) {
        hunkOldStart = parseInt(hunkMatch[1]);
        hunkNewStart = parseInt(hunkMatch[2]);
        oldPosition = hunkOldStart;
        newPosition = hunkNewStart;
        inHunk = true;
        continue;
      }

      if (!inHunk) continue;

      // 解析 diff 行
      if (line.startsWith('+') && !line.startsWith('++')) {
        // 新增行
        newPosition++;
        positions.push({
          type: 'added',
          oldLine: null,
          newLine: newPosition - 1,
          diffLine: i + 1,
          position: i + 1, // GitCode 的 position 是 diff 中的行号
          content: line.substring(1)
        });
      } else if (line.startsWith('-') && !line.startsWith('--')) {
        // 删除行
        oldPosition++;
        positions.push({
          type: 'removed',
          oldLine: oldPosition - 1,
          newLine: null,
          diffLine: i + 1,
          position: i + 1,
          content: line.substring(1)
        });
      } else if (line.startsWith(' ')) {
        // 上下文行
        newPosition++;
        oldPosition++;
        positions.push({
          type: 'context',
          oldLine: oldPosition - 1,
          newLine: newPosition - 1,
          diffLine: i + 1,
          position: i + 1,
          content: line.substring(1)
        });
      }
    }

    return positions;
  }

  /**
   * 从检视报告中解析行内评论
   *
   * 输入格式示例：
   * ```markdown
   * ## evaluate_dataset.py
   *
   * [L37] `parser.add_argument("--verbose", type=bool, ...)`
   * - 问题：type=bool 在 argparse 中不会按预期工作
   * - 建议：使用 action='store_true'
   *
   * [L45-48] 策略类型判断
   * - 问题：缺少默认策略处理
   * ```
   */
  static parseReviewComments(reviewText, files) {
    const comments = [];

    // 为每个文件构建 position 映射
    const filePositionsMap = new Map();
    for (const file of files) {
      if (!file.patch) continue;
      const positions = this.parseDiffForPositions(file.patch.diff || file.patch);
      filePositionsMap.set(file.filename, positions);
    }

    // 解析检视文本中的注释
    const lines = reviewText.split('\n');
    let currentFile = null;
    let currentComment = null;
    let lineNumber = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 检测文件标题 (## filename 或 ### filename)
      const fileMatch = line.match(/^#{2,3}\s+(.+?)(?:\s+\(|$)/);
      if (fileMatch) {
        const fileName = fileMatch[1].replace(/`/g, '').trim();
        // 尝试匹配实际文件名
        for (const filePath of filePositionsMap.keys()) {
          if (filePath.endsWith(fileName) || filePath.includes(fileName)) {
            currentFile = filePath;
            break;
          }
        }
        continue;
      }

      // 检测行号标记 [L37] 或 [L37-42] 或 `file.py:37`
      const lineMatch = line.match(/\[L(\d+)(?:-(\d+))?\]|`([^:]+):(\d+)/);
      if (lineMatch) {
        if (lineMatch[2] !== undefined) {
          lineNumber = parseInt(lineMatch[1]);
        } else if (lineMatch[3] !== undefined) {
          // file.py:37 格式
          const refFile = lineMatch[2];
          lineNumber = parseInt(lineMatch[3]);
          // 更新当前文件
          for (const filePath of filePositionsMap.keys()) {
            if (filePath.endsWith(refFile) || filePath.includes(refFile)) {
              currentFile = filePath;
              break;
            }
          }
        }
        continue;
      }

      // 检测代码块标记（可能包含代码和行号）
      const codeMatch = line.match(/`([^`]+):(\d+)`|`([^`]+)`/);
      if (codeMatch) {
        const codeRef = codeMatch[1] || codeMatch[3];
        const codeLine = codeMatch[2] ? parseInt(codeMatch[2]) : null;
        if (codeLine) {
          lineNumber = codeLine;
        }
      }

      // 收集评论内容
      if (line.startsWith('- ') || line.startsWith('*')) {
        const commentBody = line.substring(2);

        // 如果有文件和行号，创建行内评论
        if (currentFile && lineNumber) {
          const positions = filePositionsMap.get(currentFile);
          if (positions && positions.length > 0) {
            // 找到最接近的 position
            const pos = positions.find(p => p.newLine === lineNumber) ||
                       positions.find(p => p.oldLine === lineNumber) ||
                       positions.find(p => Math.abs(p.newLine - lineNumber) <= 3) ||
                       positions[0];

            comments.push({
              path: currentFile,
              body: commentBody,
              position: pos ? pos.diffLine : 1,
              line: lineNumber,
              commitId: null // 稍后填充
            });
          }
        }

        lineNumber = null; // 重置行号
      }
    }

    return comments;
  }

  /**
   * 解析 JSON 格式的检视意见
   * 支持新的详细格式：title, description, context_code, fix, references
   */
  static parseStructuredReview(reviewJson, files) {
    const comments = [];

    try {
      const review = typeof reviewJson === 'string' ? JSON.parse(reviewJson) : reviewJson;

      if (!review.comments || !Array.isArray(review.comments)) {
        return comments;
      }

      for (const comment of review.comments) {
        if (!comment.file || !comment.line) continue;

        // 找到对应文件的 position
        const fileData = files.find(f => f.filename === comment.file);
        if (!fileData || !fileData.patch) continue;

        const positions = this.parseDiffForPositions(fileData.patch.diff || fileData.patch);
        const pos = positions.find(p => p.newLine === comment.line) ||
                   positions.find(p => p.oldLine === comment.line) ||
                   positions.find(p => Math.abs(p.newLine - comment.line) <= 3) ||
                   positions[0];

        if (pos) {
          // 构建详细的评论内容
          let commentBody = '';

          // 添加标题（如果有）
          if (comment.title) {
            const severityIcon = {
              'error': '❌',
              'warning': '⚠️',
              'suggestion': '💡',
              'info': 'ℹ️'
            }[comment.severity] || '📝';

            commentBody += `${severityIcon} **${comment.title}**\n\n`;
          }

          // 添加描述
          if (comment.description) {
            commentBody += `${comment.description}\n\n`;
          } else if (comment.message) {
            commentBody += `${comment.message}\n\n`;
          }

          // 添加上下文代码
          if (comment.context_code && comment.context_code.code) {
            commentBody += `**上下文代码** (行 ${comment.context_code.start_line || comment.line}-${comment.context_code.end_line || comment.line}):\n`;
            commentBody += `\`\`\`\n${comment.context_code.code}\n\`\`\`\n\n`;
          }

          // 添加修复方案
          if (comment.fix) {
            commentBody += `**修复方案**:\n`;
            if (comment.fix.code) {
              commentBody += `\`\`\`\n${comment.fix.code}\n\`\`\`\n`;
            }
            if (comment.fix.explanation) {
              commentBody += `${comment.fix.explanation}\n`;
            }
            commentBody += `\n`;
          }

          // 添加参考资料
          if (comment.references && comment.references.length > 0) {
            commentBody += `**参考资料**:\n`;
            for (const ref of comment.references) {
              commentBody += `- [${ref.title}](${ref.url})\n`;
            }
            commentBody += `\n`;
          }

          comments.push({
            path: comment.file,
            body: commentBody.trim(),
            position: pos.diffLine,
            line: comment.line,
            commitId: null
          });
        }
      }
    } catch (error) {
      console.log('⚠️  解析结构化检视失败:', error.message);
    }

    return comments;
  }
}

/**
 * 基于 Claude 的语义代码检视
 */
class SemanticCodeReviewer {
  constructor(api, config) {
    this.api = api;
    this.config = config.codeReview;
  }

  /**
   * 构建检视上下文
   */
  buildReviewContext(pr, filesWithContent) {
    return {
      pr: {
        number: pr.number,
        title: pr.title,
        description: pr.body || '',
        author: pr.user.login,
        branch: `${pr.head.ref} → ${pr.base.ref}`,
        sha: pr.head.sha // 用于行内评论
      },
      changes: filesWithContent.map(f => ({
        path: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
        fullContent: f.fullContent  // 包含完整文件内容以避免幻觉
      }))
    };
  }

  /**
   * 构建语义检视提示词
   *
   * 输出包含：问题描述、上下文代码、修改方案、参考资料
   */
  buildReviewPrompt(context) {
    const { pr, changes } = context;

    return `# 代码检视任务 - 深度语义分析

你是一位经验丰富的代码审查专家。请对以下 Pull Request 进行深入的语义分析，并输出**结构化的行内评论**。

## PR 基本信息

- **编号**: #${pr.number}
- **标题**: ${pr.title}
- **描述**: ${pr.description || '(无描述)'}
- **作者**: ${pr.author}
- **分支**: ${pr.branch}

## 代码变更

${this.formatChangesForReview(changes)}

## 检视要求

请进行**深度语义分析**，每个问题必须包含：

### 1. 问题描述
- 清晰说明问题是什么
- 为什么这是个问题（影响的严重程度）
- 可能导致什么后果

### 2. 上下文代码
- 展示问题代码及其周围 3-5 行
- 帮助理解问题所在的代码上下文

### 3. 修改方案
- 提供可直接使用的修改后代码
- 说明修改的思路和原理

### 4. 参考资料（可选）
- 相关文档链接
- 最佳实践参考
- 类似问题的解决方案

## 分析重点

1. **逻辑正确性** - 代码是否真正解决问题？有无边界条件遗漏？
2. **潜在风险** - 运行时错误、安全问题、性能问题
3. **代码质量** - 可读性、命名、重复代码
4. **错误处理** - 异常处理是否充分
5. **API 使用** - 是否正确使用了库/框架的 API

## ⚠️ 重要：上下文验证

**在提出任何问题之前，必须验证以下内容**：
1. 变量是否已在文件中定义？查看完整文件上下文
2. 函数/方法是否属于某个类？查看类的定义
3. 导入语句是否完整？查看文件开头的 import 部分
4. 代码是否使用了外部库的标准用法？

**常见误报示例（请避免）**：
- ❌ "变量 shape 未定义" → 实际上 shape 在循环前面已定义
- ❌ "缺少导入" → 实际上导入在其他文件或延迟导入
- ❌ "API 使用错误" → 实际上是正确用法

**正确的做法**：
- ✅ 仔细阅读完整文件内容
- ✅ 理解变量作用域和生命周期
- ✅ 只有确认问题真实存在后才提出检视意见

## 输出格式

请严格按照以下 JSON 格式输出检视意见：

\`\`\`json
{
  "summary": "简要总结 PR 的目的和整体评价",
  "overall": "建议合并/有条件合并/不建议合并",
  "comments": [
    {
      "file": "examples/lekiwi/evaluate_dataset.py",
      "line": 37,
      "severity": "error",
      "title": "argparse 中 type=bool 参数无法正常工作",
      "description": "在 argparse 中使用 type=bool 不会按预期工作。 argparse 的 type 参数期望一个可调用对象来转换字符串值，bool() 函数对于任何非空字符串都返回 True（包括 \"false\"、\"0\" 等）。这意味着用户无法通过命令行参数正确关闭这个选项。",
      "context_code": {
        "start_line": 35,
        "end_line": 39,
        "code": "parser.add_argument(\\"--episode_idx\\", type=int, required=False, default=None)\nparser.add_argument(\\"--verbose\\", type=bool, required=False, default=False, help=\\"...\")\nparser.add_argument(\\"--next_steps\\", type=int, required=False, default=None)"
      },
      "fix": {
        "code": "parser.add_argument(\\"--verbose\\", action=\\"store_true\\", help=\\"Print all the actions\\")",
        "explanation": "使用 action='store_true' 是实现布尔开关的正确方式。当用户指定 --verbose 时，值为 True；不指定时，值为 False（默认值）。这是 argparse 处理布尔选项的标准模式。"
      },
      "references": [
        {
          "title": "Python argparse Documentation",
          "url": "https://docs.python.org/3/library/argparse.html#action"
        },
        {
          "title": "Why type=bool doesn't work in argparse",
          "url": "https://stackoverflow.com/questions/15008758/parsing-boolean-values-with-argparse"
        }
      ]
    },
    {
      "file": "examples/lekiwi/evaluate_dataset.py",
      "line": 101,
      "severity": "error",
      "title": "episode_idx 参数逻辑不一致",
      "description": "代码在 101 行使用 episode_idx 计算 from_idx，但下面的循环（127 行）会遍历所有 episode。这意味着即使用户指定了 episode_idx，实际处理时仍会处理全部数据，参数设置无效。",
      "context_code": {
        "start_line": 99,
        "end_line": 132,
        "code": "from_idx = dataset.meta.episodes[\\"dataset_from_index\\"][episode_idx if episode_idx is not None else 0]\nto_idx = dataset.meta.episodes[\\"dataset_to_index\\"][episode_idx if episode_idx is not None else -1]\n...\nfor epidx in range(len(dataset.meta.episodes)):\n    from_idx = dataset.meta.episodes[\\"dataset_from_index\\"][epidx]\n    to_idx = dataset.meta.episodes[\\"dataset_to_index\\"][epidx]\n    process_one_episode(from_idx, to_idx)"
      },
      "fix": {
        "code": "# 当指定 episode_idx 时，只处理指定的 episode\nif episode_idx is not None:\n    episode_indices = [episode_idx]\nelse:\n    episode_indices = range(len(dataset.meta.episodes))\n\nfor epidx in episode_indices:\n    from_idx = dataset.meta.episodes[\\"dataset_from_index\\"][epidx]\n    to_idx = dataset.meta.episodes[\\"dataset_to_index\\"][epidx]\n    process_one_episode(from_idx, to_idx)",
        "explanation": "修改循环逻辑：当用户指定 episode_idx 时，只遍历该单个 episode；未指定时，遍历所有 episode。移除前面单独计算 from_idx/to_idx 的代码，因为那段代码实际上没有作用。"
      },
      "references": []
    }
  ]
}
\`\`\`

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 问题标题，简洁概括 |
| description | string | 是 | 详细问题描述，说明原因和影响 |
| context_code | object | 是 | 问题代码上下文，包含 start_line、end_line、code |
| fix | object | 是 | 修复方案，包含 code（修复代码）和 explanation（解释） |
| references | array | 否 | 参考资料，每个包含 title 和 url |

**注意**：
- "line" 指的是**新文件中的行号**（不是 diff 中的位置）
- "severity" 分为：error（必须修复）、warning（强烈建议）、suggestion（建议）、info（提示）
- context_code 应包含问题行及其上下文（前后各 2-3 行）
- fix.code 应该是可以直接使用的完整代码片段

请开始深度检视并输出结构化 JSON：`;
  }

  /**
   * 格式化代码变更用于检视
   * 包含完整的文件上下文，避免幻觉
   */
  formatChangesForReview(changes) {
    if (changes.length === 0) return '无代码变更';

    return changes.map((file, index) => {
      let output = `### ${index + 1}. ${file.path}\n`;
      output += `**状态**: ${file.status} | **变更**: +${file.additions}/-${file.deletions}\n\n`;

      // 1. 显示 Diff
      if (file.patch) {
        const patchStr = typeof file.patch === 'string' ? file.patch : (file.patch.diff || '');
        if (patchStr && patchStr.length > 0) {
          // 限制 diff 长度，但保留关键信息
          const displayPatch = patchStr.length > 5000 ? patchStr.substring(0, 5000) + '\n... (截取)' : patchStr;
          output += `**Diff**:\n\`\`\`diff\n${displayPatch}\n\`\`\`\n\n`;
        }
      }

      // 2. 显示完整文件上下文（重要：避免幻觉）
      if (file.fullContent) {
        const lines = file.fullContent.split('\n');
        output += `**完整文件** (${lines.length} 行):\n`;
        output += `\`\`\`python\n${file.fullContent}\n\`\`\`\n\n`;
      }

      return output;
    }).join('\n');
  }

  /**
   * 获取文件的完整内容（包含上下文）
   */
  async getFullFileContent(filePath, ref) {
    try {
      const result = await this.api.request(
        `/api/v5/repos/${this.api.config.owner}/${this.api.config.repo}/contents/${filePath}?ref=${ref}`
      );
      if (result.content) {
        return Buffer.from(result.content, 'base64').toString('utf-8');
      }
      return null;
    } catch (error) {
      console.log(`  ⚠️  无法获取文件 ${filePath} 的完整内容: ${error.message}`);
      return null;
    }
  }

  /**
   * 执行语义检视（返回 prompt 供 Claude 处理）
   */
  async prepareReview(prNumber) {
    console.log(`\n📋 获取 PR #${prNumber} 详情...\n`);

    const pr = await this.api.getPR(prNumber);
    const files = await this.api.getPRFiles(prNumber);

    console.log(`📁 变更文件: ${files.length} 个`);
    console.log(`📜 正在获取完整文件内容以提供充分上下文...\n`);

    // 获取每个文件的 patch 和完整内容
    const filesWithContent = [];
    for (const file of files) {
      if (file.status === 'removed') continue;

      const fileData = {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        patch: file.patch
      };

      // 获取完整文件内容以提供上下文
      const fullContent = await this.getFullFileContent(file.filename, pr.head.sha);
      if (fullContent) {
        fileData.fullContent = fullContent;
        console.log(`  ✓ ${file.filename} (${fullContent.split('\n').length} 行)`);
      }

      filesWithContent.push(fileData);
    }

    const context = this.buildReviewContext(pr, filesWithContent);
    const prompt = this.buildReviewPrompt(context);

    // 保存到临时文件
    const tempDir = path.join(process.cwd(), '.temp-review');
    await fs.mkdir(tempDir, { recursive: true });

    const contextFile = path.join(tempDir, `pr-${prNumber}-context.json`);
    await fs.writeFile(contextFile, JSON.stringify(context, null, 2), 'utf-8');

    const promptFile = path.join(tempDir, `pr-${prNumber}-prompt.md`);
    await fs.writeFile(promptFile, prompt, 'utf-8');

    return {
      pr,
      files: filesWithContent,
      contextFile,
      promptFile,
      prompt,
      context
    };
  }

  /**
   * 提交检视评论到 GitCode
   */
  async submitComments(prNumber, reviewResult, files) {
    const comments = ReviewCommentParser.parseStructuredReview(reviewResult, files);

    if (comments.length === 0) {
      console.log('  ℹ️  没有需要提交的评论');
      return { success: true, comments: [] };
    }

    // 获取 PR 的 head SHA
    const pr = await this.api.getPR(prNumber);
    const commitId = pr.head.sha;

    // 添加 commitId 到每个评论
    const commentsWithCommit = comments.map(c => ({
      ...c,
      commitId
    }));

    console.log(`\n📤 准备提交 ${commentsWithCommit.length} 条行内评论...\n`);

    const results = await this.api.submitBatchComments(prNumber, commentsWithCommit);

    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ 成功提交 ${successCount}/${commentsWithCommit.length} 条评论`);

    return { success: true, comments: results };
  }

  /**
   * 从文件读取检视结果并提交
   */
  async submitReviewFromFile(prNumber, reviewResultFile, files) {
    try {
      const reviewContent = await fs.readFile(reviewResultFile, 'utf-8');
      const reviewResult = JSON.parse(reviewContent);

      return await this.submitComments(prNumber, reviewResult, files);
    } catch (error) {
      console.error(`❌ 读取检视结果失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 GitCode 语义代码检视工具 (行内评论版)\n');

  // 解析命令行参数
  const args = process.argv.slice(2);
  const options = {
    prNumber: null,
    submit: null
  };

  const prIndex = args.indexOf('--pr');
  if (prIndex !== -1 && args[prIndex + 1]) {
    options.prNumber = parseInt(args[prIndex + 1]);
  }

  // 提交模式：--submit 后面直接跟文件路径
  const submitIndex = args.indexOf('--submit');
  if (submitIndex !== -1 && args[submitIndex + 1]) {
    options.submit = args[submitIndex + 1];
  }

  if (!options.prNumber) {
    console.error('❌ 请指定 PR 编号: --pr <number>');
    console.error('\n使用方法:');
    console.error('  1. 准备检视: node semantic-reviewer.js --pr 46');
    console.error('  2. 提交评论: node semantic-reviewer.js --pr 46 --submit <review-json-file>');
    process.exit(1);
  }

  // 加载配置
  let config;
  try {
    const configContent = await fs.readFile(CONFIG_PATH, 'utf-8');
    config = { ...DEFAULT_CONFIG, ...JSON.parse(configContent) };
  } catch (error) {
    console.log('⚠️  未找到配置文件，使用默认配置');
    config = DEFAULT_CONFIG;
  }

  // 验证 token
  if (!config.gitcode.token) {
    console.error('❌ 错误: 请在 config.json 中配置 gitcode.token');
    process.exit(1);
  }

  // 创建实例
  const api = new GitCodeAPI(config);
  const reviewer = new SemanticCodeReviewer(api, config);

  try {
    if (options.submit) {
      // 提交模式：从文件读取检视结果并提交
      const { files } = await reviewer.prepareReview(options.prNumber);
      await reviewer.submitReviewFromFile(options.prNumber, options.submit, files);
    } else {
      // 准备模式：生成 prompt 供 Claude 分析
      const result = await reviewer.prepareReview(options.prNumber);

      console.log('='.repeat(60));
      console.log('📋 检视 Prompt 已准备');
      console.log('='.repeat(60));
      console.log('\n请将以下内容复制给 Claude 进行分析：\n');
      console.log('─'.repeat(60));
      console.log(result.prompt);
      console.log('─'.repeat(60));

      console.log(`\n💡 使用说明：`);
      console.log(`\n1. 将上面的 prompt 发送给 Claude`);
      console.log(`2. Claude 会返回 JSON 格式的检视结果`);
      console.log(`3. 将 JSON 结果保存到文件，例如 review-result.json`);
      console.log(`4. 运行以下命令提交评论：`);
      console.log(`\n   node semantic-reviewer.js --pr ${options.prNumber} --submit review-result.json\n`);
    }

  } catch (error) {
    console.error(`\n❌ 检视失败: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { GitCodeAPI, SemanticCodeReviewer, ReviewCommentParser };

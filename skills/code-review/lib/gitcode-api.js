/**
 * GitCode API 封装
 * 从 semantic-reviewer.js 提取，提供 GitCode API 调用能力
 */

const https = require('https');

/**
 * GitCode API 类
 */
class GitCodeAPI {
  constructor(config) {
    this.config = config.gitcode;
    this.headers = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Code-Review-Skill/2.0'
    };
  }

  /**
   * 发送 HTTP 请求
   */
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
            // 如果不是 JSON，直接返回数据
            resolve({ data });
          }
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  /**
   * 获取 PR 列表
   */
  async getPullRequests(state = 'open') {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}&per_page=100`
    );
  }

  /**
   * 获取单个 PR 详情
   */
  async getPullRequest(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`
    );
  }

  /**
   * 获取 PR 文件变更
   */
  async getPRFiles(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/files`
    );
  }

  /**
   * 获取 PR 的 commits 列表
   */
  async getPRCommits(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/commits`
    );
  }

  /**
   * 获取 PR diff（用于计算 position）
   */
  async getPRDiff(prNumber) {
    // GitCode API 的 files 响应中包含 patch 字段
    const files = await this.getPRFiles(prNumber);
    const diffs = {};

    for (const file of files) {
      if (file.patch) {
        // GitCode 的 patch 是一个对象，包含 diff 字段
        const patchContent = file.patch.diff || file.patch;
        diffs[file.filename] = {
          patch: patchContent,
          additions: file.additions,
          deletions: file.deletions,
          status: file.status
        };
      }
    }

    return diffs;
  }

  /**
   * 计算行号在 diff 中的 position
   * GitCode API 使用 position 而不是 line 来定位行内评论
   * position 是从 diff 开始位置的行数索引（从 1 开始）
   */
  calculatePosition(patch, lineNumber, isNewFile) {
    if (!patch) {
      console.warn(`calculatePosition: No patch provided for line ${lineNumber}`);
      return isNewFile ? lineNumber : null;
    }

    if (!lineNumber || lineNumber <= 0) {
      console.warn(`calculatePosition: Invalid lineNumber: ${lineNumber}`);
      return null;
    }

    const lines = patch.split('\n');
    let position = 0;
    let currentNewLine = 0;  // 新文件中的当前行号

    // 跳过文件头（@@ 前面的行）
    let inHunk = false;
    let hunkNewStart = 0;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测 hunk 头 (@@ -L,S +L,S @@)
      const hunkMatch = line.match(/^@@\s+-\d+,?\d*\s+\+(\d+),?\d*\s+@@/);
      if (hunkMatch) {
        hunkNewStart = parseInt(hunkMatch[1]);
        inHunk = true;
        position = i + 1;  // position 从 1 开始
        currentNewLine = hunkNewStart - 1;
        continue;
      }

      if (!inHunk) continue;

      // 解析 diff 行
      const firstChar = line.charAt(0);

      if (firstChar === '+') {
        // 新增行
        currentNewLine++;
        if (currentNewLine === lineNumber) {
          found = true;
          return position;
        }
      } else if (firstChar === '-') {
        // 删除行 - position 增加，但新文件行号不变
      } else if (firstChar === ' ') {
        // 上下文行
        currentNewLine++;
        if (currentNewLine === lineNumber) {
          found = true;
          return position;
        }
      }

      position++;
    }

    // 如果没有找到精确匹配，对于新增文件，返回行号作为近似值
    if (!found && isNewFile) {
      console.warn(`calculatePosition: Line ${lineNumber} not found in patch, using line number as fallback for new file`);
      return lineNumber;
    }

    console.warn(`calculatePosition: Line ${lineNumber} not found in patch, returning null`);
    return null;
  }

  /**
   * 计算单个文件中多行的 positions
   */
  calculatePositionsForFile(patch, lineNumbers, isNewFile) {
    const positions = {};
    for (const line of lineNumbers) {
      positions[line] = this.calculatePosition(patch, line, isNewFile);
    }
    return positions;
  }

  /**
   * 获取 PR 评论列表
   */
  async getPRComments(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`
    );
  }

  /**
   * 获取文件内容
   */
  async getFileContent(filePath, ref = 'HEAD') {
    const encodedPath = encodeURIComponent(filePath);
    const data = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/contents/${encodedPath}?ref=${ref}`
    );

    if (data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    return '';
  }

  /**
   * 验证行号是否在文件范围内
   * @param {string} file - 文件路径
   * @param {number} lineNumber - 行号
   * @param {Object} patchInfos - patch 信息映射
   * @returns {Object} { valid: boolean, actualLines: number, error: string }
   */
  validateLineNumber(file, lineNumber, patchInfos) {
    const patchInfo = patchInfos[file];
    if (!patchInfo) {
      return { valid: true, actualLines: 0, error: null }; // 无 patch 信息，允许通过
    }

    // 计算文件实际行数
    let actualLines = 0;
    if (patchInfo.patch) {
      const lines = patchInfo.patch.split('\n');
      for (const line of lines) {
        if (line.startsWith('+') || line.startsWith(' ')) {
          actualLines++;
        }
      }
    }

    // 检查行号是否在范围内
    if (lineNumber > actualLines) {
      return {
        valid: false,
        actualLines: actualLines,
        error: `Line ${lineNumber} exceeds file length (${actualLines} for ${file})`
      };
    }

    return { valid: true, actualLines: actualLines, error: null };
  }

  /**
   * 提交行内评论
   * 注意：position 为必填字段，用于定位 diff 中的位置
   * 对于新增文件，position 约等于行号
   * 对于修改文件，需要精确计算 position
   */
  async submitInlineComment(prNumber, comment) {
    // 验证必需字段
    if (!comment.path) {
      throw new Error('Cannot submit inline comment without path');
    }

    const payload = {
      body: comment.body,
      path: comment.path
    };

    // position 是行内评论的必需字段
    if (comment.position !== null && comment.position !== undefined) {
      payload.position = comment.position;
      // 添加 commit_id 当使用 position 时
      if (comment.commitId) {
        payload.commit_id = comment.commitId;
      }
    } else {
      // 如果没有 position，尝试使用 line 作为备用
      // 注意：GitCode API 可能不支持仅使用 line，但这提供了一个尝试的机会
      if (comment.line) {
        console.warn(`Warning: Comment for ${comment.path}:${comment.line} has no position, using line as fallback`);
        // 对于新增文件，line 可以作为 position 的近似值
        payload.position = comment.line;
        if (comment.commitId) {
          payload.commit_id = comment.commitId;
        }
      } else {
        // 既没有 position 也没有 line，无法创建行内评论
        throw new Error(`Cannot submit inline comment for ${comment.path}: no position or line provided`);
      }
    }

    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
  }

  /**
   * 提交 PR 整体评论（用于 summary）
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
   * 创建 Pull Request
   * @param {Object} options - PR 创建选项
   * @param {string} options.title - PR 标题
   * @param {string} options.body - PR 描述
   * @param {string} options.head - 源分支，格式：源仓库:分支名（如 "leningchen_admin:video_2_img"）
   * @param {string} options.base - 目标分支（如 "master"）
   * @param {boolean} options.draft - 是否为草稿 PR（默认 false）
   * @returns {Promise<Object>} 创建的 PR 信息
   */
  async createPullRequest(options) {
    const { title, body, head, base, draft = false } = options;

    if (!title || !head || !base) {
      throw new Error('创建 PR 需要 title, head, base 参数');
    }

    const payload = {
      title,
      body: body || '',
      head,
      base,
      draft
    };

    // 确保 head 格式正确（如果不含冒号，添加当前 owner）
    const finalHead = head.includes(':') ? head : `${this.config.owner}:${head}`;

    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls`,
      {
        method: 'POST',
        body: JSON.stringify({ ...payload, head: finalHead })
      }
    );
  }

  /**
   * 更新 Pull Request
   * @param {number} prNumber - PR 编号
   * @param {Object} options - 更新选项
   * @param {string} options.title - 新标题（可选）
   * @param {string} options.body - 新描述（可选）
   * @param {string} options.state - 新状态（open/closed，可选）
   * @returns {Promise<Object>} 更新后的 PR 信息
   */
  async updatePullRequest(prNumber, options) {
    const { title, body, state } = options;

    const payload = {};
    if (title !== undefined) payload.title = title;
    if (body !== undefined) payload.body = body;
    if (state !== undefined) payload.state = state;

    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload)
      }
    );
  }

  /**
   * 从 GitCode URL 解析仓库和分支信息
   * @param {string} url - GitCode 仓库 URL
   * @returns {Object} 解析结果 {owner, repo, branch}
   */
  parseGitCodeUrl(url) {
    // 支持的 URL 格式：
    // - https://gitcode.com/owner/repo/tree/branch
    // - https://gitcode.com/owner/repo/commits/branch
    // - https://gitcode.com/owner/repo

    const patterns = [
      /gitcode\.com\/([^\/]+)\/([^\/]+)\/(tree|commits)\/([^\/]+)/,
      /gitcode\.com\/([^\/]+)\/([^\/]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        const owner = match[1];
        const repo = match[2].replace('.git', '');
        const branch = match[4] || 'master';
        return { owner, repo, branch };
      }
    }

    throw new Error(`无法解析 GitCode URL: ${url}`);
  }

  /**
   * 批量提交评论
   * 返回包含评论 URL 的结果
   */
  async submitBatchComments(prNumber, comments) {
    const results = [];
    const commentBaseUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`;

    for (const comment of comments) {
      try {
        const result = await this.submitInlineComment(prNumber, comment);
        // 构建评论 URL
        const commentUrl = result.id
          ? `${commentBaseUrl}#comment-${result.id}`
          : commentBaseUrl;

        results.push({
          success: true,
          comment,
          result,
          commentUrl
        });
      } catch (error) {
        results.push({
          success: false,
          comment,
          error: error.message,
          commentUrl: null
        });
      }
    }
    return results;
  }

  /**
   * 获取 PR 的 URL
   */
  getPRUrl(prNumber) {
    return `https://gitcode.com/${this.config.owner}/${this.config.repo}/pull/${prNumber}`;
  }
}

module.exports = { GitCodeAPI };

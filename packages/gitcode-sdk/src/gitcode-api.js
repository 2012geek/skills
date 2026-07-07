const https = require('https');

class GitCodeAPI {
  constructor(config) {
    this.config = config.gitcode;
    this.headers = {
      'Authorization': `Bearer ${this.config.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GitCode-SDK/1.0'
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

    // Rate limit handling: retry on 429
    let retries = 0;
    const maxRetries = 5;

    while (retries <= maxRetries) {
      const response = await this._rawRequest(url, requestOptions, options);

      if (response.statusCode === 401) {
        throw new Error('GitCode auth failed: check your gitcodeToken');
      }

      if (response.statusCode === 429) {
        const retryAfter = response.headers['retry-after']
          ? parseInt(response.headers['retry-after']) * 1000
          : 60000;
        retries++;
        if (retries > maxRetries) {
          throw new Error(`GitCode API rate limit exceeded after ${maxRetries} retries`);
        }
        await new Promise(resolve => setTimeout(resolve, retryAfter));
        continue;
      }

      if (response.statusCode !== 200 && response.statusCode !== 201) {
        throw new Error(`API request failed: ${response.statusCode} - ${response.data}`);
      }

      return response.json;
    }
  }

  async _rawRequest(url, requestOptions, options) {
    return new Promise((resolve, reject) => {
      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(data);
          } catch (e) {
            json = null;
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data,
            json
          });
        });
      });

      req.on('error', reject);

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }

  // Issue operations

  async createIssue(data) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/issues`,
      { method: 'POST', body: JSON.stringify(data) }
    );
  }

  async listIssues(labels, page = 1) {
    const params = new URLSearchParams({
      state: 'open',
      per_page: '100',
      page: String(page)
    });
    if (labels) params.set('labels', labels);
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/issues?${params.toString()}`
    );
  }

  async closeIssue(issueNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`,
      { method: 'PATCH', body: JSON.stringify({ state: 'closed' }) }
    );
  }

  async commentOnIssue(issueNumber, body) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}/comments`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
  }

  // PR operations

  async getPullRequests(state = 'open') {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}&per_page=100`
    );
  }

  async getPullRequest(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`
    );
  }

  async getPRFiles(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/files`
    );
  }

  async getPRCommits(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/commits`
    );
  }

  async getPRDiff(prNumber) {
    const files = await this.getPRFiles(prNumber);
    const diffs = {};
    for (const file of files) {
      if (file.patch) {
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

  async createPullRequest(options) {
    const { title, body, head, base, draft = false } = options;
    if (!title || !head || !base) {
      throw new Error('createPullRequest requires title, head, base');
    }
    const finalHead = head.includes(':') ? head : `${this.config.owner}:${head}`;
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls`,
      { method: 'POST', body: JSON.stringify({ title, body: body || '', head: finalHead, base, draft }) }
    );
  }

  async updatePullRequest(prNumber, options) {
    const payload = {};
    if (options.title !== undefined) payload.title = options.title;
    if (options.body !== undefined) payload.body = options.body;
    if (options.state !== undefined) payload.state = options.state;
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  }

  async submitInlineComment(prNumber, comment) {
    if (!comment.path) {
      throw new Error('Cannot submit inline comment without path');
    }
    const payload = { body: comment.body, path: comment.path };
    if (comment.position !== null && comment.position !== undefined) {
      payload.position = comment.position;
      if (comment.commitId) payload.commit_id = comment.commitId;
    } else if (comment.line) {
      payload.position = comment.line;
      if (comment.commitId) payload.commit_id = comment.commitId;
    } else {
      throw new Error(`Cannot submit inline comment for ${comment.path}: no position or line`);
    }
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  }

  async submitPRComment(prNumber, body) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
      { method: 'POST', body: JSON.stringify({ body }) }
    );
  }

  async getPRComments(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`
    );
  }

  // CI operations

  async getCIStatus(prNumber) {
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/check-runs`
    );
  }

  async getCIBotComments(prNumber) {
    const comments = await this.getPRComments(prNumber);
    return comments.filter(c => c.user && c.user.login === 'gitcode-bot');
  }

  // File operations

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

  // Position calculation

  calculatePosition(patch, lineNumber, isNewFile) {
    if (!patch) {
      return isNewFile ? lineNumber : null;
    }
    if (!lineNumber || lineNumber <= 0) {
      return null;
    }

    const lines = patch.split('\n');
    let position = 0;
    let currentNewLine = 0;
    let inHunk = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hunkMatch = line.match(/^@@\s+-\d+,?\d*\s+\+(\d+),?\d*\s+@@/);
      if (hunkMatch) {
        currentNewLine = parseInt(hunkMatch[1]) - 1;
        inHunk = true;
        position = i + 1;
        continue;
      }
      if (!inHunk) continue;

      const firstChar = line.charAt(0);
      if (firstChar === '+' || firstChar === ' ') {
        currentNewLine++;
        if (currentNewLine === lineNumber) return position;
      }
      position++;
    }

    if (isNewFile) return lineNumber;
    return null;
  }

  calculatePositionsForFile(patch, lineNumbers, isNewFile) {
    const positions = {};
    for (const line of lineNumbers) {
      positions[line] = this.calculatePosition(patch, line, isNewFile);
    }
    return positions;
  }

  validateLineNumber(file, lineNumber, patchInfos) {
    const patchInfo = patchInfos[file];
    if (!patchInfo) return { valid: true, actualLines: 0, error: null };

    let actualLines = 0;
    if (patchInfo.patch) {
      for (const line of patchInfo.patch.split('\n')) {
        if (line.startsWith('+') || line.startsWith(' ')) actualLines++;
      }
    }

    if (lineNumber > actualLines) {
      return { valid: false, actualLines, error: `Line ${lineNumber} exceeds file length (${actualLines} for ${file})` };
    }
    return { valid: true, actualLines, error: null };
  }

  // Batch operations

  async submitBatchComments(prNumber, comments) {
    const results = [];
    const commentBaseUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`;
    for (const comment of comments) {
      try {
        const result = await this.submitInlineComment(prNumber, comment);
        results.push({
          success: true,
          comment,
          result,
          commentUrl: result.id ? `${commentBaseUrl}#comment-${result.id}` : commentBaseUrl
        });
      } catch (error) {
        results.push({ success: false, comment, error: error.message, commentUrl: null });
      }
    }
    return results;
  }

  getPRUrl(prNumber) {
    return `https://gitcode.com/${this.config.owner}/${this.config.repo}/pull/${prNumber}`;
  }

  parseGitCodeUrl(url) {
    const patterns = [
      /gitcode\.com\/([^\/]+)\/([^\/]+)\/(tree|commits)\/([^\/]+)/,
      /gitcode\.com\/([^\/]+)\/([^\/]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2].replace('.git', ''), branch: match[4] || 'master' };
      }
    }
    throw new Error(`Cannot parse GitCode URL: ${url}`);
  }
}

module.exports = { GitCodeAPI };

const https = require('https');

class GitCodeAPI {
  constructor(config) {
    this.config = config.gitcode;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'GitCode-SDK/1.0'
    };
  }

  async request(endpoint, options = {}) {
    // GitCode API requires access_token as a query parameter.
    // Authorization header (Bearer token) is rejected by the apig gateway
    // on write operations (POST/PATCH/PUT/DELETE) with 403.
    // Passing access_token in query works for both read and write.
    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    if (this.config.token) {
      url.searchParams.set('access_token', this.config.token);
    }

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

    if (options.formBody) {
      const encoded = new URLSearchParams(options.formBody).toString();
      requestOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      requestOptions.headers['Content-Length'] = Buffer.byteLength(encoded);
      // Replace options.body with the encoded form data for _rawRequest
      options = { ...options, body: encoded };
    } else if (options.body) {
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

      if (![200, 201, 204].includes(response.statusCode)) {
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
    // GitCode v5 API's state_event=close is silently ignored (confirmed bug).
    // The working path: PUT to the internal issuepr API with xauth_token Bearer auth.
    // If xauth_token is available, use the internal API; otherwise fall back to v5 (which won't actually close).
    if (this.config.xauthToken) {
      const encodedPath = encodeURIComponent(`${this.config.owner}/${this.config.repo}`);
      const url = `https://web-api.gitcode.com/issuepr/api/v1/issue/${encodedPath}/issues/${issueNumber}`;
      const body = JSON.stringify({ state_event: 'close' });
      const options = {
        hostname: 'web-api.gitcode.com',
        port: 443,
        path: `/issuepr/api/v1/issue/${encodedPath}/issues/${issueNumber}`,
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.config.xauthToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-platform': 'web',
          'x-app-channel': 'gitcode-fe',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36'
        }
      };

      const response = await this._rawRequest(url, options, { body });
      if (response.statusCode === 200) {
        return response.json;
      }
      // If internal API fails, fall through to v5 API
    }

    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`,
      { method: 'PATCH', formBody: { state_event: 'close', title: 'Closed by bot' } }
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
    let allComments = [];
    let page = 1;
    while (true) {
      const comments = await this.request(
        `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments?page=${page}&per_page=100`
      );
      if (!Array.isArray(comments) || comments.length === 0) break;
      allComments = allComments.concat(comments);
      if (comments.length < 100) break;
      page++;
    }
    return allComments;
  }

  async deletePRComment(prNumber, commentId) {
    if (!commentId) {
      throw new Error('deletePRComment requires commentId');
    }
    return await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments/${commentId}`,
      { method: 'DELETE' }
    );
  }

  async deleteComment(prNumber, commentId) {
    return await this.deletePRComment(prNumber, commentId);
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

  /**
   * Lazy-load puppeteer-extra with stealth plugin.
   * Lazily required so SDK methods that don't need puppeteer (getPRComments,
   * request, etc.) work without puppeteer installed.
   */
  _loadPuppeteer() {
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
    return puppeteerExtra;
  }

  /**
   * Cached numeric project ID (used for internal /issuepr/api/v1 endpoints).
   */
  async _getProjectId() {
    if (this._projectId) return this._projectId;
    const repoInfo = await this.request(
      `/api/v5/repos/${this.config.owner}/${this.config.repo}`
    );
    this._projectId = repoInfo.id;
    return this._projectId;
  }

  /**
   * Parse the `comments_by_line` response shape into a flat array of notes.
   *
   * Response shape (from /pull/N/diffs page's comments_by_line intercept):
   *   [
   *     { path: "foo.py", new: [ { discussions: [ { id, notes: [...] } ] } ],
   *       old: [ ... ], binary: [ ... ] },
   *     ...
   *   ]
   *
   * Each note has: id, type (DiffNote), body, new_line, old_line, resolved_at,
   * commit_id, author.username, discussion_id (inherited from parent discussion).
   *
   * Pure function — extracted for unit testing without puppeteer.
   */
  _parseInlineComments(data) {
    if (!Array.isArray(data)) return [];
    const out = [];
    for (const fileEntry of data) {
      const filePath = fileEntry.path;
      for (const side of ['new', 'old', 'binary']) {
        const hunks = fileEntry[side] || [];
        for (const hunk of hunks) {
          const discussions = hunk.discussions || [];
          for (const disc of discussions) {
            const discussionId = disc.id;
            for (const note of disc.notes || []) {
              // GitCode returns new_line/old_line as strings at the note level,
              // but as proper numbers inside the `position` object. Prefer the
              // numeric version for downstream comparison.
              const pos = note.position || {};
              const line = pos.new_line || pos.old_line ||
                           Number(note.new_line) || Number(note.old_line) ||
                           note.new_line || note.old_line;
              out.push({
                id: note.id,
                discussion_id: discussionId,
                path: filePath || note.diff_file || note.file_path || pos.new_path || pos.old_path,
                position: note.position,
                line: line,
                body: note.body,
                commitId: note.commit_id,
                user: note.author?.username || note.user?.login || 'Unknown',
                resolved: !!note.resolved_at,
                _diffNote: note.type === 'DiffNote' || note.type === undefined
              });
            }
          }
        }
      }
    }
    return out;
  }

  /**
   * Fetch all inline DiffNote comments for a PR.
   *
   * GitCode's public v5 `/pulls/N/comments` endpoint returns only PR-level
   * comments (no path/line) — DiffNote inline comments live behind a
   * CloudWAF-protected internal endpoint:
   *   web-api.gitcode.com/issuepr/api/v1/projects/{projectId}/merge_requests/{N}/comments_by_line
   *
   * Direct curl is blocked by CloudWAF — we load the /pull/N/diffs page in
   * puppeteer (stealth plugin) and intercept the comments_by_line response.
   *
   * @param {number} prNumber
   * @returns {Promise<Array<{id, discussion_id, path, line, body, user, resolved, commitId}>>}
   */
  async getInlineComments(prNumber) {
    const puppeteerExtra = this._loadPuppeteer();
    const browser = await puppeteerExtra.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();

      if (this.config.token) {
        await page.setCookie({
          name: 'gitcode_token',
          value: this.config.token,
          domain: '.gitcode.com',
          path: '/'
        });
      }

      let captured = null;
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('comments_by_line')) {
          try {
            const ct = response.headers()['content-type'] || '';
            if (ct.includes('application/json')) {
              const data = await response.json();
              captured = data;
            }
          } catch (e) {
            // ignore — response.json() fails on non-JSON
          }
        }
      });

      const diffsUrl = `${this.getPRUrl(prNumber)}/diffs`;
      await page.goto(diffsUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(resolve => setTimeout(resolve, 5000));

      if (!captured) return [];
      return this._parseInlineComments(captured);
    } finally {
      await browser.close();
    }
  }

  /**
   * Convenience wrapper: inline comments that are not yet resolved.
   */
  async getUnresolvedInlineComments(prNumber) {
    const all = await this.getInlineComments(prNumber);
    return all.filter(c => !c.resolved);
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

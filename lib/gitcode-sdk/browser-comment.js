const https = require('https');
const { BrowserIssue } = require('./browser-issue');

class BrowserComment {
  constructor(config) {
    this.config = config.gitcode;
    process.env.QT_QPA_PLATFORM = 'xcb';
    process.env.GDK_BACKEND = 'x11';
    process.env.GSETTINGS_SCHEMA_DIR = '/usr/share/glib-2.0/schemas';
  }

  async login() {
    const browserIssue = new BrowserIssue({ gitcode: this.config });
    return await browserIssue.login();
  }

  async deletePRComment(prNumber, comment) {
    const xauthToken = await this.login();
    return await this.deletePRCommentWithToken(prNumber, comment, xauthToken);
  }

  async deletePRCommentWithToken(prNumber, comment, xauthToken) {
    if (!comment || !comment.id) {
      throw new Error('deletePRComment requires a comment with id');
    }
    if (!xauthToken) {
      throw new Error('xauth_token is required for browser-auth comment deletion');
    }

    const encodedProject = encodeURIComponent(`${this.config.owner}/${this.config.repo}`);
    const encodedRepoId = encodeURIComponent(encodedProject);
    const paths = [];

    if (comment.discussion_id) {
      paths.push(
        `/issuepr/api/v1/projects/${encodedProject}/merge_requests/${prNumber}/discussions/${comment.discussion_id}/notes/${comment.id}?repoId=${encodedRepoId}&iid=${prNumber}`
      );
    }

    paths.push(
      `/issuepr/api/v1/projects/${encodedProject}/merge_requests/${prNumber}/notes/${comment.id}?repoId=${encodedRepoId}&iid=${prNumber}`
    );

    const errors = [];
    for (const path of paths) {
      const response = await this._deleteInternal(path, xauthToken, prNumber);
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return {
          ok: true,
          id: comment.id,
          statusCode: response.statusCode,
          method: 'browser-auth-internal-api'
        };
      }
      errors.push(`${path}: ${response.statusCode} ${response.data}`);
    }

    throw new Error(`Browser-auth delete failed: ${errors.join(' | ')}`);
  }

  _deleteInternal(path, xauthToken, prNumber) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'web-api.gitcode.com',
        port: 443,
        path,
        method: 'DELETE',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Authorization': `Bearer ${xauthToken}`,
          'Cookie': `access_token=${xauthToken}; xauth_token=${xauthToken}`,
          'Origin': 'https://gitcode.com',
          'Referer': `https://gitcode.com/${this.config.owner}/${this.config.repo}/pull/${prNumber}`,
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'x-platform': 'web',
          'x-app-channel': 'gitcode-fe'
        }
      }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            data
          });
        });
      });

      req.on('error', reject);
      req.end();
    });
  }
}

module.exports = { BrowserComment };

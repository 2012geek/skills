/**
 * GitCode API Repair Extension
 * Extends GitCodeAPI from @skills/gitcode-sdk with review comment repair functionality
 */

const { GitCodeAPI } = require('../../../lib/gitcode-sdk');

/**
 * Extended GitCode API for repair operations
 */
class GitCodeAPIRepair extends GitCodeAPI {
  constructor(config) {
    super(config);
  }

  /**
   * Parse PR URL to extract owner, repo, and PR number
   * @param {string} prUrl - GitCode PR URL
   * @returns {Object} { owner, repo, prNumber }
   */
  parsePRUrl(prUrl) {
    // Support formats:
    // - https://gitcode.com/openeuler/lerobot_ros2/pull/50
    // - https://gitcode.com/owner/repo/pulls/50
    const patterns = [
      /gitcode\.com\/([^\/]+)\/([^\/]+)\/pulls?\/(\d+)/,
      /gitcode\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/
    ];

    for (const pattern of patterns) {
      const match = prUrl.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace('.git', ''),
          prNumber: parseInt(match[3])
        };
      }
    }

    throw new Error(`Invalid GitCode PR URL: ${prUrl}`);
  }

  /**
   * Get review comments status (resolved/total)
   * Uses page content scraping with stealth plugin
   * @param {number} prNumber - PR number
   * @returns {Promise<Object>} { resolved, total, unresolved, method }
   */
  async getReviewStatus(prNumber) {
    console.log('  Fetching review status from page...');

    try {
      // Fresh require to ensure stealth plugin works
      const puppeteerExtra = require('puppeteer-extra');
      const StealthPlugin = require('puppeteer-extra-plugin-stealth');
      puppeteerExtra.use(StealthPlugin());

      const browser = await puppeteerExtra.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();

      // Set cookies for authentication (use .gitcode.com with leading dot)
      await page.setCookie({
        name: 'gitcode_token',
        value: this.config.token,
        domain: '.gitcode.com',
        path: '/'
      });

      // Navigate to PR page
      await page.goto(this.getPRUrl(prNumber), {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for data to load
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Extract status from page content
      const status = await page.evaluate(() => {
        const allText = document.body.innerText;

        // Look for "Review comments resolved X/Y" pattern
        const patterns = [
          /Review comments resolved\D*(\d+)\s*\/\s*(\d+)/,
          /评审意见已解决\D*(\d+)\s*\/\s*(\d+)/
        ];

        for (const pattern of patterns) {
          const match = allText.match(pattern);
          if (match) {
            return {
              resolved: parseInt(match[1]),
              total: parseInt(match[2])
            };
          }
        }

        return null;
      });

      await browser.close();

      if (status) {
        console.log(`  ✓ Found status via page: ${status.resolved}/${status.total}`);
        return {
          resolved: status.resolved,
          total: status.total,
          unresolved: status.total - status.resolved,
          method: 'Page Scraping'
        };
      }

      console.log('  ℹ Could not find status on page');
      return {
        resolved: 0,
        total: 0,
        unresolved: 0,
        method: 'None'
      };
    } catch (error) {
      console.warn(`  ⚠ Status fetch failed: ${error.message}`);
      return {
        resolved: 0,
        total: 0,
        unresolved: 0,
        method: 'Error'
      };
    }
  }

  /**
   * Scrape review status only from PR page HTML
   * @param {number} prNumber - PR number
   * @returns {Promise<Object>} { resolved, total, unresolved, method }
   */
  async scrapeReviewStatusOnly(prNumber) {
    const prUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`;

    // puppeteer-extra with stealth plugin
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());

    // Launch browser with stealth mode
    const browser = await puppeteerExtra.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    try {
      const page = await browser.newPage();
      console.log('  Loading PR page for status check...');

      // Set viewport for better rendering
      await page.setViewport({ width: 1920, height: 1080 });

      // Set cookies for authentication (use .gitcode.com with leading dot)
      await page.setCookie({
        name: 'gitcode_token',
        value: this.config.token,
        domain: '.gitcode.com',
        path: '/'
      });

      await page.goto(prUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for the page to stabilize
      console.log('  Waiting for page content to load...');

      // Wait a bit for dynamic content
      await new Promise(resolve => setTimeout(resolve, 8000));

      // Try to find the review status with multiple approaches
      const patterns = [
        'Review comments resolved',
        '评审意见已解决',
        'review comments',
        '评审',
        'comment'
      ];

      const status = await page.evaluate((searchPatterns) => {
        const allText = document.body.innerText;

        // Debug: return first 1000 chars to see what we have
        const preview = allText.substring(0, 1000);

        // Try each pattern
        for (const pattern of searchPatterns) {
          const idx = allText.toLowerCase().indexOf(pattern.toLowerCase());
          if (idx !== -1) {
            // Found the pattern, extract context
            const context = allText.substring(idx, idx + 150);

            // Try to find X/Y pattern in context (allow spaces around slash)
            const match = context.match(/(\d+)\s*\/\s*(\d+)/);
            if (match) {
              return {
                resolved: parseInt(match[1]),
                total: parseInt(match[2]),
                debug: `Found via "${pattern}": "${context.replace(/\n/g, '\\n')}"`,
                preview: preview.substring(0, 200)
              };
            } else {
              return {
                resolved: 0,
                total: 0,
                debug: `Found "${pattern}" but no X/Y in: "${context.replace(/\n/g, '\\n')}"`,
                preview: preview.substring(0, 200)
              };
            }
          }
        }

        // None of the patterns found
        return {
          resolved: 0,
          total: 0,
          debug: 'Pattern not found in page text',
          preview: preview.substring(0, 200),
          textLength: allText.length
        };
      }, patterns);

      console.log('  Scraping debug:', status.debug);
      console.log('  Page preview:', status.preview);

      return {
        resolved: status.resolved,
        total: status.total,
        unresolved: status.total - status.resolved,
        method: 'Scraping'
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Scrape review status from PR page HTML
   * @param {number} prNumber - PR number
   * @returns {Promise<Object>} { resolved, total, unresolved, method }
   */
  async scrapeReviewStatus(prNumber) {
    // puppeteer-extra with stealth plugin
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());

    const prUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`;

    const browser = await puppeteerExtra.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.goto(prUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Look for div with text "评审意见已解决X/Y"
      const statusText = await page.evaluate(() => {
        const divs = Array.from(document.querySelectorAll('div'));
        const statusDiv = divs.find(d => d.textContent.includes('评审意见已解决'));
        return statusDiv ? statusDiv.textContent.trim() : null;
      });

      if (!statusText) {
        throw new Error('Could not find review status div on page');
      }

      // Parse "评审意见已解决X/Y" format
      const match = statusText.match(/评审意见已解决(\d+)\/(\d+)/);
      if (!match) {
        throw new Error(`Could not parse status from: ${statusText}`);
      }

      const resolved = parseInt(match[1]);
      const total = parseInt(match[2]);

      return {
        resolved,
        total,
        unresolved: total - resolved,
        method: 'Scraping'
      };
    } finally {
      await browser.close();
    }
  }

  async replyToComment(prNumber, commentId, replyBody, options = {}) {
    const { discussion_id, xauth_token } = options;

    // Nested reply path: only when both discussion_id and xauth_token are present.
    // This is the path the skill always takes for DiffNote review comments, since
    // context.json collects discussion_id for every inline comment and xauth_token
    // is fetched in runApply before the reply loop. If this path fails, do NOT
    // silently fall back to the public /api/v5 PR comments endpoint — that posts
    // a standalone top-level comment rather than a nested reply, which is exactly
    // the bug users have reported ("reply didn't go under the review issue").
    // Surface the error so the user can refresh xauth_token and re-run --apply.
    if (discussion_id && xauth_token) {
      console.log('  尝试使用内部API嵌套回复 / Trying nested reply via internal API...');
      const result = await this.submitNestedReply(prNumber, discussion_id, replyBody, xauth_token);
      console.log('  ✓ 内部API嵌套回复成功 / Nested reply successful');
      return result;
    }

    // No discussion_id (e.g. replying to a PR-level comment, not a DiffNote) or
    // no xauth_token (browser login not performed). Post a top-level PR comment
    // via the public API — this is the intended use of the fallback, not a
    // silent mask for nested-reply failure.
    console.log('  尝试使用API回复 / Trying API reply (no discussion_id or no xauth_token, posting top-level comment)...');

    const payload = {
      body: replyBody + `\n\n_Replying to comment #${commentId}_\n\n---\n🤖 Generated by gitcode-code-review-repair`
    };

    try {
      const result = await this.request(
        `/api/v5/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/comments`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );
      console.log('  ✓ API reply successful');
      return result;
    } catch (apiError) {
      console.log(`  ⚠ API reply failed: ${apiError.message}`);
      console.log('  🔧 尝试使用浏览器回复 / Trying browser-based reply...');

      return await this._postReplyViaBrowser(prNumber, commentId, replyBody);
    }
  }

  /**
   * Submit nested reply within a DiffNote discussion via GitCode internal API.
   *
   * Uses the web-api.gitcode.com host with browser-style headers (x-platform: web,
   * x-app-channel: gitcode-fe) — calling gitcode.com directly gets blocked by
   * CloudWAF (HTTP 418). Mirrors the working pattern in browser-comment.js
   * _deleteInternal. The path uses the encoded `owner/repo` (not a numeric
   * projectId) plus repoId/iid query params.
   *
   * Requires xauth_token (browser OAuth token, not personal access token).
   * @param {number} prNumber - PR number
   * @param {string} discussionId - Discussion thread ID from DiffNote
   * @param {string} body - Reply content
   * @param {string} xauthToken - xauth_token obtained via browser login
   * @returns {Promise<Object>} Created note (type: DiffNote, is_reply: true)
   */
  async submitNestedReply(prNumber, discussionId, body, xauthToken) {
    if (!xauthToken) {
      throw new Error('xauth_token required for nested reply');
    }
    if (!discussionId) {
      throw new Error('discussion_id required for nested reply');
    }

    const encodedProject = encodeURIComponent(`${this.config.owner}/${this.config.repo}`);
    const encodedRepoId = encodeURIComponent(encodedProject);
    const urlPath = `/issuepr/api/v1/projects/${encodedProject}/merge_requests/${prNumber}/discussions/${discussionId}/notes?repoId=${encodedRepoId}&iid=${prNumber}`;
    const payload = JSON.stringify({ body });
    const bodyLen = Buffer.byteLength(payload);
    const zlib = require('zlib');
    const https = require('https');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'web-api.gitcode.com',
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
          'Content-Length': bodyLen,
          'Origin': 'https://gitcode.com',
          'Referer': `https://gitcode.com/${this.config.owner}/${this.config.repo}/pull/${prNumber}`,
          'Sec-Ch-Ua': '"Chromium";v="130", "Not?A_Brand";v="99"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Linux"',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Authorization': `Bearer ${xauthToken}`,
          'Cookie': `access_token=${xauthToken}; xauth_token=${xauthToken}`,
          'x-platform': 'web',
          'x-app-channel': 'gitcode-fe',
        }
      };

      const req = https.request(options, (res) => {
        let chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          let text = raw.toString('utf-8');
          try {
            if (res.headers['content-encoding'] === 'gzip') text = zlib.gunzipSync(raw).toString('utf-8');
            else if (res.headers['content-encoding'] === 'br') text = zlib.brotliDecompressSync(raw).toString('utf-8');
          } catch(e) {}

          // CloudWAF blocks return HTML with HTTP 418/403 — surface those clearly so
          // the caller knows it's a WAF/auth issue, not a GitCode API error.
          const isHtml = text.trimStart().startsWith('<');
          if (res.statusCode === 418 || (res.statusCode >= 400 && isHtml)) {
            reject(new Error(`CloudWAF blocked the nested reply (HTTP ${res.statusCode}). The xauth_token may be stale or the request shape changed. Run \`node scripts/xauth-extractor.js\` to refresh.`));
            return;
          }

          try {
            const json = JSON.parse(text);
            if (res.statusCode >= 400) {
              const msg = json.error_message || json.message || JSON.stringify(json);
              reject(new Error(`Nested reply failed: HTTP ${res.statusCode} - ${msg}`));
            } else {
              resolve(json);
            }
          } catch(e) {
            if (res.statusCode >= 400) {
              reject(new Error(`Nested reply failed: HTTP ${res.statusCode} - ${text.substring(0, 200)}`));
            } else {
              resolve({ raw: text });
            }
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Post reply to comment using browser automation
   * @param {number} prNumber - PR number
   * @param {number} commentId - Comment ID to reply to
   * @param {string} replyBody - Reply content
   * @returns {Promise<Object>} Reply result
   */
  async _postReplyViaBrowser(prNumber, commentId, replyBody) {
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());

    const prUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`;
    const filesUrl = `${prUrl}/files`;

    const browser = await puppeteerExtra.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();

      // Set cookies for authentication
      await page.setCookie({
        name: 'gitcode_token',
        value: this.config.token,
        domain: '.gitcode.com',
        path: '/'
      });

      // Navigate to Files tab
      console.log(`  📄 Loading files page: ${filesUrl}`);
      await page.goto(filesUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Find and click on the comment thread for the specific commentId
      console.log(`  🔍 Looking for comment #${commentId}...`);

      const replyPosted = await page.evaluate(async (cId, cBody) => {
        // Try to find the comment by ID or by matching the discussion
        const commentSelectors = [
          `[data-discussion-id="${cId}"]`,
          `[data-comment-id="${cId}"]`,
          `[data-id="${cId}"]`,
          `.discussion-reply-item[data-id="${cId}"]`,
          `.note[data-id="${cId}"]`
        ];

        let commentElement = null;
        for (const selector of commentSelectors) {
          commentElement = document.querySelector(selector);
          if (commentElement) {
            console.log(`Found comment with selector: ${selector}`);
            break;
          }
        }

        // If not found by ID, try to find by text matching
        if (!commentElement) {
          const allNotes = document.querySelectorAll('.note, .discussion-reply-item, [class*="comment"]');
          for (const note of allNotes) {
            const idAttr = note.getAttribute('data-id') ||
                          note.getAttribute('data-note-id') ||
                          note.getAttribute('data-discussion-id');
            if (idAttr === String(cId)) {
              commentElement = note;
              break;
            }
          }
        }

        if (!commentElement) {
          return { success: false, error: 'Comment element not found' };
        }

        // Find the reply button or textarea in this comment thread
        const replyContainer = commentElement.closest('.discussion, .discussion-reply-group, [class*="discussion"]') || commentElement;

        // Look for reply button
        const replyButton = replyContainer.querySelector('button[aria-label*="Reply"], button[class*="reply"], .reply-button, [class*="reply-btn"]');
        if (replyButton) {
          replyButton.click();
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Look for textarea in the reply form
        const textarea = replyContainer.querySelector('textarea[placeholder*="Reply"], textarea[name="comment"], .comment-textarea, textarea');

        if (!textarea) {
          // Try to find any textarea in the discussion
          const allTextareas = replyContainer.querySelectorAll('textarea');
          if (allTextareas.length > 0) {
            textarea = allTextareas[allTextareas.length - 1]; // Use the last one
          }
        }

        if (!textarea) {
          return { success: false, error: 'Textarea not found' };
        }

        // Focus and type the reply
        textarea.focus();
        textarea.value = cBody;

        // Trigger input events
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(resolve => setTimeout(resolve, 300));

        // Find and click the submit button
        const submitSelectors = [
          'button[type="submit"]',
          'button[aria-label*="Submit"]',
          'button[aria-label*="Comment"]',
          '.submit-button',
          '[class*="submit-btn"]',
          'button:contains("Comment")',
          'button:contains("Reply")'
        ];

        let submitButton = null;
        for (const selector of submitSelectors) {
          // For :contains pseudo-selector, we need to check text content
          if (selector.includes(':contains')) {
            const text = selector.match(/:contains\("(.+)"\)/)[1];
            const buttons = replyContainer.querySelectorAll('button');
            for (const btn of buttons) {
              if (btn.textContent.includes(text)) {
                submitButton = btn;
                break;
              }
            }
          } else {
            submitButton = replyContainer.querySelector(selector);
          }
          if (submitButton) {
            break;
          }
        }

        if (!submitButton) {
          return { success: false, error: 'Submit button not found' };
        }

        submitButton.click();

        // Wait for submission
        await new Promise(resolve => setTimeout(resolve, 1000));

        return { success: true };
      }, commentId, replyBody);

      if (!replyPosted.success) {
        throw new Error(`Browser reply failed: ${replyPosted.error}`);
      }

      // Wait for the reply to be processed
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('  ✓ Browser reply successful');

      return {
        id: commentId,
        html_url: `${prUrl}#discussion-${commentId}`,
        body: replyBody
      };

    } finally {
      await browser.close();
    }
  }

  /**
   * Get file content at a specific line range
   * @param {string} filePath - Path to file
   * @param {number} lineNumber - Line number
   * @param {number} contextLines - Number of lines before/after to include
   * @returns {Promise<string>} File content
   */
  async getFileContext(filePath, lineNumber, contextLines = 10) {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const start = Math.max(0, lineNumber - contextLines - 1);
      const end = Math.min(lines.length, lineNumber + contextLines);

      return lines.slice(start, end).join('\n');
    } catch (error) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }
}

module.exports = { GitCodeAPIRepair, GitCodeAPI };

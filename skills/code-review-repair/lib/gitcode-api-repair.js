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
    this.anthropicApiKey = config.anthropic?.apiKey;
    this.anthropicBaseUrl = config.anthropic?.baseUrl;
    this._projectId = null;
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

  /**
   * Scrape review comments from PR page HTML
   * @param {number} prNumber - PR number
   * @returns {Promise<Array>} Array of unresolved review comments
   */
  async scrapeReviewComments(prNumber) {
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
      console.log('  Loading PR page for scraping...');
      await page.goto(prUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for dynamic content to load
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Extract review comments from page
      const comments = await page.evaluate(() => {
        const results = [];

        // Look for review comment elements in diff views
        // GitCode typically uses specific classes/structures for review comments
        const commentSelectors = [
          '.inline-comment',           // Direct class
          '.review-comment',            // Review comment class
          '[class*="comment"]',          // Any class with "comment"
          '.diff-comment',               // Diff-specific comments
          '.file-comment'                // File comments
        ];

        // Try to find comments using various selectors
        for (const selector of commentSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            console.log(`Found ${elements.length} elements with selector: ${selector}`);
          }
        }

        // Look for comment content in the page
        // Review comments are typically in diff sections with file paths
        const diffSections = document.querySelectorAll('[class*="diff"], [class*="file"], .diff-view, .file-diff');

        for (const section of diffSections) {
          // Extract file path from the section
          const filePathEl = section.querySelector('[class*="file-path"], .file-name, .path');
          const filePath = filePathEl ? filePathEl.textContent.trim() : null;

          if (!filePath) continue;

          // Look for comment content within this section
          const commentElements = section.querySelectorAll('[class*="comment"], [class*="review"], .comment-content, .comment-body');

          for (const commentEl of commentElements) {
            const body = commentEl.textContent?.trim();
            if (!body || body.length < 10) continue; // Skip empty or very short comments

            // Try to extract line number from the section
            const lineMatch = section.textContent.match(/L(\d+)/);
            const lineNumber = lineMatch ? parseInt(lineMatch[1]) : null;

            // Check if comment is resolved (has "resolved" class or text)
            const isResolved = commentEl.classList.contains('resolved') ||
                             commentEl.textContent.includes('已解决') ||
                             commentEl.textContent.includes('resolved');

            if (!isResolved) {
              results.push({
                path: filePath,
                line: lineNumber,
                body: body,
                resolved: false,
                element: commentEl.className
              });
            }
          }
        }

        // Also look for thread/discussion style comments
        const discussionSelectors = [
          '.discussion-item',
          '.thread-comment',
          '[data-comment]',
          '.timeline-comment'
        ];

        for (const selector of discussionSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const body = el.textContent?.trim();
            if (!body || body.length < 10) continue;

            // Check for file path association
            const pathEl = el.querySelector('[class*="path"], .file-path, a[href*="/blob/"]');
            const path = pathEl ? pathEl.textContent.trim() : null;

            if (path) {
              const isResolved = el.classList.contains('resolved') ||
                               el.textContent.includes('已解决');

              if (!isResolved) {
                results.push({
                  path: path,
                  line: null,
                  body: body,
                  resolved: false,
                  element: el.className
                });
              }
            }
          }
        }

        // Get review status from the page
        let reviewStatus = { resolved: 0, total: 0 };
        const allText = document.body.innerText;
        const statusMatch = allText.match(/Review comments resolved:\s*(\d+)\/(\d+)/);
        if (statusMatch) {
          reviewStatus = {
            resolved: parseInt(statusMatch[1]),
            total: parseInt(statusMatch[2])
          };
        }

        // Also check Chinese format
        const cnStatusMatch = allText.match(/评审意见已解决[：:]\s*(\d+)\/(\d+)/);
        if (cnStatusMatch) {
          reviewStatus = {
            resolved: parseInt(cnStatusMatch[1]),
            total: parseInt(cnStatusMatch[2])
          };
        }

        return {
          comments: results,
          status: reviewStatus
        };
      });

      console.log(`  Found ${comments.comments.length} review comments from page`);
      console.log(`  Status: ${comments.status.resolved}/${comments.status.total} resolved`);

      // Map scraped comments to standard format
      return comments.comments.map((c, index) => ({
        id: `scraped-${index}`,
        path: c.path,
        position: null,
        line: c.line,
        body: c.body,
        commitId: null,
        user: 'Unknown',
        url: `${this.getPRUrl(prNumber)}`,
        _scraped: true
      }));

    } finally {
      await browser.close();
    }
  }

  /**
   * Get unresolved review comments (uses internal API interception)
   * @param {number} prNumber - PR number
   * @returns {Promise<Array>} Array of unresolved review comments
   */
  async getUnresolvedComments(prNumber) {
    console.log('  Fetching review comments from internal API...');

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

      // Intercept the DiffNote API response
      let diffNoteData = null;
      page.on('response', async (response) => {
        const url = response.url();
        // Capture the discussions API with DiffNote type
        if (url.includes('/discussions') && url.includes('note_type=DiffNote')) {
          try {
            const contentType = response.headers()['content-type'];
            if (contentType && contentType.includes('application/json')) {
              const data = await response.json();
              diffNoteData = data;
              console.log(`  ✓ Captured DiffNote API response`);
            }
          } catch (e) {
            console.log(`  ⚠ Failed to parse DiffNote response: ${e.message}`);
          }
        }
      });

      // Navigate to PR page
      await page.goto(this.getPRUrl(prNumber), {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Wait for page load
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Click on "Files changed" tab to trigger DiffNote API
      console.log('  Clicking "Files changed" tab...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
        const filesButton = buttons.find(btn => btn.textContent.includes('Files changed'));
        if (filesButton) {
          filesButton.click();
        }
      });

      // Wait for API to be called
      await new Promise(resolve => setTimeout(resolve, 8000));

      await browser.close();

      // Process the DiffNote data
      if (diffNoteData) {
        // The structure is: { content: [ { notes: [ ... ] } ] }
        const discussions = diffNoteData.content || [];
        const allNotes = [];

        // Extract all notes from all discussions
        for (const discussion of discussions) {
          if (discussion.notes && Array.isArray(discussion.notes)) {
            allNotes.push(...discussion.notes);
          }
        }

        if (allNotes.length > 0) {
          const unresolved = allNotes.filter(n => !n.resolved_at);

          console.log(`  ✓ Found ${allNotes.length} total review comments, ${unresolved.length} unresolved`);

          if (unresolved.length > 0) {
            return unresolved.map(n => ({
              id: n.id,
              discussion_id: n.discussion_id,
              path: n.diff_file || n.file_path,
              position: n.position,
              line: n.new_line || n.old_line,
              body: n.body,
              commitId: n.commit_id,
              user: n.author?.username || n.user?.login || 'Unknown',
              url: `${this.getPRUrl(prNumber)}#discussion-${n.discussion_id}`,
              resolved: false,
              _diffNote: true
            }));
          }
        }
      }

      console.log('  ℹ No unresolved review comments found');
      return [];
    } catch (error) {
      console.warn(`  ⚠ Comment fetch failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Reply to a review comment
   * @param {number} prNumber - PR number
   * @param {number} commentId - Original comment ID to reply to
   * @param {string} replyBody - Reply content
   * @param {Object} options - Optional: { discussion_id, xauth_token } for nested reply
   * @returns {Promise<Object>} Reply result
   */
  async replyToComment(prNumber, commentId, replyBody, options = {}) {
    const { discussion_id, xauth_token } = options;

    // Prefer nested reply via internal API when both are available
    if (discussion_id && xauth_token) {
      console.log('  尝试使用内部API嵌套回复 / Trying nested reply via internal API...');
      try {
        const result = await this.submitNestedReply(prNumber, discussion_id, replyBody, xauth_token);
        console.log('  ✓ 内部API嵌套回复成功 / Nested reply successful');
        return result;
      } catch (nestedError) {
        console.log(`  ⚠ 嵌套回复失败 / Nested reply failed: ${nestedError.message}`);
        console.log('  回退到公开API / Falling back to public API...');
      }
    }

    console.log('  尝试使用API回复 / Trying API reply...');

    // GitCode API: Create a new comment as a reply
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

      // Fall back to browser-based posting
      return await this._postReplyViaBrowser(prNumber, commentId, replyBody);
    }
  }

  /**
   * Submit nested reply within a DiffNote discussion via GitCode internal API
   * Requires xauth_token (browser OAuth token, not personal access token)
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

    // Fetch project_id if not cached
    let projectId = this._projectId;
    if (!projectId) {
      const repoInfo = await this.request(
        `/api/v5/repos/${this.config.owner}/${this.config.repo}`
      );
      projectId = repoInfo.id;
      this._projectId = projectId;
    }

    const urlPath = `/issuepr/api/v1/projects/${projectId}/merge_requests/${prNumber}/discussions/${discussionId}/notes`;
    const payload = JSON.stringify({ body });
    const bodyLen = Buffer.byteLength(payload);
    const zlib = require('zlib');
    const https = require('https');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'gitcode.com',
        port: 443,
        path: urlPath,
        method: 'POST',
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Content-Type': 'application/json',
          'Content-Length': bodyLen,
          'Host': 'gitcode.com',
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

          try {
            const json = JSON.parse(text);
            if (res.statusCode >= 400) {
              reject(new Error(`Internal API error: ${res.statusCode} - ${json.error_message || JSON.stringify(json)}`));
            } else {
              resolve(json);
            }
          } catch(e) {
            if (res.statusCode >= 400) {
              reject(new Error(`Internal API error: ${res.statusCode} - ${text.substring(0, 200)}`));
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
   * Generate fix using Anthropic Claude
   * @param {Object} context - { fileContent, reviewComment, filePath, lineNumber }
   * @returns {Promise<Object>} { hasFix, fixDescription, originalCode, fixedCode, needsReplyOnly }
   */
  async generateFix(context) {
    if (!this.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const prompt = this._buildFixPrompt(context);

    // Determine base URL
    const baseUrl = this.anthropicBaseUrl || 'https://api.anthropic.com';
    console.log(`  Using base URL: ${baseUrl}`);

    // Try different model names and API key formats
    const configsToTry = [
      {
        model: 'claude-sonnet-4-20250514',
        apiKey: this.anthropicApiKey.replace('sk-ant-', ''),
        useRawRequest: true
      },
      {
        model: 'claude-3-5-sonnet-20241022',
        apiKey: this.anthropicApiKey.replace('sk-ant-', ''),
        useRawRequest: true
      },
    ];

    let lastError = null;
    let proxyCleared = false;

    for (const config of configsToTry) {
      try {
        console.log(`  Trying model: ${config.model}, key format: ${config.apiKey.substring(0, 10)}...`);

        if (config.useRawRequest) {
          // Use raw HTTP request for proxies
          const response = await this._makeRawLLMRequest(baseUrl, config.apiKey, config.model, prompt);
          console.log(`  ✓ Successfully generated fix using model: ${config.model}`);
          return this._parseFixResponse(response);
        }
      } catch (error) {
        console.log(`  ✗ Config failed: ${error.message}`);
        lastError = error;

        // If access error (401/403/404) and proxy not cleared yet, try clearing proxy
        const isAccessError = error.message.includes('AccessError:') ||
                              error.code === 'ACCESS_ERROR' ||
                              error.message.includes('401') ||
                              error.message.includes('403') ||
                              error.message.includes('404');

        if (isAccessError && !proxyCleared) {
          console.log(`  ⚠ Access error detected, trying to clear proxy settings...`);
          try {
            await this._clearProxySettings();
            proxyCleared = true;
            console.log(`  ✓ Proxy cleared, retrying API request...`);

            // Retry this config after clearing proxy
            try {
              const response = await this._makeRawLLMRequest(baseUrl, config.apiKey, config.model, prompt);
              console.log(`  ✓ Successfully generated fix after clearing proxy`);
              return this._parseFixResponse(response);
            } catch (retryError) {
              console.log(`  ✗ Retry after proxy clear also failed: ${retryError.message}`);
              lastError = retryError;
            }
          } catch (proxyClearError) {
            console.log(`  ⚠ Failed to clear proxy: ${proxyClearError.message}`);
          }
        }
        // Continue to next config
      }
    }

    // LLM generation failed - return a graceful fallback response
    console.log(`  ⚠ LLM generation unavailable, will post acknowledgment reply`);
    return {
      hasFix: false,
      needsReplyOnly: true,
      reason: '感谢您的检视意见。由于自动化修复服务暂时不可用，请您手动处理此问题。如有疑问，请随时提出。',
      error: null
    };
  }

  /**
   * Clear proxy environment variables
   * @private
   */
  async _clearProxySettings() {
    const { execSync } = require('child_process');

    try {
      // Try to call unset_proxy if it exists
      execSync('unset_proxy 2>/dev/null || true', { encoding: 'utf-8' });

      // Also manually clear common proxy environment variables
      delete process.env.HTTP_PROXY;
      delete process.env.HTTPS_PROXY;
      delete process.env.http_proxy;
      delete process.env.https_proxy;
      delete process.env.NO_PROXY;
      delete process.env.no_proxy;
      delete process.env.ALL_PROXY;
      delete process.env.all_proxy;

      console.log('  ✓ Cleared proxy environment variables');
    } catch (error) {
      throw new Error(`Failed to clear proxy: ${error.message}`);
    }
  }

  /**
   * Make raw HTTP request to LLM API (for proxy services)
   * @private
   */
  async _makeRawLLMRequest(baseUrl, apiKey, model, prompt) {
    const https = require('https');
    const url = require('url');

    // Try different API paths
    const pathsToTry = [
      '/messages',
      '/api/anthropic/v1/messages',
      '/anthropic/v1/messages',
      '/v1/messages',
    ];

    let hasAccessError = false;

    for (const apiPath of pathsToTry) {
      try {
        const result = await this._tryLLMPath(baseUrl, apiKey, model, prompt, apiPath);
        return result;
      } catch (error) {
        const errorMsg = error.message;
        console.log(`    Path ${apiPath} failed: ${errorMsg.substring(0, 50)}...`);

        // Detect access errors for proxy clearing logic
        if (errorMsg.includes('AccessError') || errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('404')) {
          hasAccessError = true;
        }
      }
    }

    // Throw special error with access error flag
    const error = new Error(hasAccessError ? 'AccessError: All API paths failed' : 'All API paths failed');
    error.code = hasAccessError ? 'ACCESS_ERROR' : 'ALL_FAILED';
    throw error;
  }

  /**
   * Try a specific API path for LLM request
   * @private
   */
  async _tryLLMPath(baseUrl, apiKey, model, prompt, apiPath) {
    const https = require('https');
    const url = require('url');

    // Try different authentication formats
    const authFormats = [
      { name: 'Bearer', headers: { 'Authorization': `Bearer ${apiKey}` } },
      { name: 'sk-ant-Bearer', headers: { 'Authorization': `Bearer sk-ant-${apiKey}` } },
      { name: 'x-api-key', headers: { 'x-api-key': apiKey } },
      { name: 'sk-ant-x-api-key', headers: { 'x-api-key': `sk-ant-${apiKey}` } },
      { name: 'anthropic-version', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } },
    ];

    let hasAccessError = false;

    for (const authFormat of authFormats) {
      try {
        const result = await this._tryAuthFormat(baseUrl, model, prompt, apiPath, authFormat.headers);
        console.log(`    ✓ Auth format succeeded: ${authFormat.name}`);
        return result;
      } catch (error) {
        const errorMsg = error.message;
        console.log(`    ✗ Auth format ${authFormat.name}: ${errorMsg.substring(0, 40)}...`);

        // Detect access errors
        if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('404')) {
          hasAccessError = true;
        }
      }
    }

    // Throw error with access error indication in the message
    const error = new Error(hasAccessError ? 'AccessError: All auth formats failed' : 'All auth formats failed');
    error.code = hasAccessError ? 'ACCESS_ERROR' : 'ALL_FAILED';
    throw error;
  }

  /**
   * Try a specific auth format for LLM request
   * @private
   */
  async _tryAuthFormat(baseUrl, model, prompt, apiPath, authHeaders) {
    const https = require('https');
    const url = require('url');

    return new Promise((resolve, reject) => {
      const parsedUrl = url.parse(baseUrl);
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const json = JSON.parse(data);
              resolve(json.content[0].text);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${e.message}`));
            }
          } else {
            reject(new Error(`${res.statusCode}: ${data.substring(0, 100)}`));
          }
        });
      });

      req.on('error', reject);

      const body = JSON.stringify({
        model: model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Build prompt for LLM fix generation (Chinese)
   * @private
   */
  _buildFixPrompt(context) {
    const { fileContent, reviewComment, filePath, lineNumber, prDiff } = context;

    return `你是一个代码修复助手。收到了一条代码审查意见。

**文件**: ${filePath}
**行号**: ${lineNumber}

**审查意见**:
"""
${reviewComment}
"""

**当前PR中的文件改动**:
\`\`\`
${prDiff || '(无法获取改动信息)'}
\`\`\`

**当前代码内容** (第${lineNumber}行附近):
\`\`\`
${fileContent}
\`\`\`

**重要背景**: 这是在处理一个Pull Request的审查意见。

请仔细分析审查意见和PR中的实际改动，判断需要采取什么行动：

**关键判断逻辑**:
1. 审查意见说"这部分内容没有改动，保持不要修改"或类似表述
2. PR diff显示该文件/该行有新增内容（+开头的行）
3. 这意味着：审查者要求**删除这些新增的代码行**

**处理方式**:
- 如果是整个新增函数/类需要删除：使用NEEDS_REVERT_FILE
- 如果只是特定几行需要删除：使用NEEDS_DELETE_LINES + 指定要删除的行号
- 如果需要修改代码：使用常规的FIX_FORMAT

请使用以下格式之一回答：

**格式A - 需要删除特定行** (精确删除PR中添加的某些行):
\`\`\`
HAS_FIX: true
NEEDS_REVERT_FILE: false
NEEDS_DELETE_LINES: true
DELETE_LINES: [要删除的行号列表，例如: 18,30,45-179]
FIX_DESCRIPTION: [删除原因]
FILE_PATH: ${filePath}
\`\`\`

**格式B - 需要回退整个文件** (整个文件的修改都需要回退):
\`\`\`
HAS_FIX: true
NEEDS_REVERT_FILE: true
FIX_DESCRIPTION: [回退原因]
FILE_PATH: ${filePath}
REVERT_COMMAND: git checkout HEAD -- ${filePath}
\`\`\`

**格式C - 需要代码修复** (常规的代码修改):
\`\`\`
HAS_FIX: true
NEEDS_REVERT_FILE: false
NEEDS_DELETE_LINES: false
FIX_DESCRIPTION: [修复方案描述]
ORIGINAL_CODE: [原代码]
FIXED_CODE: [修复后代码]
\`\`\`

**格式D - 仅需回复说明**:
\`\`\`
HAS_FIX: false
NEEDS_REPLY_ONLY: true
REASON: [说明内容]
\`\`\`

请简明扼要地回答。`;
  }

  /**
   * Analyze review comment with LLM and show plan
   */
  async analyzeCommentWithPlan(context) {
    const { reviewComment, filePath, lineNumber, prDiff } = context;

    console.log('\n📋 审查意见分析 / Review Comment Analysis');
    console.log('='.repeat(60));
    console.log(`文件 / File: ${filePath}:${lineNumber}`);
    console.log(`意见 / Comment: ${reviewComment}`);
    console.log('='.repeat(60));

    const prompt = `请分析以下代码审查意见，并给出处理方案。

**PR中的文件改动**:
\`\`\`
${prDiff || '(无法获取改动信息)'}
\`\`\`

**审查意见**:
"""
${reviewComment}
"""

**文件**: ${filePath}
**行号**: ${lineNumber}

**重要说明**:
- 如果PR中包含该文件的修改（格式化、import调整、空行等），但审查意见说"没有改动，保持不要修改"
- 这意味着：审查者要求**回退这些修改**
- 处理方式：使用 git checkout 回退该文件

请判断：
1. 这是什么类型的审查意见？（需要回退修改/代码问题/改进建议/保留指令/其他）
2. 需要采取什么行动？
3. 具体的处理方案是什么？

请用中文回答，格式如下：
**意见类型**: [类型]
**需要回退修改**: [是/否]
**需要行动**: [是/否]
**处理方案**: [具体方案描述]`;

    try {
      const response = await this._callLLMForAnalysis(prompt);
      console.log('\n🤖 LLM 分析结果 / LLM Analysis:');
      console.log('─'.repeat(60));
      console.log(response);
      console.log('─'.repeat(60));
      return response;
    } catch (error) {
      console.log(`  ⚠ LLM分析失败: ${error.message}`);
      return null;
    }
  }

  /**
   * Call LLM for comment analysis
   * @private
   */
  async _callLLMForAnalysis(prompt) {
    const anthropic = require('@anthropic-ai/sdk');

    const clientOptions = { apiKey: this.anthropicApiKey };
    if (this.anthropicBaseUrl) {
      clientOptions.baseURL = this.anthropicBaseUrl;
    }

    const client = new anthropic.Anthropic(clientOptions);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  }

  /**
   * Parse LLM response
   * @private
   */
  _parseFixResponse(responseText) {
    // Parse the structured response from LLM
    const lines = responseText.split('\n');
    const result = {
      hasFix: false,
      needsReplyOnly: false,
      needsRevertFile: false,
      needsDeleteLines: false,
      filePath: '',
      deleteLines: [],
      fixDescription: '',
      originalCode: '',
      fixedCode: '',
      reason: ''
    };

    let currentSection = null;

    for (const line of lines) {
      if (line.includes('HAS_FIX:')) {
        result.hasFix = line.includes('true');
      } else if (line.includes('NEEDS_REPLY_ONLY:')) {
        result.needsReplyOnly = line.includes('true');
      } else if (line.includes('NEEDS_REVERT_FILE:')) {
        result.needsRevertFile = line.includes('true');
      } else if (line.includes('NEEDS_DELETE_LINES:')) {
        result.needsDeleteLines = line.includes('true');
      } else if (line.includes('DELETE_LINES:')) {
        const linesStr = line.replace('DELETE_LINES:', '').trim();
        // Parse lines array or range
        result.deleteLines = this._parseDeleteLines(linesStr);
      } else if (line.includes('FILE_PATH:')) {
        result.filePath = line.replace('FILE_PATH:', '').trim();
      } else if (line.includes('FIX_DESCRIPTION:')) {
        result.fixDescription = line.replace('FIX_DESCRIPTION:', '').trim();
        currentSection = 'fixDescription';
      } else if (line.includes('ORIGINAL_CODE:')) {
        currentSection = 'originalCode';
      } else if (line.includes('FIXED_CODE:')) {
        currentSection = 'fixedCode';
      } else if (line.includes('REASON:')) {
        result.reason = line.replace('REASON:', '').trim();
        currentSection = 'reason';
      } else if (currentSection) {
        if (currentSection === 'fixDescription') {
          result.fixDescription += line;
        } else if (currentSection === 'originalCode') {
          result.originalCode += line + '\n';
        } else if (currentSection === 'fixedCode') {
          result.fixedCode += line + '\n';
        } else if (currentSection === 'reason') {
          result.reason += line + '\n';
        }
      }
    }

    // Clean up trailing newlines
    result.originalCode = result.originalCode.trim();
    result.fixedCode = result.fixedCode.trim();
    result.reason = result.reason.trim();

    return result;
  }

  /**
   * Parse DELETE_LINES specification
   * @private
   */
  _parseDeleteLines(linesStr) {
    const lines = [];
    const parts = linesStr.split(',').map(p => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(n => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            lines.push(i);
          }
        }
      } else {
        const num = parseInt(part);
        if (!isNaN(num)) {
          lines.push(num);
        }
      }
    }

    return lines;
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

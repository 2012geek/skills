/**
 * Browser-based GitCode Issue operations.
 *
 * The GitCode API's state_event=close is silently ignored (confirmed bug),
 * so closing issues requires the web UI. This module:
 * 1. Opens a visible browser for manual login (once) → extracts xauth_token
 * 2. Uses xauth_token via Puppeteer to close issues through the web UI
 */

const fs = require('fs');
const path = require('path');

const XAUTH_CACHE_FILE = path.join(
  process.env.HOME || '/tmp',
  '.gitcode-xauth-cache.json'
);

class BrowserIssue {
  constructor(config) {
    this.config = config.gitcode;
    // Wayland/GNOME compat: force X11 backend and correct schema dir for Chrome
    process.env.QT_QPA_PLATFORM = 'xcb';
    process.env.GDK_BACKEND = 'x11';
    process.env.GSETTINGS_SCHEMA_DIR = '/usr/share/glib-2.0/schemas';
  }

  _loadPuppeteer() {
    const puppeteerExtra = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    puppeteerExtra.use(StealthPlugin());
    return puppeteerExtra;
  }

  /**
   * Step 1: Manual login — opens a visible browser, user logs in,
   * extracts xauth_token from localStorage, caches it for reuse.
   * Call this once; the token is cached for 24 hours.
   * @returns {Promise<string>} xauth_token
   */
  async login() {
    const puppeteerExtra = this._loadPuppeteer();

    // Check cache first
    const cached = this._getCachedToken();
    if (cached) {
      console.log(`Using cached xauth_token (${cached.age}h old)`);
      return cached.token;
    }

    console.log('Opening GitCode login page — please log in manually.');

    const browser = await puppeteerExtra.launch({
      headless: false,
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1024,768'
      ],
      defaultViewport: { width: 1024, height: 768 }
    });

    const page = await browser.newPage();
    await page.goto('https://gitcode.com/login', { waitUntil: 'networkidle2' });

    console.log('Waiting for login (up to 5 minutes)...');

    const maxWaitMs = 300000;
    const startTime = Date.now();
    let xauthToken = null;

    while (!xauthToken && (Date.now() - startTime) < maxWaitMs) {
      try {
        xauthToken = await page.evaluate(() => {
          return localStorage.getItem('xauth_token')
            || localStorage.getItem('access_token');
        });
      } catch (_) {}

      if (!xauthToken) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!xauthToken) {
      await browser.close();
      throw new Error('Login timeout — no xauth_token found after 5 minutes');
    }

    console.log('Login detected! xauth_token extracted.');

    // Cache the token
    const cacheData = {
      token: xauthToken,
      extracted_at: new Date().toISOString()
    };
    fs.writeFileSync(XAUTH_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log('Token cached to:', XAUTH_CACHE_FILE);

    // Also dump all cookies for reuse
    const cookies = await page.cookies();
    const cookieCache = {
      cookies,
      saved_at: new Date().toISOString()
    };
    fs.writeFileSync(
      path.join(path.dirname(XAUTH_CACHE_FILE), '.gitcode-cookies-cache.json'),
      JSON.stringify(cookieCache, null, 2)
    );

    await new Promise(r => setTimeout(r, 3000));
    await browser.close();

    return xauthToken;
  }

  _getCachedToken() {
    if (!fs.existsSync(XAUTH_CACHE_FILE)) return null;
    try {
      const cache = JSON.parse(fs.readFileSync(XAUTH_CACHE_FILE, 'utf-8'));
      const ageMs = Date.now() - new Date(cache.extracted_at).getTime();
      const ageHours = Math.round(ageMs / 3600000);
      if (ageMs < 24 * 60 * 60 * 1000) {
        return { token: cache.token, age: ageHours };
      }
    } catch (_) {}
    return null;
  }

  _getCachedCookies() {
    const cookieFile = path.join(path.dirname(XAUTH_CACHE_FILE), '.gitcode-cookies-cache.json');
    if (!fs.existsSync(cookieFile)) return null;
    try {
      const cache = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
      const ageMs = Date.now() - new Date(cache.saved_at).getTime();
      if (ageMs < 24 * 60 * 60 * 1000) {
        return cache.cookies;
      }
    } catch (_) {}
    return null;
  }

  /**
   * Step 2: Close an issue via the web UI using cached auth.
   * Requires prior login() call to have cached xauth_token and cookies.
   * @param {number} issueNumber
   * @returns {Promise<Object>} { ok, state, issue_state, issueNumber }
   */
  async closeIssue(issueNumber) {
    const puppeteerExtra = this._loadPuppeteer();
    const cachedCookies = this._getCachedCookies();

    if (!cachedCookies) {
      return {
        ok: false,
        error: 'No cached cookies — run login() first to establish web session',
        issueNumber
      };
    }

    const browser = await puppeteerExtra.launch({
      headless: 'new',
      executablePath: '/usr/bin/google-chrome',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage'
      ]
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Restore all cookies from login session
      await page.setCookie(...cachedCookies);

      const issueUrl = `https://gitcode.com/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`;

      // Set up network interception to capture the internal API call
      // that the web UI makes when closing an issue
      const apiCalls = [];
      page.on('request', req => {
        if (req.url().includes('/api/') && ['PATCH', 'PUT', 'POST'].includes(req.method())) {
          apiCalls.push({
            url: req.url(),
            method: req.method(),
            body: req.postData(),
            headers: req.headers()
          });
        }
      });

      await page.goto(issueUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise(r => setTimeout(r, 5000));

      // Verify we're logged in
      const loggedIn = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const loginBtn = btns.find(b => b.textContent.trim() === '登录');
        return !loginBtn;
      });

      if (!loggedIn) {
        await browser.close();
        return {
          ok: false,
          error: 'Not logged in — cached cookies expired, run login() again',
          issueNumber
        };
      }

      // Find and click the close/state change element on the issue page
      // GitCode issue pages have a state dropdown that transitions:
      // 待办理 → 进行中 → 已完成
      const clickResult = await page.evaluate(() => {
        // Strategy 1: Look for state dropdown/badge that shows current state
        // These are typically clickable to reveal state options
        const stateKeywords = ['待办', '进行中', '已完成', 'open', 'progressing', 'completed'];
        const allClickable = Array.from(document.querySelectorAll(
          'button, a, [role="button"], [role="listbox"], [role="option"], .dropdown-trigger, .state-item, [class*="state"], [class*="status"]'
        ));

        for (const el of allClickable) {
          const text = (el.textContent || '').trim();
          for (const kw of stateKeywords) {
            if (text.includes(kw)) {
              el.click();
              return { clicked: true, elementText: text, method: 'state_element_click' };
            }
          }
        }

        // Strategy 2: Look for explicit "Close Issue" / "关闭" button
        const closeKeywords = ['close issue', '关闭issue', '关闭', 'close'];
        const allButtons = Array.from(document.querySelectorAll('button, a[role="button"]'));
        for (const btn of allButtons) {
          const text = (btn.textContent || '').trim().toLowerCase();
          for (const kw of closeKeywords) {
            if (text === kw || text.startsWith(kw)) {
              btn.click();
              return { clicked: true, buttonText: btn.textContent.trim(), method: 'close_button_click' };
            }
          }
        }

        return { clicked: false, method: 'no_close_element_found' };
      });

      // If we clicked a state element, wait for dropdown to appear,
      // then click "已完成" option
      if (clickResult.clicked && clickResult.method === 'state_element_click') {
        await new Promise(r => setTimeout(r, 1000));

        // Look for the 已完成 option in the now-visible dropdown
        const selectedOption = await page.evaluate(() => {
          const options = Array.from(document.querySelectorAll(
            '[role="option"], .dropdown-item, li, .menu-item, option'
          ));
          for (const opt of options) {
            const text = (opt.textContent || '').trim();
            if (text.includes('已完成') || text.includes('Completed') || text.includes('已关闭') || text.includes('Closed')) {
              opt.click();
              return { selected: true, optionText: text };
            }
          }
          return { selected: false };
        });

        if (selectedOption.selected) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Wait for any state transition to complete
      await new Promise(r => setTimeout(r, 3000));

      // Log captured API calls for debugging
      if (apiCalls.length > 0) {
        console.log('Internal API calls captured during close operation:');
        for (const call of apiCalls) {
          console.log(`  ${call.method} ${call.url.substring(0, 100)}`);
          if (call.body) console.log(`  body: ${call.body.substring(0, 200)}`);
        }
      }

      // Verify final state
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 3000));

      const finalState = await page.evaluate(() => {
        // Check for 已完成/已关闭 badge or text
        const allText = document.body.innerText;
        if (allText.includes('已完成') || allText.includes('Completed')) {
          return { state: 'closed', issue_state: '已完成' };
        }
        if (allText.includes('已关闭') || allText.includes('Closed')) {
          return { state: 'closed', issue_state: '已关闭' };
        }

        // Check specific state badges
        const badges = Array.from(document.querySelectorAll(
          '[class*="state"], [class*="status"], .badge, .label, .g-label-tag'
        ));
        for (const badge of badges) {
          const t = badge.textContent.trim();
          if (t.includes('已完成') || t.includes('Completed')) return { state: 'closed', issue_state: '已完成' };
          if (t.includes('已关闭') || t.includes('Closed')) return { state: 'closed', issue_state: '已关闭' };
          if (t.includes('进行中') || t.includes('Progressing')) return { state: 'open', issue_state: '进行中' };
          if (t.includes('待办') || t.includes('Open')) return { state: 'open', issue_state: '待办的' };
        }

        return { state: 'unknown', issue_state: 'unknown' };
      });

      await browser.close();

      return {
        ok: finalState.state === 'closed',
        state: finalState.state,
        issue_state: finalState.issue_state,
        method: clickResult.clicked ? clickResult.method : 'no_action_taken',
        apiCalls,
        issueNumber
      };
    } catch (error) {
      await browser.close();
      return { ok: false, error: error.message, issueNumber };
    }
  }

  /**
   * One-shot: login + close in sequence.
   * If cached token exists, skips login step.
   * @param {number} issueNumber
   * @returns {Promise<Object>} same as closeIssue
   */
  async loginAndClose(issueNumber) {
    // Will use cached token if available
    await this.login();
    return await this.closeIssue(issueNumber);
  }
}

module.exports = { BrowserIssue };

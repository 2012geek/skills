/**
 * xauth_token extractor for GitCode nested reply support
 * Opens a browser for manual login, then extracts xauth_token from localStorage
 * Uses puppeteer-extra with stealth plugin for WAF bypass
 * Usage: node scripts/xauth-extractor.js
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const https = require('https');

// Cache in the user's home directory so it survives plugin reinstalls / cache
// clears and is not trapped inside the plugin scripts dir. Also matches the
// path the rest of the ecosystem expects (~/.gitcode-xauth-cache.json).
const XAUTH_CACHE_FILE = path.join(require('os').homedir(), '.gitcode-xauth-cache.json');

// GitCode xauth tokens last up to ~24h in practice, but get invalidated
// earlier sometimes (logout, rotation, server-side expiry). The probe
// (isXauthTokenValid) catches real invalidation, but we still gate on age
// to avoid running the probe on obviously stale tokens. 12h keeps the
// probe running for tokens that are likely still valid, while still
// short-circuiting before a stale token produces 401s during the apply.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Probe whether the xauth_token still works by calling GitCode's internal API.
 * A GET on this endpoint returns 405 when authenticated (method not allowed,
 * but WAF accepted us) and 401/418 when the token is stale or WAF blocks.
 *
 * @param {string} xauthToken - Token to probe
 * @param {{owner:string,repo:string}} repoInfo - Repo for the Referer header
 * @returns {Promise<boolean>} true if the token still authenticates
 */
async function isXauthTokenValid(xauthToken, repoInfo) {
  if (!xauthToken) return false;
  const encodedProject = encodeURIComponent(`${repoInfo.owner}/${repoInfo.repo}`);
  const encodedRepoId = encodeURIComponent(encodedProject);
  const probePath = `/issuepr/api/v1/projects/${encodedProject}/merge_requests/1/discussions/nonexistent/notes?repoId=${encodedRepoId}&iid=1`;

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'web-api.gitcode.com',
      port: 443,
      path: probePath,
      method: 'POST',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Content-Length': 2,
        'Origin': 'https://gitcode.com',
        'Referer': `https://gitcode.com/${repoInfo.owner}/${repoInfo.repo}/pull/1`,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Authorization': `Bearer ${xauthToken}`,
        'Cookie': `access_token=${xauthToken}; xauth_token=${xauthToken}`,
        'x-platform': 'web',
        'x-app-channel': 'gitcode-fe',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // 401/403/418 = bad token or WAF block; 400/404/500 = token works,
        // request was just shaped wrong. We only need to distinguish auth failure.
        const code = res.statusCode;
        const isHtml = data.trimStart().startsWith('<');
        resolve(code !== 401 && code !== 403 && code !== 418 && !(code >= 400 && isHtml));
      });
    });
    req.on('error', () => resolve(false));
    req.write('{}');
    req.end();
  });
}

async function extractXauthToken() {
  console.log('Opening GitCode login page in browser...');
  console.log('Please log in manually. The script will detect when you\'re logged in.');

  const browser = await puppeteerExtra.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1024,768',
    ],
    defaultViewport: { width: 1024, height: 768 },
  });

  const page = await browser.newPage();
  await page.goto('https://gitcode.com/login', { waitUntil: 'networkidle2' });

  console.log('\n=== Waiting for manual login ===');
  console.log('Login page opened. Please log in with your GitCode account.');
  console.log('The script will automatically detect when you\'ve logged in.\n');

  // Poll localStorage for xauth_token every 2 seconds
  let xauthToken = null;
  const maxWaitMs = 300000; // 5 minutes
  const startTime = Date.now();

  while (!xauthToken && (Date.now() - startTime) < maxWaitMs) {
    try {
      xauthToken = await page.evaluate(() => {
        return localStorage.getItem('xauth_token') || localStorage.getItem('access_token');
      });
    } catch (e) {
      // page may be navigating, ignore
    }

    if (!xauthToken) {
      await new Promise(r => setTimeout(r, 2000));
      const currentUrl = page.url();
      if (!currentUrl.includes('login') && !currentUrl.includes('signin')) {
        console.log('Detected navigation away from login page, checking for token...');
      }
    }
  }

  if (!xauthToken) {
    console.error('Timeout: No xauth_token found after 5 minutes.');
    await browser.close();
    return null;
  }

  console.log('\n✓ Login detected! xauth_token extracted successfully.');
  console.log('Token length:', xauthToken.length);
  console.log('Token preview:', xauthToken.substring(0, 8) + '...');

  // Cache the token for reuse
  const cacheData = {
    token: xauthToken,
    extracted_at: new Date().toISOString(),
    user_page: page.url(),
  };
  fs.writeFileSync(XAUTH_CACHE_FILE, JSON.stringify(cacheData, null, 2));
  console.log('Token cached to:', XAUTH_CACHE_FILE);

  // Navigate to gitcode.com to verify access
  await page.goto('https://gitcode.com/', { waitUntil: 'networkidle2' });
  console.log('Navigated to gitcode.com to verify token access.');

  // Keep browser open for a moment so user can see
  console.log('\nClosing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();

  return xauthToken;
}

async function getXauthToken(repoInfo) {
  // Try cached token first — but probe it before trusting, because GitCode
  // invalidates xauth tokens server-side without notice.
  if (fs.existsSync(XAUTH_CACHE_FILE)) {
    const cache = JSON.parse(fs.readFileSync(XAUTH_CACHE_FILE, 'utf-8'));
    const token = cache.xauth_token || cache.token;
    const extractedAt = cache.extracted_at;
    const ageMs = extractedAt ? Date.now() - new Date(extractedAt).getTime() : Infinity;

    if (token && ageMs < CACHE_TTL_MS) {
      const owner = repoInfo?.owner || 'openeuler';
      const repo = repoInfo?.repo || 'vla-factory';
      const valid = await isXauthTokenValid(token, { owner, repo });
      if (valid) {
        console.log(`Using cached xauth_token (age: ${Math.round(ageMs / 60000)}m, validated)`);
        return token;
      }
      console.log(`Cached xauth_token rejected by GitCode (age: ${Math.round(ageMs / 60000)}m), need fresh login.`);
    } else if (token) {
      console.log(`Cached xauth_token expired (age: ${Math.round(ageMs / 3600000)}h > ${CACHE_TTL_MS / 3600000}h), need fresh login.`);
    }
  }

  // Need manual login
  return await extractXauthToken();
}

// If run directly, extract and cache the token
if (require.main === module) {
  getXauthToken().then(token => {
    if (token) {
      console.log('\nDone! xauth_token is cached and ready for nested reply posting.');
    } else {
      console.log('\nFailed to extract xauth_token.');
    }
    process.exit(token ? 0 : 1);
  }).catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = { getXauthToken, extractXauthToken };

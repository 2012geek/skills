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

const XAUTH_CACHE_FILE = path.join(__dirname, '..', '.xauth-cache.json');

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
    xauth_token: xauthToken,
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

async function getXauthToken() {
  // Try cached token first
  if (fs.existsSync(XAUTH_CACHE_FILE)) {
    const cache = JSON.parse(fs.readFileSync(XAUTH_CACHE_FILE, 'utf-8'));
    const ageMs = Date.now() - new Date(cache.extracted_at).getTime();
    // Use cached token if less than 24 hours old
    if (ageMs < 24 * 60 * 60 * 1000) {
      console.log('Using cached xauth_token (age: ' + Math.round(ageMs / 3600000) + 'h)');
      return cache.xauth_token;
    }
    console.log('Cached xauth_token expired, need fresh login.');
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

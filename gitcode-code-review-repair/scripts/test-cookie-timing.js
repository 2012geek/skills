/**
 * Test cookie timing and stealth plugin
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const token = 'hxE6zrUBGsSiauzuH7hJtUcn';

  // Try setting cookies BEFORE navigation
  console.log('Setting cookies before navigation...');
  await page.setCookie({
    name: 'gitcode_token',
    value: token,
    domain: '.gitcode.com',
    path: '/'
  });

  console.log('Navigating to PR page...');
  await page.goto('https://gitcode.com/openeuler/lerobot_ros2/pull/50', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await new Promise(r => setTimeout(r, 5000));

  const content = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      firstLine: text.split('\n')[0],
      hasReview: text.includes('Review comments resolved'),
      preview: text.substring(0, 800)
    };
  });

  console.log('Result:', JSON.stringify(content, null, 2));

  await browser.close();
})();

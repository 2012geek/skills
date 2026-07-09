/**
 * Test script for debugging web scraping
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

  // Intercept ALL API calls
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('api.gitcode.com')) {
      apiCalls.push({ url, status: response.status() });
    }
  });

  await page.goto('https://gitcode.com/openeuler/lerobot_ros2/pull/50', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await new Promise(r => setTimeout(r, 8000));

  console.log('\nAll GitCode API calls:');
  apiCalls.forEach(({url, status}) => console.log(` ${status}: ${url}`));

  // Also check page content
  const content = await page.evaluate(() => {
    const text = document.body.innerText;
    const hasReview = text.includes('Review comments');
    const hasChineseReview = text.includes('评审意见');

    return {
      hasReview,
      hasChineseReview,
      textLength: text.length,
      preview: text.substring(0, 500)
    };
  });

  console.log('\nPage content:', JSON.stringify(content, null, 2));

  await browser.close();
})();

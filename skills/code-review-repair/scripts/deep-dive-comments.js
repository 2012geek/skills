/**
 * Deep dive into comment-related elements
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

  await page.setCookie({
    name: 'gitcode_token',
    value: 'hxE6zrUBGsSiauzuH7hJtUcn',
    domain: '.gitcode.com',
    path: '/'
  });

  await page.goto('https://gitcode.com/openeuler/lerobot_ros2/pull/50', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  await new Promise(r => setTimeout(r, 3000));

  // Click Files tab
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('a, button, [role="tab"]'));
    const filesButton = buttons.find(btn => btn.textContent.includes('Files changed'));
    if (filesButton) filesButton.click();
  });

  await new Promise(r => setTimeout(r, 5000));

  const commentDetails = await page.evaluate(() => {
    const results = [];

    // Find all elements with comment-related classes
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const classes = el.className?.toString() || '';
      if (classes.includes('discussion') || classes.includes('comment') ||
          classes.includes('thread') || classes.includes('note')) {
        const text = el.textContent?.trim() || '';
        // Only include elements with meaningful text (not just icons, etc)
        if (text.length > 10 && text.length < 500) {
          results.push({
            tag: el.tagName,
            className: classes,
            text: text.substring(0, 200),
            hasResolved: text.includes('resolved') || text.includes('已解决')
          });
        }
        if (results.length >= 20) break;
      }
    }

    return results;
  });

  console.log('\nComment-related elements:', JSON.stringify(commentDetails, null, 2));

  await browser.close();
})();

/**
 * Debug page elements to find review comments
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

  await new Promise(r => setTimeout(r, 8000));

  const debug = await page.evaluate(() => {
    // Check all elements that might contain review comments
    const results = {
      allElementsWithComment: [],
      diffSections: [],
      textSamples: []
    };

    // Find all elements with "comment" in class name
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.className && el.className.toString().includes('comment')) {
        results.allElementsWithComment.push({
          tag: el.tagName,
          className: el.className,
          text: el.textContent.substring(0, 100)
        });
      }
    }

    // Find diff sections
    const diffs = document.querySelectorAll('[class*="diff"], [class*="file"]');
    results.diffSections = Array.from(diffs).slice(0, 5).map(el => ({
      className: el.className,
      text: el.textContent.substring(0, 200)
    }));

    // Get text samples around "Review comments resolved"
    const allText = document.body.innerText;
    const idx = allText.indexOf('Review comments resolved');
    if (idx !== -1) {
      results.textSamples.push({
        label: 'Around "Review comments resolved"',
        text: allText.substring(idx - 200, idx + 500)
      });
    }

    // Find "0/1" text and context
    const matchIdx = allText.indexOf('0/1');
    if (matchIdx !== -1) {
      results.textSamples.push({
        label: 'Around "0/1"',
        text: allText.substring(matchIdx - 200, matchIdx + 500)
      });
    }

    return results;
  });

  console.log('\n=== Page Debug Info ===\n');
  console.log('Elements with "comment" in class:', JSON.stringify(debug.allElementsWithComment.slice(0, 10), null, 2));
  console.log('\nDiff sections:', JSON.stringify(debug.diffSections, null, 2));
  console.log('\nText samples:', JSON.stringify(debug.textSamples, null, 2));

  await browser.close();
})();

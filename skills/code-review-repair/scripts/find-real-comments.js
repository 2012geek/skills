/**
 * Find actual review comment elements on the page
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

  const reviewInfo = await page.evaluate(() => {
    // Look for review discussion elements
    const results = {
      discussionElements: [],
      threadElements: [],
      commentBodies: [],
      allDivs: []
    };

    // Find elements with specific classes
    const discussionEls = document.querySelectorAll('[class*="discussion"], [class*="thread"], [class*="review-comment"], [class*="note"]');
    results.discussionElements = Array.from(discussionEls).slice(0, 5).map(el => ({
      className: el.className,
      tag: el.tagName,
      text: el.textContent.substring(0, 200)
    }));

    // Look for elements that look like review comments
    // They should have meaningful text content (not just diff content)
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      const text = div.textContent?.trim() || '';
      // Skip if it's just diff content (contains @@, +, - patterns)
      if (text.length > 20 && text.length < 1000 &&
          !text.includes('@@') &&
          !text.match(/^\s*[+-]/m) &&
          !div.querySelector('table, tr, td')) {
        results.allDivs.push({
          className: div.className,
          text: text.substring(0, 150)
        });
      }
      if (results.allDivs.length >= 10) break;
    }

    // Check if there's any unresolved marker
    const hasUnresolved = document.body.textContent.includes('unresolved') ||
                         document.body.textContent.includes('未解决');

    results.hasUnresolved = hasUnresolved;

    return results;
  });

  console.log('Review info:', JSON.stringify(reviewInfo, null, 2));

  await browser.close();
})();

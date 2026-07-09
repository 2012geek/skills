/**
 * Scroll and check for lazy-loaded review comments
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

  // Scroll down to load more content
  console.log('Scrolling down...');
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight / 2);
  });

  await new Promise(r => setTimeout(r, 3000));

  // Check for review comments again
  const reviewCheck = await page.evaluate(() => {
    // Look for elements that contain review comment text
    // Review comments typically have:
    // 1. User mentions (@username)
    // 2. Code references
    // 3. Questions or suggestions
    // 4. Not just diff content

    const allText = document.body.innerText;

    // Look for "Show comment" or similar expand buttons
    const expandButtons = Array.from(document.querySelectorAll('button, a'))
      .filter(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('show') || text.includes('展开') ||
               text.includes('comment') || text.includes('评论');
      })
      .slice(0, 5)
      .map(btn => ({ text: btn.textContent, className: btn.className }));

    // Look for collapsed/hidden discussion sections
    const collapsedSections = Array.from(document.querySelectorAll('[class*="collapsed"], [class*="hidden"], details, summary'))
      .slice(0, 5)
      .map(el => ({ tag: el.tagName, className: el.className, text: el.textContent.substring(0, 100) }));

    // Count elements that might be review comments
    const possibleComments = Array.from(document.querySelectorAll('*'))
      .filter(el => {
        const classes = el.className?.toString() || '';
        return classes.includes('discussion') || classes.includes('comment') ||
               classes.includes('thread') || classes.includes('note');
      })
      .length;

    return {
      expandButtons,
      collapsedSections,
      possibleCommentsCount: possibleComments,
      bodyLength: allText.length,
      // Check for "resolved" indicators
      hasResolvedIndicator: allText.includes('resolved') || allText.includes('已解决')
    };
  });

  console.log('Review check after scroll:', JSON.stringify(reviewCheck, null, 2));

  await browser.close();
})();

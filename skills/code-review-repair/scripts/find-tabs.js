/**
 * Find tabs and buttons on the PR page
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

  await new Promise(r => setTimeout(r, 5000));

  const tabs = await page.evaluate(() => {
    // Find all tabs and buttons
    const allButtons = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
    return allButtons
      .filter(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('file') || text.includes('changes') || text.includes('commit') ||
               text.includes('diff') || text.includes('文件') || text.includes('变更');
      })
      .map(btn => ({
        tag: btn.tagName,
        text: btn.textContent.trim(),
        className: btn.className
      }))
      .slice(0, 20);
  });

  console.log('Tabs/Buttons related to files/changes:', JSON.stringify(tabs, null, 2));

  // Try clicking on "Files changed" if found
  const filesTab = tabs.find(t => t.text.toLowerCase().includes('file') || t.text.toLowerCase().includes('文件'));
  if (filesTab) {
    console.log(`\nClicking on: ${filesTab.text}`);

    await page.evaluate((tabText) => {
      const buttons = Array.from(document.querySelectorAll('button, a, [role="tab"]'));
      const button = buttons.find(btn => btn.textContent.trim() === tabText);
      if (button) {
        button.click();
      }
    }, filesTab.text);

    await new Promise(r => setTimeout(r, 5000));

    // Check for diff sections after clicking
    const afterClick = await page.evaluate(() => {
      const diffs = document.querySelectorAll('[class*="diff"], [class*="file"]');
      return {
        diffCount: diffs.length,
        hasFileContent: !!document.querySelector('.file-content, .diff-content')
      };
    });

    console.log('After click:', JSON.stringify(afterClick, null, 2));
  }

  await browser.close();
})();

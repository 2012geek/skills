const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  // Listen to console messages
  page.on('console', msg => {
    console.log('Browser console:', msg.text());
  });

  try {
    await page.goto('http://localhost:3030', { waitUntil: 'networkidle0' });

    // Wait for page to load
    await page.waitForTimeout(3000);

    // Check for v-click elements
    const vClickElements = await page.evaluate(() => {
      const elements = document.querySelectorAll('[v-click]');
      return {
        count: elements.length,
        elements: Array.from(elements).map(el => ({
          tagName: el.tagName,
          classList: el.className,
          style: el.cssText
        }))
      };
    });

    console.log('Elements with v-click attribute:', JSON.stringify(vClickElements, null, 2));

    // Check for slidev-vclick classes
    const vclickClasses = await page.evaluate(() => {
      const elements = document.querySelectorAll('.slidev-vclick-target');
      return {
        count: elements.length,
        elements: Array.from(elements).map(el => ({
          tagName: el.tagName,
          className: el.className,
          textContent: el.textContent.substring(0, 50)
        }))
      };
    });

    console.log('Elements with slidev-vclick-target class:', JSON.stringify(vclickClasses, null, 2));

    // Take screenshot
    await page.screenshot({ path: '/tmp/vclick-test.png', fullPage: false });

    console.log('Screenshot saved to /tmp/vclick-test.png');

    // Try clicking
    await page.keyboard.press('Space');
    await page.waitForTimeout(1000);

    const afterClick = await page.evaluate(() => {
      const elements = document.querySelectorAll('.slidev-vclick-target');
      return {
        count: elements.length,
        hidden: document.querySelectorAll('.slidev-vclick-hidden').length
      };
    });

    console.log('After click:', JSON.stringify(afterClick, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
})();

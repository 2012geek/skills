#!/usr/bin/env node

/**
 * Debug script to find the REAL document content in Tencent Docs
 * Looks for edit mode, iframes, and actual content areas
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

const SPACE_URL = 'https://docs.qq.com/space/DZmNFWUZTVkVpYpYnpF?nlc=1';
const USER_DATA_DIR = path.join(process.cwd(), '.tencent-docs-session');
const DEBUG_DIR = path.join(process.cwd(), '.debug-real-content');

async function main() {
  await fs.mkdir(DEBUG_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=2560,1440']
  });

  const page = await browser.newPage();

  console.log('Navigating to space...');
  await page.goto(SPACE_URL, { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 5000));

  // Find "文档说明" item
  const targetNodeId = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.base-tree-sortable-item[data-node-id]'));
    for (const item of items) {
      const titleEl = item.querySelector('[data-testid="file-list-item-title"]');
      if (titleEl && titleEl.textContent.trim() === '文档说明') {
        return item.getAttribute('data-node-id');
      }
    }
    return null;
  });

  if (!targetNodeId) {
    console.log('❌ Could not find 文档说明');
    await browser.close();
    return;
  }

  console.log('Found 文档说明, node ID:', targetNodeId);

  // Click on it
  await page.evaluate((id) => {
    const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    if (item) item.click();
  }, targetNodeId);

  await new Promise(r => setTimeout(r, 5000));

  // Take screenshot
  await page.screenshot({ path: path.join(DEBUG_DIR, '01-after-click.png'), fullPage: true });
  console.log('Screenshot 1 saved');

  // Try to find and click "Edit" button or switch to edit mode
  console.log('\nLooking for edit button or mode switcher...');

  const editButtonFound = await page.evaluate(() => {
    // Look for edit button
    const editButtons = Array.from(document.querySelectorAll('button, [role="button"], [class*="edit"]')).filter(btn => {
      const text = btn.textContent || '';
      return text.includes('编辑') || text.includes('Edit') || text.includes('写') || text.includes('Write');
    });

    if (editButtons.length > 0) {
      editButtons[0].click();
      return true;
    }

    // Look for mode switcher
    const modeSwitchers = document.querySelectorAll('[class*="switch"], [class*="mode"], [class*="tab"]');
    modeSwitchers.forEach(el => {
      if (el.textContent.includes('编辑') || el.textContent.includes('Edit')) {
        el.click();
      }
    });

    return editButtons.length > 0;
  });

  if (editButtonFound) {
    console.log('✅ Clicked edit button');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('⚠️  No edit button found');
  }

  await page.screenshot({ path: path.join(DEBUG_DIR, '02-after-edit-click.png'), fullPage: true });
  console.log('Screenshot 2 saved');

  // Look for iframes
  const iframesInfo = await page.evaluate(() => {
    const iframes = Array.from(document.querySelectorAll('iframe'));
    return iframes.map((f, idx) => ({
      index: idx,
      src: f.src,
      id: f.id,
      name: f.name,
      classList: f.className,
      title: f.title
    }));
  });

  await fs.writeFile(
    path.join(DEBUG_DIR, 'iframes.json'),
    JSON.stringify(iframesInfo, null, 2),
    'utf-8'
  );
  console.log('Found', iframesInfo.length, 'iframes - saved to iframes.json');

  // Try to access iframe content
  if (iframesInfo.length > 0) {
    for (const iframe of iframesInfo) {
      if (iframe.src && iframe.src.includes('docs.qq')) {
        console.log(`\nTrying to access iframe ${iframe.index}...`);
        try {
          await page.goto(iframe.src, { waitUntil: 'networkidle2', timeout: 10000 });
          await new Promise(r => setTimeout(r, 3000));

          const iframeContent = await page.evaluate(() => {
            return document.body.textContent.substring(0, 2000);
          });

          console.log('Iframe content preview:', iframeContent.substring(0, 500));
        } catch (e) {
          console.log('Could not access iframe:', e.message);
        }
      }
    }
  }

  // Look for any element containing "文档目标" or "wiki"
  console.log('\nSearching for target text in all elements...');
  const targetElements = await page.evaluate(() => {
    const results = [];

    // Search all elements
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
      const text = el.textContent || '';
      if ((text.includes('文档目标') || text.includes('wiki体系')) && text.length < 10000 && text.length > 50) {
        // Found it!
        results.push({
          tagName: el.tagName,
          className: el.className,
          id: el.id,
          dataAttrs: Array.from(el.attributes).map(a => ({ name: a.name, value: a.value })),
          textPreview: text.substring(0, 500),
          fullText: text
        });
      }
    }

    return results;
  });

  if (targetElements.length > 0) {
    await fs.writeFile(
      path.join(DEBUG_DIR, 'target-elements.json'),
      JSON.stringify(targetElements, null, 2),
      'utf-8'
    );
    console.log('✅ Found', targetElements.length, 'elements with target text!');
    console.log('Saved to target-elements.json');
  } else {
    console.log('❌ Target text not found in any element');
  }

  // Also try double-clicking on the item
  console.log('\nTrying double-click...');
  await page.evaluate((id) => {
    const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    if (item) {
      // Double click
      item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
  }, targetNodeId);

  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: path.join(DEBUG_DIR, '03-after-dblclick.png'), fullPage: true });
  console.log('Screenshot 3 saved (after double-click)');

  // Check again for target text
  const afterDblClick = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const text = el.textContent || '';
      if ((text.includes('文档目标') || text.includes('wiki体系')) && text.length < 10000 && text.length > 50) {
        return {
          found: true,
          textPreview: text.substring(0, 500)
        };
      }
    }
    return { found: false };
  });

  if (afterDblClick.found) {
    await fs.writeFile(
      path.join(DEBUG_DIR, 'after-dblclick.json'),
      JSON.stringify(afterDblClick, null, 2),
      'utf-8'
    );
    console.log('✅ Found target text after double-click!');
  }

  console.log('\nAll screenshots saved to:', DEBUG_DIR);
  console.log('Check the files to understand the page structure.');
  console.log('Press Ctrl+C to exit...');

  await new Promise(() => {});
}

main().catch(console.error);

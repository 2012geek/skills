#!/usr/bin/env node

/**
 * Tencent Docs Space Downloader
 * Recursively downloads all documents from a Tencent Docs space
 * @version 2.0.0
 */

const puppeteer = require('puppeteer');
const TurndownService = require('turndown');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// ============================================================================
// CONSTANTS - Centralized configuration for maintainability
// ============================================================================

const CSS_SELECTORS = {
  TREE_ITEM: '.base-tree-sortable-item[data-node-id]',
  FILE_TITLE: '[data-testid="file-list-item-title"]',
  SWITCHER: '.base-tree-item-switcher',
  CONTENT_AREA: '.css-1t3wwj8, [class*="e1w3g4nf1"]',
  SPLIT_VIEW: '.split-view-view',
  USER_INFO: '.user-info, [class*="user"], [class*="avatar"]'
};

const THRESHOLDS = {
  MIN_CONTENT_SIZE: 500,        // Minimum characters for valid content
  MIN_FILE_SIZE: 100,           // Minimum file size to consider exists
  MAX_DEPTH: 10,                // Maximum recursion depth
  MIN_CONTENT_PANEL_WIDTH: 500, // Minimum width for content panel detection
  MENU_KEYWORD_MATCH_THRESHOLD: 3, // Max menu keywords to still be considered content
  MENU_MIN_LENGTH: 1000         // Minimum length when menu keywords detected
};

const TIMING = {
  NAVIGATION_TIMEOUT: 8000,     // Page navigation timeout
  CONTENT_LOAD_DELAY: 4000,     // Wait after clicking document
  EXPANSION_DELAY: 3000,        // Wait after expanding directory
  COLLAPSE_DELAY: 500,          // Wait after collapsing directory
  INITIAL_LOAD_DELAY: 5000,     // Wait after initial page load
  LOGIN_CHECK_DELAY: 3000       // Wait before checking login status
};

const MENU_KEYWORDS = [
  'Apps', 'Study Outline', 'Key Points', 'Mind Map',
  'Presentation', 'Quiz', 'Flashcards', 'Create Content', 'Ask Space',
  'New Conversation', 'Selected', 'items', 'Add materials', 'Based on'
];

const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 2000,
  backoffMultiplier: 1.5
};

// Default configuration
const DEFAULT_CONFIG = {
  spaceUrl: 'https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1',
  outputDir: path.join(process.cwd(), 'tencent_auto_download'),
  headless: false,
  timeout: 60000,
  skipExisting: true,
  userDataDir: path.join(process.cwd(), '../.tencent-docs-session'),
  debug: false,
  screenshotDir: path.join(process.cwd(), '.debug-screenshots'),
  retryConfig: RETRY_CONFIG
};

// Turndown service for HTML to Markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

// Check if running in interactive mode
const isInteractive = process.stdin.isTTY;

// User input interface (only for interactive mode)
let rl = null;
function question(prompt) {
  if (!isInteractive) {
    return new Promise(resolve => {
      console.log(prompt);
      setTimeout(() => resolve(), 1000);
    });
  }
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return new Promise(resolve => rl.question(prompt, resolve));
}

/**
 * Check if file already exists and has content
 * @param {string} filepath - Path to check
 * @returns {Promise<boolean>} True if file exists and has sufficient content
 */
async function fileExistsWithContent(filepath) {
  try {
    const stats = await fs.stat(filepath);
    return stats.size > THRESHOLDS.MIN_FILE_SIZE;
  } catch {
    return false;
  }
}

/**
 * Sleep utility for delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {string} context - Context for error messages
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<*>} Result of the function
 */
async function retryWithBackoff(fn, context = 'operation', maxRetries = RETRY_CONFIG.maxRetries) {
  let lastError;
  let delay = RETRY_CONFIG.retryDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.log(`  ⚠️  ${context} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        await sleep(delay);
        delay = Math.floor(delay * RETRY_CONFIG.backoffMultiplier);
      }
    }
  }
  throw new Error(`${context} failed after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Take screenshot for debugging
 */
async function takeScreenshot(page, name) {
  try {
    await fs.mkdir(DEFAULT_CONFIG.screenshotDir, { recursive: true });
    const screenshotPath = path.join(DEFAULT_CONFIG.screenshotDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    return screenshotPath;
  } catch (e) {
    return null;
  }
}

/**
 * Main function
 */
async function main(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  console.log('Tencent Docs Space Downloader\n');

  // Create output directory
  await fs.mkdir(config.outputDir, { recursive: true });

  // Create user data directory for session persistence
  await fs.mkdir(config.userDataDir, { recursive: true });

  let browser;
  try {
    console.log('Launching browser...');
    console.log(`Session: ${config.userDataDir}`);
    browser = await puppeteer.launch({
      headless: config.headless,
      userDataDir: config.userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=2560,1440',
        '--start-maximized'
      ],
      defaultViewport: {
        width: 2560,
        height: 1440
      }
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(config.timeout);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await manualLogin(page, config);

    console.log(`\nAccessing space: ${config.spaceUrl}`);
    const result = await getSpaceDocumentList(page, config.spaceUrl, config.outputDir, config.skipExisting, config);

    console.log('\n' + '─'.repeat(50));
    console.log('Download complete!');
    console.log(`  Success: ${result.successCount} files`);
    console.log(`  Skipped: ${result.skipCount} files (already exist)`);
    console.log(`  Failed: ${result.failCount} files`);
    console.log(`  Output: ${config.outputDir}`);
    console.log('─'.repeat(50) + '\n');

    await question('\nPress Enter to exit...');

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
    if (rl) {
      rl.close();
    }
  }
}

/**
 * Manual login flow with session persistence
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {Object} config - Configuration object
 * @returns {Promise<void>}
 */
async function manualLogin(page, config) {
  // First try to access the space directly to check if we're already logged in
  console.log('Checking if already logged in...');
  await page.goto(config.spaceUrl, {
    waitUntil: 'networkidle2'
  });

  await sleep(TIMING.LOGIN_CHECK_DELAY);

  const isLoggedIn = await page.evaluate((selector) => {
    const items = document.querySelectorAll(selector);
    return items.length > 0;
  }, CSS_SELECTORS.TREE_ITEM);

  if (isLoggedIn) {
    console.log('✅ Already logged in! Using saved session.\n');
    return;
  }

  // Not logged in, need to do manual login
  console.log('Not logged in. Please log in manually.');
  await page.goto('https://docs.qq.com/', {
    waitUntil: 'networkidle2'
  });

  console.log('─'.repeat(50));
  console.log('Login Instructions:');
  console.log('1. A browser window has opened');
  console.log('2. Please complete login in the browser');
  console.log('3. Press Enter here when login is complete');
  console.log('─'.repeat(50) + '\n');

  await question('Press Enter after completing login...\n');

  const recheckLoggedIn = await page.evaluate((selector) => {
    const url = window.location.href;
    const hasUserInfo = document.querySelector(selector);
    return !url.includes('login') && hasUserInfo !== null;
  }, CSS_SELECTORS.USER_INFO);

  if (!recheckLoggedIn) {
    console.log('Warning: May not be logged in, continuing anyway...\n');
  } else {
    console.log('Login verified!\n');
  }
}

/**
 * Get document content with retry logic
 * @param {import('puppeteer').Page} page - Puppeteer page instance
 * @param {string} nodeId - Node ID to fetch content for
 * @param {string} title - Document title (for logging)
 * @returns {Promise<Object>} Document data with content and metadata
 */
async function getDocumentContent(page, nodeId, title) {
  return retryWithBackoff(async () => {
    await page.evaluate((id, selector) => {
      const item = document.querySelector(`${selector}[data-node-id="${id}"]`);
      if (item) {
        item.click();
      }
    }, nodeId, CSS_SELECTORS.TREE_ITEM);

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMING.NAVIGATION_TIMEOUT }).catch(() => {});
    await sleep(TIMING.CONTENT_LOAD_DELAY);

    const docData = await page.evaluate((selectors, thresholds, menuKeywords) => {
      // Try to find the specific content area first
      const contentArea = document.querySelector(selectors.CONTENT_AREA);

      if (contentArea) {
        const innerHTML = contentArea.innerHTML;
        const textContent = contentArea.textContent || '';

        // Check if it has meaningful content
        if (textContent.length > 100) {
          return {
            content: innerHTML,
            contentLength: innerHTML.length,
            foundSelector: 'css-1t3wwj8-content-area'
          };
        }
      }

      // Fallback to split-view method
      const splitViews = document.querySelectorAll(selectors.SPLIT_VIEW);
      let contentPanel = null;

      for (const view of splitViews) {
        if (view.querySelector(selectors.TREE_ITEM)) continue;
        if (view.offsetWidth < thresholds.MIN_CONTENT_PANEL_WIDTH) continue;
        contentPanel = view;
        break;
      }

      if (!contentPanel) {
        return { content: null, contentLength: 0, foundSelector: 'no-content-panel' };
      }

      const innerHTML = contentPanel.innerHTML;
      const textContent = contentPanel.textContent || '';

      const menuCount = menuKeywords.filter(k => textContent.includes(k)).length;
      if (menuCount > thresholds.MENU_KEYWORD_MATCH_THRESHOLD && textContent.length < thresholds.MENU_MIN_LENGTH) {
        return { content: null, contentLength: textContent.length, foundSelector: 'menu-only' };
      }

      return {
        content: innerHTML,
        contentLength: innerHTML.length,
        foundSelector: 'split-view-content-panel'
      };
    }, CSS_SELECTORS, THRESHOLDS, MENU_KEYWORDS);

    return docData;
  }, `content extraction for "${title}"`);
}

/**
 * Recursively process document tree
 */
async function processDocumentTree(page, nodeId, outputDir, parentPath = [], depth = 0, skipExisting = true, config = {}) {
  if (depth > 10) {
    console.log('  '.repeat(depth) + 'Max depth reached, stopping recursion');
    return { successCount: 0, failCount: 0, skipCount: 0 };
  }

  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  // Get node info
  const nodeInfo = await page.evaluate((id) => {
    const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    if (!item) return null;

    const titleEl = item.querySelector('[data-testid="file-list-item-title"]');
    const title = titleEl ? titleEl.textContent.trim() : 'Untitled';

    const switcher = item.querySelector('.base-tree-item-switcher');
    const hasSwitcher = switcher !== null;

    return { title, hasSwitcher };
  }, nodeId);

  if (!nodeInfo) {
    return { successCount: 0, failCount: 1, skipCount: 0 };
  }

  const currentPath = [...parentPath, nodeInfo.title];
  const indent = '  '.repeat(depth);
  console.log(`${indent}${nodeInfo.title} ${nodeInfo.hasSwitcher ? '(dir+file)' : '(file)'}`);

  // NEW: Always try to download content FIRST, even if it has children
  // In Tencent Docs, items can be both documents AND folders
  const docData = await getDocumentContent(page, nodeId, nodeInfo.title);

  if (docData.content && docData.contentLength > 500) {
    const markdown = turndownService.turndown(docData.content);
    const fullPath = path.join(outputDir, ...currentPath.slice(0, -1));
    await fs.mkdir(fullPath, { recursive: true });

    const filename = `${nodeInfo.title.replace(/[/:*?"<>|]/g, '_')}.md`;
    const filepath = path.join(fullPath, filename);

    if (skipExisting && await fileExistsWithContent(filepath)) {
      console.log(`${indent}  Skipping (already exists): ${filename}`);
      skipCount++;
    } else {
      const fullMarkdown = `# ${nodeInfo.title}\n\n` +
        `> Node ID: ${nodeId}\n` +
        `> Downloaded: ${new Date().toLocaleString('zh-CN')}\n` +
        `${currentPath.length > 1 ? `> Path: ${currentPath.slice(0, -1).join('/')}\n` : ''}` +
        `\n---\n\n${markdown}`;

      await fs.writeFile(filepath, fullMarkdown, 'utf-8');
      console.log(`${indent}  ✅ Saved: ${filename}`);
      successCount++;
    }
  }

  // If NO content and it's a file-only item (no switcher), that's an error
  if ((!docData.content || docData.contentLength <= 500) && !nodeInfo.hasSwitcher) {
    console.log(`${indent}  ⚠️  Content empty or too short (length: ${docData.contentLength})`);
    failCount++;
  }

  // If it's NOT a directory (no switcher), we're done after downloading content
  if (!nodeInfo.hasSwitcher) {
    return { successCount, failCount, skipCount };
  }

  // It IS a directory (has switcher) - also process children
  // Note: The directory itself may have had content which was already downloaded above

  // STEP 1: Get all node IDs BEFORE expansion
  const beforeIds = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.base-tree-sortable-item[data-node-id]'))
      .map(el => el.getAttribute('data-node-id'));
  });

  // STEP 2: Expand directory
  await page.evaluate((id) => {
    const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    if (item) {
      const switcher = item.querySelector('.base-tree-item-switcher');
      if (switcher) {
        switcher.click();
      }
    }
  }, nodeId);

  // STEP 3: Wait for children to load
  await new Promise(resolve => setTimeout(resolve, 3000));

  // STEP 4: Get all node IDs AFTER expansion and find NEW ones (children!)
  const childItems = await page.evaluate((parentId, beforeIds, debug) => {
    const results = [];

    // Get all items after expansion
    const afterItems = Array.from(document.querySelectorAll('.base-tree-sortable-item[data-node-id]'));

    // Convert beforeIds to a Set for O(1) lookup
    const beforeSet = new Set(beforeIds);

    // Find NEW items that weren't in the before list
    // These must be the children that were just loaded!
    for (const item of afterItems) {
      const nodeId = item.getAttribute('data-node-id');

      // Skip if this item existed before (not a new child)
      if (beforeSet.has(nodeId)) continue;

      // This is a NEW item - must be a child!
      const titleEl = item.querySelector('[data-testid="file-list-item-title"]');
      const title = titleEl ? titleEl.textContent.trim() : 'Untitled';
      const switcher = item.querySelector('.base-tree-item-switcher');
      const hasSwitcher = switcher !== null;

      results.push({ nodeId, title, hasSwitcher });

      if (debug) {
        console.log(`[DEBUG] Found NEW child: ${title}`);
      }
    }

    // Also verify we found the parent
    const parentItem = document.querySelector(`.base-tree-sortable-item[data-node-id="${parentId}"]`);

    return {
      results,
      debugInfo: {
        beforeCount: beforeIds.length,
        afterCount: afterItems.length,
        newCount: results.length,
        parentFound: !!parentItem
      }
    };
  }, nodeId, beforeIds, config.debug);

  if (config.debug) {
    console.log(`${indent}  [DEBUG] ${JSON.stringify(childItems.debugInfo)}`);
  }

  const actualChildren = childItems.results;
  console.log(`${indent}  Found ${actualChildren.length} children`);

  // If no children found but parent has switcher, try alternative method
  if (actualChildren.length === 0 && config.debug) {
    console.log(`${indent}  [DEBUG] No children found with position method, trying screenshot...`);
    await takeScreenshot(page, `after-expand-${nodeInfo.title.replace(/[^a-zA-Z0-9]/g, '_')}`);
  }

  // Recursively process children
  for (const child of actualChildren) {
    const result = await processDocumentTree(page, child.nodeId, outputDir, currentPath.slice(0, -1), depth + 1, skipExisting, config);
    successCount += result.successCount;
    failCount += result.failCount;
    skipCount += result.skipCount;
  }

  // Collapse directory
  await page.evaluate((id) => {
    const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    if (item) {
      const switcher = item.querySelector('.base-tree-item-switcher');
      if (switcher) {
        switcher.click();
      }
    }
  }, nodeId);

  await new Promise(resolve => setTimeout(resolve, 500));

  return { successCount, failCount, skipCount };
}

/**
 * Get and download all documents from a space
 */
async function getSpaceDocumentList(page, spaceUrl, outputDir, skipExisting = true, config = {}) {
  console.log('Loading space document list...');
  await page.goto(spaceUrl, {
    waitUntil: 'networkidle2'
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  if (config.debug) {
    await takeScreenshot(page, 'initial-load');
  }

  // Get top-level items
  const topLevelItems = await page.evaluate(() => {
    const results = [];
    const items = document.querySelectorAll('.base-tree-sortable-item[data-node-id]');

    items.forEach(item => {
      const nodeId = item.getAttribute('data-node-id');
      const titleEl = item.querySelector('[data-testid="file-list-item-title"]');
      const title = titleEl ? titleEl.textContent.trim() : 'Untitled';

      if (nodeId && title) {
        const switcher = item.querySelector('.base-tree-item-switcher');
        results.push({
          nodeId,
          title,
          hasSwitcher: switcher !== null
        });
      }
    });

    return results;
  });

  console.log(`Found ${topLevelItems.length} top-level items\n`);

  let totalSuccess = 0;
  let totalFail = 0;
  let totalSkip = 0;

  // Process each top-level item
  for (let i = 0; i < topLevelItems.length; i++) {
    const item = topLevelItems[i];
    console.log(`[${i + 1}/${topLevelItems.length}] Processing: ${item.title}`);

    try {
      const result = await processDocumentTree(page, item.nodeId, outputDir, [], 0, skipExisting, config);
      totalSuccess += result.successCount;
      totalFail += result.failCount;
      totalSkip += result.skipCount;
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      totalFail++;
    }
  }

  return { successCount: totalSuccess, failCount: totalFail, skipCount: totalSkip };
}

// Export for use as module
module.exports = { main };

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

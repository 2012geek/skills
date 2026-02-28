/**
 * 腾讯文档内容下载器
 * 使用 Puppeteer 下载文档实际内容
 */

import puppeteer from 'puppeteer';
import TurndownService from 'turndown';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateHash } from '../utils/hash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CSS 选择器配置
const CSS_SELECTORS = {
  TREE_ITEM: '.base-tree-sortable-item[data-node-id]',
  FILE_TITLE: '[data-testid="file-list-item-title"]',
  SWITCHER: '.base-tree-item-switcher',
  CONTENT_AREA: '.css-1t3wwj8, [class*="e1w3g4nf1"]',
  SPLIT_VIEW: '.split-view-view',
  USER_INFO: '.user-info, [class*="user"], [class*="avatar"]'
};

// 阈值配置
const THRESHOLDS = {
  MIN_CONTENT_SIZE: 500,
  MIN_FILE_SIZE: 100,
  MAX_DEPTH: 10,
  MIN_CONTENT_PANEL_WIDTH: 500,
  MENU_KEYWORD_MATCH_THRESHOLD: 3,
  MENU_MIN_LENGTH: 1000
};

// 时间配置
const TIMING = {
  NAVIGATION_TIMEOUT: 8000,
  CONTENT_LOAD_DELAY: 4000,
  EXPANSION_DELAY: 3000,
  INITIAL_LOAD_DELAY: 5000,
  LOGIN_CHECK_DELAY: 3000
};

// 菜单关键词
const MENU_KEYWORDS = [
  'Apps', 'Study Outline', 'Key Points', 'Mind Map',
  'Presentation', 'Quiz', 'Flashcards', 'Create Content', 'Ask Space',
  'New Conversation', 'Selected', 'items', 'Add materials', 'Based on'
];

// Turndown 服务
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

/**
 * 睡眠函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 检查文件是否存在且有内容
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
 * 获取文档内容
 */
async function getDocumentContent(page, nodeId, title) {
  try {
    // 点击文档节点
    await page.evaluate((id, selector) => {
      const item = document.querySelector(`${selector}[data-node-id="${id}"]`);
      if (item) {
        item.click();
      }
    }, nodeId, CSS_SELECTORS.TREE_ITEM);

    // 等待导航和内容加载
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: TIMING.NAVIGATION_TIMEOUT }).catch(() => {});
    await sleep(TIMING.CONTENT_LOAD_DELAY);

    // 提取内容
    const docData = await page.evaluate((selectors, thresholds, menuKeywords) => {
      // 尝试找到内容区域
      const contentArea = document.querySelector(selectors.CONTENT_AREA);

      if (contentArea) {
        const innerHTML = contentArea.innerHTML;
        const textContent = contentArea.textContent || '';

        if (textContent.length > 100) {
          return {
            content: innerHTML,
            contentLength: innerHTML.length,
            foundSelector: 'content-area'
          };
        }
      }

      // 备用方法：split-view
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

      // 检查是否是菜单内容
      const menuCount = menuKeywords.filter(k => textContent.includes(k)).length;
      if (menuCount > thresholds.MENU_KEYWORD_MATCH_THRESHOLD && textContent.length < thresholds.MENU_MIN_LENGTH) {
        return { content: null, contentLength: textContent.length, foundSelector: 'menu-only' };
      }

      return {
        content: innerHTML,
        contentLength: innerHTML.length,
        foundSelector: 'split-view'
      };
    }, CSS_SELECTORS, THRESHOLDS, MENU_KEYWORDS);

    return docData;
  } catch (error) {
    console.error(`  ⚠️  Error getting content for "${title}": ${error.message}`);
    return { content: null, contentLength: 0, error: error.message };
  }
}

/**
 * 递归处理文档树
 */
async function processDocumentTree(page, nodeId, outputDir, parentPath = [], depth = 0, skipExisting = true, stats = { success: 0, failed: 0, skipped: 0 }) {
  if (depth > THRESHOLDS.MAX_DEPTH) {
    return stats;
  }

  // 获取节点信息
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
    stats.failed++;
    return stats;
  }

  const currentPath = [...parentPath, nodeInfo.title];
  const indent = '  '.repeat(depth);
  console.log(`${indent}📄 ${nodeInfo.title} ${nodeInfo.hasSwitcher ? '(dir+file)' : '(file)'}`);

  // 下载文档内容
  const docData = await getDocumentContent(page, nodeId, nodeInfo.title);

  if (docData.content && docData.contentLength > THRESHOLDS.MIN_CONTENT_SIZE) {
    // 转换为 Markdown
    const markdown = turndownService.turndown(docData.content);
    const fullPath = path.join(outputDir, ...currentPath.slice(0, -1));
    await fs.mkdir(fullPath, { recursive: true });

    const filename = `${nodeInfo.title.replace(/[/:*?"<>|]/g, '_')}.md`;
    const filepath = path.join(fullPath, filename);

    if (skipExisting && await fileExistsWithContent(filepath)) {
      console.log(`${indent}  ⏭️  跳过（已存在）: ${filename}`);
      stats.skipped++;
    } else {
      // 添加元数据头部
      const fullMarkdown = `# ${nodeInfo.title}\n\n` +
        `> 文档ID: ${nodeId}\n` +
        `> 下载时间: ${new Date().toLocaleString('zh-CN')}\n` +
        `${currentPath.length > 1 ? `> 路径: ${currentPath.slice(0, -1).join('/')}\n` : ''}` +
        `\n---\n\n${markdown}`;

      await fs.writeFile(filepath, fullMarkdown, 'utf-8');
      console.log(`${indent}  ✅ 已保存: ${filename} (${docData.contentLength} 字节)`);
      stats.success++;
    }
  } else if (!nodeInfo.hasSwitcher) {
    // 文件类型但没有内容
    console.log(`${indent}  ⚠️  内容为空或太短 (${docData.contentLength} 字节)`);
    stats.failed++;
  }

  // 如果是目录，递归处理子文档
  if (nodeInfo.hasSwitcher) {
    // 获取展开前的节点ID列表
    const beforeIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.base-tree-sortable-item[data-node-id]'))
        .map(el => el.getAttribute('data-node-id'));
    });

    // 展开目录
    await page.evaluate((id) => {
      const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
      if (item) {
        const switcher = item.querySelector('.base-tree-item-switcher');
        if (switcher) {
          switcher.click();
        }
      }
    }, nodeId);

    await sleep(TIMING.EXPANSION_DELAY);

    // 获取展开后的节点ID列表
    const afterIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.base-tree-sortable-item[data-node-id]'))
        .map(el => el.getAttribute('data-node-id'));
    });

    // 找到新增的子节点
    const childIds = afterIds.filter(id => !beforeIds.includes(id));

    // 递归处理每个子节点
    for (const childId of childIds) {
      await processDocumentTree(page, childId, outputDir, currentPath.slice(0, -1), depth + 1, skipExisting, stats);
    }

    // 折叠目录（可选）
    // await page.evaluate((id) => {
    //   const item = document.querySelector(`.base-tree-sortable-item[data-node-id="${id}"]`);
    //   if (item) {
    //     const switcher = item.querySelector('.base-tree-item-switcher');
    //     if (switcher) {
    //       switcher.click();
    //     }
    //   }
    // }, nodeId);
    // await sleep(500);
  }

  return stats;
}

/**
 * 手动登录流程（仅在需要时使用）
 */
async function manualLogin(page, spaceUrl) {
  console.log('检查登录状态...');
  await page.goto(spaceUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(TIMING.LOGIN_CHECK_DELAY);

  // 检查是否有文档树节点（表示已登录）
  const isLoggedIn = await page.evaluate((selector) => {
    const items = document.querySelectorAll(selector);
    console.log('Found items:', items.length);
    return items.length > 0;
  }, CSS_SELECTORS.TREE_ITEM);

  if (isLoggedIn) {
    console.log('✅ 已登录！使用保存的会话。\n');
    return true;
  }

  // 如果未登录，输出提示但继续尝试
  console.log('⚠️  未检测到登录状态，但会继续尝试访问...\n');
  return true;
}

/**
 * 下载空间文档
 */
export async function downloadSpace(config) {
  const {
    spaceUrl = 'https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1',
    outputDir = './tencent-docs',
    headless = false,
    skipExisting = true,
    userDataDir = './.tencent-docs-session'
  } = config;

  let browser = null;

  try {
    console.log('\n🚀 启动浏览器...');
    
    // 尝试使用系统 Chrome
    const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const hasSystemChrome = await fs.access(executablePath).then(() => true).catch(() => false);
    
    const browserOptions = {
      headless,
      userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
      defaultViewport: { width: 1280, height: 800 }
    };

    if (hasSystemChrome) {
      browserOptions.executablePath = executablePath;
      console.log('  使用系统 Chrome 浏览器');
    }

    browser = await puppeteer.launch(browserOptions);

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

    // 登录
    await manualLogin(page, spaceUrl);

    // 访问空间
    console.log(`\n📂 访问空间: ${spaceUrl}`);
    await page.goto(spaceUrl, { 
      waitUntil: 'networkidle2',
      timeout: 60000  // 增加超时时间到 60 秒
    });
    
    // 等待更长时间确保页面完全加载
    console.log('  等待页面加载...');
    await sleep(8000);  // 增加到 8 秒

    // 获取所有顶级节点
    const topLevelItems = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector))
        .map(el => el.getAttribute('data-node-id'));
    }, CSS_SELECTORS.TREE_ITEM);

    console.log(`\n找到 ${topLevelItems.length} 个顶级文档\n`);

    // 处理每个顶级节点
    let totalStats = { success: 0, failed: 0, skipped: 0 };
    for (const nodeId of topLevelItems) {
      const stats = await processDocumentTree(page, nodeId, outputDir, [], 0, skipExisting);
      totalStats.success += stats.success;
      totalStats.failed += stats.failed;
      totalStats.skipped += stats.skipped;
    }

    console.log('\n' + '═'.repeat(50));
    console.log('📊 下载完成！');
    console.log(`  ✅ 成功: ${totalStats.success} 个文件`);
    console.log(`  ⏭️  跳过: ${totalStats.skipped} 个文件（已存在）`);
    console.log(`  ❌ 失败: ${totalStats.failed} 个文件`);
    console.log(`  📁 输出: ${outputDir}`);
    console.log('═'.repeat(50) + '\n');

    return totalStats;

  } catch (error) {
    console.error('❌ 下载失败:', error.message);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default downloadSpace;

#!/usr/bin/env node

/**
 * Browser launcher for manual login
 * Opens browser and waits for you to log in, then saves session
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;

async function main() {
  console.log('========================================');
  console.log('  Tencent Docs - Manual Login');
  console.log('========================================\n');
  console.log('Opening browser... Please log in manually.\n');
  console.log('Steps:');
  console.log('1. Scan QR code or use password to login');
  console.log('2. Navigate to: https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1');
  console.log('3. Wait 90 seconds for session to save...\n');

  const userDataDir = './.tencent-docs-session';

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: userDataDir,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=2560,1440'
    ],
    defaultViewport: {
      width: 2560,
      height: 1440
    }
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Go to login page
  await page.goto('https://docs.qq.com/', {
    waitUntil: 'networkidle2'
  });

  // Wait for user to log in
  console.log('Waiting 90 seconds for you to log in...');
  console.log('(Browser will stay open - you can take your time)\n');

  // Wait for 90 seconds
  await new Promise(resolve => setTimeout(resolve, 90000));

  // Check login status
  await page.goto('https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1', {
    waitUntil: 'networkidle2'
  });

  await new Promise(resolve => setTimeout(resolve, 3000));

  const loginCheck = await page.evaluate(() => {
    const items = document.querySelectorAll('.base-tree-sortable-item[data-node-id]');
    const title = document.title;
    const url = window.location.href;
    return {
      itemCount: items.length,
      title,
      url,
      hasCookie: document.cookie.includes('docs')
    };
  });

  console.log('\n========================================');
  console.log('Login Status Check:');
  console.log('========================================');
  console.log(`Document items found: ${loginCheck.itemCount}`);
  console.log(`Page title: ${loginCheck.title}`);
  console.log(`Has docs cookie: ${loginCheck.hasCookie}`);

  if (loginCheck.itemCount > 0) {
    console.log('\n✅ SUCCESS! Session saved.');
    console.log(`   Session location: ${userDataDir}`);
    console.log('\nYou can now run: node scripts/download.js');
  } else {
    console.log('\n⚠️  Login may not have completed.');
    console.log('   Please run this script again and take more time to log in.');
  }

  await browser.close();
  process.exit(loginCheck.itemCount > 0 ? 0 : 1);
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});

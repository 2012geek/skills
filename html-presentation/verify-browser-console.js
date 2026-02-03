#!/usr/bin/env node
/**
 * 验证浏览器控制台没有报错
 */
const puppeteer = require('puppeteer');

async function verifyBrowserConsole() {
  console.log('🔍 启动浏览器验证...\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 收集控制台消息
  const logs = [];
  const errors = [];
  const warnings = [];

  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    logs.push({ type, text });

    if (type === 'error') {
      errors.push(text);
    } else if (type === 'warning') {
      warnings.push(text);
    }
  });

  // 监听页面错误
  page.on('pageerror', error => {
    errors.push(`Page Error: ${error.message}`);
  });

  // 监听请求失败
  page.on('requestfailed', request => {
    const failure = request.failure();
    if (failure && failure.text !== 'net::ERR_ABORTED') {
      errors.push(`Request Failed: ${request.url()} - ${failure.text}`);
    }
  });

  try {
    console.log('📄 正在加载页面: http://localhost:3030');
    await page.goto('http://localhost:3030', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    console.log('⏳ 等待页面渲染完成...');
    await page.waitForTimeout(3000);

    console.log('\n' + '='.repeat(60));
    console.log('📊 控制台验证结果');
    console.log('='.repeat(60));

    console.log(`\n✅ 总日志数: ${logs.length}`);
    console.log(`🔴 错误数: ${errors.length}`);
    console.log(`⚠️  警告数: ${warnings.length}`);

    if (errors.length > 0) {
      console.log('\n❌ 发现以下错误:');
      errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  发现以下警告:');
      warnings.forEach((warn, i) => {
        console.log(`  ${i + 1}. ${warn}`);
      });
    }

    // 检查是否有 Vite 图片导入错误
    const imageErrors = logs.filter(log =>
      log.text.includes('Cannot import non-asset file') &&
      log.text.includes('/images/')
    );

    if (imageErrors.length > 0) {
      console.log('\n❌ 图片导入错误仍然存在:');
      imageErrors.forEach(err => console.log(`  ${err.text}`));
    } else {
      console.log('\n✅ 没有发现图片导入错误');
    }

    console.log('\n' + '='.repeat(60));

    if (errors.length === 0 && imageErrors.length === 0) {
      console.log('🎉 验证通过！浏览器控制台没有报错！');
      console.log('📐 你可以在浏览器中访问: http://localhost:3030');
    } else {
      console.log('⚠️  发现问题，请检查上述错误信息');
    }

  } catch (error) {
    console.error('❌ 验证过程出错:', error.message);
  } finally {
    await browser.close();
  }
}

verifyBrowserConsole().catch(console.error);

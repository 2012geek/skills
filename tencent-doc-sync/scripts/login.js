#!/usr/bin/env node

/**
 * 腾讯文档登录工具
 * 
 * 功能：
 * 1. 自动打开腾讯文档登录页面
 * 2. 完成所有登录步骤（包括点击 Agree 按钮）
 * 3. 检测并验证二维码是否出现
 * 4. 截图并保存
 * 5. 可选：发送到邮箱
 * 
 * 用法：
 *   node login.js                    # 仅截图
 *   node login.js --email            # 截图并发送到配置的邮箱
 *   node login.js --output /path     # 指定输出路径
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// 配置
const CONFIG = {
  defaultOutputPath: '/Users/chenlening/workspace/tencent-docs-qr-code.png',
  sessionDir: path.join(__dirname, '../.tencent-docs-session'),
  chromePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  
  // 邮箱配置（可选）
  email: {
    enabled: false,
    smtp: 'smtp.163.com',
    port: 465,
    sender: 'leningchen@163.com',
    receiver: 'leningchen@163.com',
    password: '' // 从环境变量或配置文件读取
  },
  
  // 时间配置（毫秒）
  timing: {
    pageLoad: 3000,
    afterClick: 2000,
    waitQR: 5000,
    browserClose: 30000
  }
};

/**
 * 延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 检测页面是否有二维码
 */
async function detectQRCode(page) {
  return await page.evaluate(() => {
    // 查找大尺寸的图片或canvas（二维码通常大于200x200）
    const images = Array.from(document.querySelectorAll('img'));
    const largeImages = images.filter(img => img.width > 200 && img.height > 200);
    
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const largeCanvases = canvases.filter(c => c.width > 200 && c.height > 200);
    
    // 检查页面文本是否包含"扫码"或"二维码"
    const bodyText = document.body.innerText;
    const hasScanText = bodyText.includes('扫码') || bodyText.includes('二维码');
    
    return {
      hasQR: largeImages.length > 0 || largeCanvases.length > 0,
      imageCount: largeImages.length,
      canvasCount: largeCanvases.length,
      hasScanText
    };
  });
}

/**
 * 发送邮件（可选）
 */
async function sendEmail(imagePath) {
  if (!CONFIG.email.enabled || !CONFIG.email.password) {
    console.log('⚠️  邮件发送未启用或未配置密码');
    return false;
  }
  
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: CONFIG.email.smtp,
      port: CONFIG.email.port,
      secure: true,
      auth: {
        user: CONFIG.email.sender,
        pass: CONFIG.email.password
      }
    });
    
    await transporter.sendMail({
      from: CONFIG.email.sender,
      to: CONFIG.email.receiver,
      subject: '腾讯文档登录二维码',
      text: '请使用微信扫描附件中的二维码进行登录。',
      attachments: [{
        filename: path.basename(imagePath),
        path: imagePath
      }]
    });
    
    console.log('✅ 邮件发送成功！');
    return true;
  } catch (error) {
    console.error('❌ 邮件发送失败:', error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);
  const sendToEmail = args.includes('--email');
  const outputArg = args.find(arg => arg.startsWith('--output='));
  const outputPath = outputArg ? outputArg.split('=')[1] : CONFIG.defaultOutputPath;
  
  console.log('🚀 腾讯文档登录二维码获取工具\n');
  
  let browser = null;
  
  try {
    // 启动浏览器
    console.log('1️⃣ 启动浏览器...');
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: CONFIG.sessionDir,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: CONFIG.chromePath
    });
    
    const page = await browser.newPage();
    
    // 打开腾讯文档
    console.log('2️⃣ 打开腾讯文档首页...');
    await page.goto('https://docs.qq.com/', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await sleep(CONFIG.timing.pageLoad);

    // 步骤1：点击登录按钮
    console.log('3️⃣ 点击登录按钮...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const loginBtn = buttons.find(btn => {
        const text = btn.textContent || '';
        return text.includes('登录') || text.includes('Login');
      });
      if (loginBtn) loginBtn.click();
    });
    await sleep(CONFIG.timing.afterClick);

    // 步骤2：同意协议
    console.log('4️⃣ 同意用户协议...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const agreeBtn = buttons.find(btn => {
        const text = btn.textContent || '';
        return text.includes('同意') || text.includes('Agree');
      });
      if (agreeBtn) agreeBtn.click();
    });
    await sleep(CONFIG.timing.afterClick);

    // 步骤3：点击微信登录
    console.log('5️⃣ 点击微信登录...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('img, svg, div'));
      const wechatBtn = elements.find(el => {
        const text = el.textContent || el.alt || '';
        return text.includes('微信') || text.includes('WeChat');
      });
      if (wechatBtn) wechatBtn.click();
    });
    await sleep(CONFIG.timing.afterClick);

    // 步骤4：点击 Log in now
    console.log('6️⃣ 点击 Log in now...');
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      const loginNowBtn = buttons.find(btn => {
        const text = (btn.textContent || '').trim();
        return text === 'Log in now';
      });
      if (loginNowBtn) loginNowBtn.click();
    });
    await sleep(CONFIG.timing.afterClick);

    // 步骤5：点击 Agree 按钮（关键步骤！）
    console.log('7️⃣ 点击 Agree 按钮（关键步骤）...');
    const agreeClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
      const agreeBtn = buttons.find(btn => {
        const text = (btn.textContent || '').trim();
        return text === 'Agree' || text === 'AGREE';
      });
      
      if (agreeBtn) {
        agreeBtn.click();
        return true;
      }
      return false;
    });
    
    if (!agreeClicked) {
      console.log('⚠️  未找到 Agree 按钮，可能已经同意过');
    }
    await sleep(CONFIG.timing.waitQR);

    // 步骤6：检测二维码
    console.log('8️⃣ 检测二维码...');
    const qrCheck = await detectQRCode(page);
    console.log('检测结果:', qrCheck);
    
    if (!qrCheck.hasQR) {
      console.log('❌ 未检测到二维码！');
      console.log('⚠️  不会保存截图');
      
      // 保存调试截图
      const debugPath = outputPath.replace('.png', '-debug.png');
      await page.screenshot({ path: debugPath, fullPage: false });
      console.log(`已保存调试截图: ${debugPath}`);
      
      throw new Error('未检测到二维码，请检查登录流程');
    }
    
    console.log('✅ 检测到二维码！');
    
    // 步骤7：截图
    console.log('9️⃣ 截图保存...');
    await page.screenshot({ 
      path: outputPath, 
      fullPage: false 
    });
    console.log(`✅ 截图已保存: ${outputPath}`);
    
    // 可选：发送邮件
    if (sendToEmail) {
      console.log('📧 发送邮件...');
      await sendEmail(outputPath);
    }
    
    console.log('\n✅ 完成！浏览器将在30秒后关闭...');
    await sleep(CONFIG.timing.browserClose);
    
  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    
    if (browser) {
      console.log('\n⏳ 浏览器将保持打开60秒供手动操作...');
      await sleep(60000);
    }
    
    process.exit(1);
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 运行
main();

/**
 * 幻灯片问题诊断脚本
 * 检测所有幻灯片的显示问题
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

async function diagnoseSlides() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  console.log('🔍 开始诊断幻灯片...\n');

  await page.goto('http://localhost:3030', { waitUntil: 'networkidle0' });
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 获取总幻灯片数
  const totalSlides = await page.evaluate(() => {
    return document.querySelectorAll('.slidev-page').length;
  });

  const issues = [];

  // 逐张检查
  for (let i = 0; i < totalSlides; i++) {
    if (i > 0) {
      await page.keyboard.press('ArrowRight');
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    const slideIssues = await page.evaluate((slideNum) => {
      const issues = [];
      const body = document.body;

      // 1. 检查水平溢出
      if (body.scrollWidth > body.clientWidth) {
        issues.push({
          type: 'HORIZONTAL_OVERFLOW',
          severity: 'HIGH',
          details: `scrollWidth: ${body.scrollWidth}px > clientWidth: ${body.clientWidth}px`
        });
      }

      // 2. 检查垂直溢出
      if (body.scrollHeight > body.clientHeight) {
        issues.push({
          type: 'VERTICAL_OVERFLOW',
          severity: 'MEDIUM',
          details: `scrollHeight: ${body.scrollHeight}px > clientHeight: ${body.clientHeight}px`
        });
      }

      // 3. 检查图片问题
      const images = document.querySelectorAll('img');
      images.forEach((img, idx) => {
        const rect = img.getBoundingClientRect();
        const hasMaxWidth = img.style.maxWidth !== '';
        const maxWidthValue = img.style.maxWidth;

        // 图片超出屏幕
        if (rect.width > window.innerWidth * 0.95) {
          issues.push({
            type: 'IMAGE_TOO_WIDE',
            severity: 'HIGH',
            details: `图片${idx + 1}: ${rect.width}px (超过屏幕宽度的95%)`
          });
        }

        // 图片没有max-width约束
        if (!hasMaxWidth && !img.style.width) {
          issues.push({
            type: 'IMAGE_NO_CONSTRAINT',
            severity: 'MEDIUM',
            details: `图片${idx + 1}: 没有max-width或width约束`
          });
        }

        // 图片使用width: 100%
        if (img.style.width === '100%') {
          issues.push({
            type: 'IMAGE_WIDTH_100',
            severity: 'HIGH',
            details: `图片${idx + 1}: 使用width: 100%，可能溢出`
          });
        }
      });

      // 4. 检查表格问题
      const tables = document.querySelectorAll('table');
      tables.forEach((table, idx) => {
        const rect = table.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.9) {
          issues.push({
            type: 'TABLE_TOO_WIDE',
            severity: 'MEDIUM',
            details: `表格${idx + 1}: ${rect.width}px`
          });
        }
      });

      // 5. 检查代码块问题
      const codeBlocks = document.querySelectorAll('pre');
      codeBlocks.forEach((block, idx) => {
        const rect = block.getBoundingClientRect();
        if (rect.width > window.innerWidth * 0.9) {
          issues.push({
            type: 'CODE_BLOCK_TOO_WIDE',
            severity: 'MEDIUM',
            details: `代码块${idx + 1}: ${rect.width}px`
          });
        }
      });

      // 获取幻灯片标题
      const title = document.querySelector('h1, h2, h3')?.textContent || `幻灯片${slideNum}`;

      return { title, issues };
    }, i + 1);

    if (slideIssues.issues.length > 0) {
      issues.push({
        slide: i + 1,
        title: slideIssues.title,
        problems: slideIssues.issues
      });
    }

    console.log(`幻灯片 ${i + 1}/${totalSlides}: ${slideIssues.title}`);
    if (slideIssues.issues.length === 0) {
      console.log('  ✅ 无问题');
    } else {
      console.log(`  ⚠️ 发现 ${slideIssues.issues.length} 个问题:`);
      slideIssues.issues.forEach(issue => {
        const icon = issue.severity === 'HIGH' ? '🔴' : '🟡';
        console.log(`    ${icon} ${issue.type}: ${issue.details}`);
      });
    }
    console.log('');
  }

  // 生成报告
  const report = {
    timestamp: new Date().toISOString(),
    totalSlides,
    totalIssues: issues.length,
    issuesByType: {},
    slidesWithIssues: issues
  };

  // 统计问题类型
  issues.forEach(slide => {
    slide.problems.forEach(problem => {
      if (!report.issuesByType[problem.type]) {
        report.issuesByType[problem.type] = 0;
      }
      report.issuesByType[problem.type]++;
    });
  });

  // 保存报告
  fs.writeFileSync('/tmp/slides-diagnosis.json', JSON.stringify(report, null, 2));

  console.log('\n' + '='.repeat(60));
  console.log('📊 诊断总结');
  console.log('='.repeat(60));
  console.log(`总幻灯片数: ${totalSlides}`);
  console.log(`有问题的幻灯片: ${issues.length}`);
  console.log(`总问题数: ${report.totalIssues}`);
  console.log('\n问题分类:');
  Object.entries(report.issuesByType).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}个`);
  });

  if (issues.length > 0) {
    console.log('\n🔴 需要修复的幻灯片:');
    issues.forEach(slide => {
      console.log(`\n幻灯片 ${slide.slide}: ${slide.title}`);
      slide.problems.forEach(problem => {
        console.log(`  - ${problem.type}: ${problem.details}`);
      });
    });
  }

  console.log('\n📄 详细报告已保存到: /tmp/slides-diagnosis.json');
  console.log('\n浏览器将保持打开，您可以手动查看问题');
  console.log('按 Ctrl+C 退出...');

  // 保持浏览器打开
  await new Promise(resolve => setTimeout(resolve, 60000));
  await browser.close();
}

diagnoseSlides().catch(console.error);

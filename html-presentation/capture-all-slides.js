const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.setViewport({width: 1920, height: 1080});
  
  // 首先访问主页获取总幻灯片数
  await page.goto('http://localhost:3030/', {waitUntil: 'networkidle2'});
  await new Promise(r => setTimeout(r, 3000));
  
  // 截取所有幻灯片 (0-based index, 从0到大约16)
  for (let i = 0; i < 18; i++) {
    try {
      console.log(`\n=== Capturing Slide ${i} ===`);
      await page.goto(`http://localhost:3030/${i}`, {waitUntil: 'networkidle2', timeout: 10000});
      await new Promise(r => setTimeout(r, 2000));
      
      const filename = `/tmp/slide-${String(i).padStart(2, '0')}.png`;
      await page.screenshot({path: filename, fullPage: true});
      
      // 获取溢出信息
      const overflowInfo = await page.evaluate(() => {
        const body = document.body;
        return {
          scrollWidth: body.scrollWidth,
          clientWidth: body.clientWidth,
          scrollHeight: body.scrollHeight,
          clientHeight: window.innerHeight,
          horizontalOverflow: body.scrollWidth > body.clientWidth,
          verticalOverflow: body.scrollHeight > window.innerHeight,
          title: document.querySelector('h1, h2')?.textContent?.substring(0, 50) || 'No title'
        };
      });
      
      console.log(`Title: ${overflowInfo.title}`);
      console.log(`Horizontal overflow: ${overflowInfo.horizontalOverflow ? 'YES ⚠️' : 'No'} (${overflowInfo.scrollWidth}/${overflowInfo.clientWidth})`);
      console.log(`Vertical overflow: ${overflowInfo.verticalOverflow ? 'YES ⚠️' : 'No'} (${overflowInfo.scrollHeight}/${overflowInfo.clientHeight}px)`);
      console.log(`Saved: ${filename}`);
    } catch (e) {
      console.log(`Slide ${i} does not exist or error: ${e.message}`);
    }
  }
  
  await browser.close();
  console.log('\n✅ All screenshots captured!');
})();

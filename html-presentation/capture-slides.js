const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.setViewport({width: 1920, height: 1080});
  
  console.log('=== Slide 3 ===');
  await page.goto('http://localhost:3030/2', {waitUntil: 'networkidle2'});
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({path: '/tmp/slide-3.png', fullPage: true});
  
  const info3 = await page.evaluate(() => ({
    scrollW: document.body.scrollWidth,
    clientW: document.body.clientWidth,
    scrollH: document.body.scrollHeight,
    clientH: window.innerHeight,
    title: document.title
  }));
  console.log('Slide 3:', JSON.stringify(info3));
  
  console.log('\n=== Slide 4 ===');
  await page.goto('http://localhost:3030/3', {waitUntil: 'networkidle2'});
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({path: '/tmp/slide-4.png', fullPage: true});
  
  const info4 = await page.evaluate(() => ({
    scrollW: document.body.scrollWidth,
    clientW: document.body.clientWidth,
    scrollH: document.body.scrollHeight,
    clientH: window.innerHeight,
    title: document.title
  }));
  console.log('Slide 4:', JSON.stringify(info4));
  
  console.log('\n✅ Screenshots saved to /tmp/slide-3.png and /tmp/slide-4.png');
  await browser.close();
})();

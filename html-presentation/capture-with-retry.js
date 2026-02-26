const puppeteer = require('puppeteer');
const http = require('http');

async function waitForServer(port, maxWait = 60) {
  for (let i = 0; i < maxWait; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/`, (res) => {
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      console.log('✅ Server is ready!');
      return true;
    } catch (e) {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

(async () => {
  console.log('Waiting for Slidev server...');
  const ready = await waitForServer(3030, 45);
  
  if (!ready) {
    console.log('\n❌ Server not ready. Please start server manually:');
    console.log('npx @slidev/cli .slidev-v4-temp.md.backup-20260224032724 --port 3030 --open false');
    return;
  }
  
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.setViewport({width: 1920, height: 1080});
  
  console.log('\n📸 Capturing all slides...\n');
  
  for (let i = 0; i < 18; i++) {
    try {
      await page.goto(`http://localhost:3030/${i}`, {waitUntil: 'networkidle2', timeout: 15000});
      await new Promise(r => setTimeout(r, 2000));
      
      const filename = `/tmp/slide-${String(i).padStart(2, '0')}-new.png`;
      await page.screenshot({path: filename, fullPage: true});
      
      const info = await page.evaluate(() => ({
        title: document.querySelector('h1, h2')?.textContent?.substring(0, 40) || 'No title',
        hOverflow: document.body.scrollWidth > document.body.clientWidth,
        vOverflow: document.body.scrollHeight > window.innerHeight,
        scrollH: document.body.scrollHeight,
        clientH: window.innerHeight
      }));
      
      console.log(`Slide ${i}: ${info.title}`);
      if (info.hOverflow) console.log('  ⚠️ HORIZONTAL OVERFLOW');
      if (info.vOverflow) console.log(`  ⚠️ VERTICAL OVERFLOW (${info.scrollH}px > ${info.clientH}px)`);
    } catch (e) {
      console.log(`Slide ${i}: Error - ${e.message.substring(0, 50)}`);
    }
  }
  
  await browser.close();
  console.log('\n✅ Done! Screenshots saved to /tmp/slide-*-new.png');
})();

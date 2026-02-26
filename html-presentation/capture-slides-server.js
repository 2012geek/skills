const { spawn } = require('child_process');
const puppeteer = require('puppeteer');
const http = require('http');

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      await new Promise((resolve, reject) => {
        http.get('http://localhost:3030/', (res) => resolve()).on('error', reject).setTimeout(1000, () => reject(new Error('timeout')));
      });
      return true;
    } catch (e) {
      process.stdout.write('.');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

(async () => {
  console.log('Starting Slidev server...');
  const server = spawn('npx', ['@slidev/cli', '.slidev-v4-temp.md.backup-20260224032724', '--port', '3030', '--open', 'false'], {
    stdio: 'inherit',
    shell: true
  });
  
  console.log('Waiting for server...');
  const ready = await waitForServer();
  
  if (!ready) {
    console.log('\n❌ Server failed to start');
    server.kill();
    return;
  }
  
  console.log('\n✅ Server ready!');
  await new Promise(r => setTimeout(r, 3000));
  
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  await page.setViewport({width: 1920, height: 1080});
  
  console.log('Capturing slides...\n');
  
  for (let i = 0; i < 18; i++) {
    try {
      await page.goto(`http://localhost:3030/${i}`, {waitUntil: 'networkidle2', timeout: 15000});
      await new Promise(r => setTimeout(r, 1500));
      
      const filename = `/tmp/slide-${String(i).padStart(2, '0')}-2024.png`;
      await page.screenshot({path: filename, fullPage: true});
      
      const info = await page.evaluate(() => ({
        title: document.querySelector('h1, h2')?.textContent?.substring(0, 40) || 'No title',
        hOverflow: document.body.scrollWidth > document.body.clientWidth,
        vOverflow: document.body.scrollHeight > window.innerHeight,
        ratio: (document.body.scrollHeight / window.innerHeight).toFixed(1)
      }));
      
      const status = info.vOverflow ? `⚠️ V-Overflow (${info.ratio}x)` : '✅ OK';
      console.log(`Slide ${i}: ${info.title} - ${status}`);
    } catch (e) {
      console.log(`Slide ${i}: Error - ${e.message.substring(0, 60)}`);
    }
  }
  
  await browser.close();
  server.kill();
  console.log('\n✅ Done! Screenshots: /tmp/slide-*-2024.png');
})();

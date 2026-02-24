/**
 * Verify no overflow on slides using Puppeteer
 */

const puppeteer = require('puppeteer');
const http = require('http');

async function checkPage(port, pageNumber) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function verifyNoOverflow(port = 3030, page = 4) {
  console.log(`🔍 Starting browser to check for overflow on page ${page}...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const pageInstance = await browser.newPage();
    await pageInstance.goto(`http://localhost:${port}`, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for slides to load
    await pageInstance.waitForTimeout(2000);

    // Navigate to specific page (Slidev uses keyboard navigation)
    // Press page down key (page - 1) times
    for (let i = 1; i < page; i++) {
      await pageInstance.keyboard.press('ArrowDown');
      await pageInstance.waitForTimeout(500);
    }

    // Wait for transition
    await pageInstance.waitForTimeout(1000);

    // Check for overflow
    const overflowCheck = await pageInstance.evaluate(() => {
      const slideLayout = document.querySelector('.slidev-layout');
      if (!slideLayout) {
        return { error: 'No .slidev-layout found' };
      }

      const scrollWidth = slideLayout.scrollWidth;
      const clientWidth = slideLayout.clientWidth;
      const scrollHeight = slideLayout.scrollHeight;
      const clientHeight = slideLayout.clientHeight;

      const hasHorizontalOverflow = scrollWidth > clientWidth;
      const hasVerticalOverflow = scrollHeight > clientHeight;

      // Check if any children have overflow
      const children = slideLayout.querySelectorAll('*');
      let childOverflow = false;
      const overflowDetails = [];

      children.forEach(child => {
        const childScroll = child.scrollWidth;
        const childClient = child.clientWidth;
        if (childScroll > childClient) {
          childOverflow = true;
          overflowDetails.push({
            tag: child.tagName,
            class: child.className,
            scrollWidth: childScroll,
            clientWidth: childClient,
            overflow: childScroll - childClient
          });
        }
      });

      return {
        slideLayout: {
          scrollWidth,
          clientWidth,
          scrollHeight,
          clientHeight,
          hasHorizontalOverflow,
          hasVerticalOverflow,
          horizontalOverflow: scrollWidth - clientWidth,
          verticalOverflow: scrollHeight - clientHeight
        },
        childOverflow,
        overflowDetails: overflowDetails.slice(0, 5) // Limit details
      };
    });

    console.log('\n📊 Overflow Check Results:');
    console.log(JSON.stringify(overflowCheck, null, 2));

    if (overflowCheck.slideLayout.hasHorizontalOverflow) {
      console.log(`\n⚠️  Horizontal overflow detected: ${overflowCheck.slideLayout.horizontalOverflow}px`);
    } else {
      console.log('\n✅ No horizontal overflow detected');
    }

    if (overflowCheck.childOverflow) {
      console.log(`\n⚠️  Child element overflow detected on ${overflowCheck.overflowDetails.length} elements`);
    } else {
      console.log('\n✅ No child element overflow detected');
    }

    return overflowCheck;
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  const port = process.argv[2] ? parseInt(process.argv[2]) : 3030;
  const page = process.argv[3] ? parseInt(process.argv[3]) : 4;

  verifyNoOverflow(port, page)
    .then(results => {
      const hasOverflow = results.slideLayout.hasHorizontalOverflow || results.childOverflow;
      process.exit(hasOverflow ? 1 : 0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { verifyNoOverflow };

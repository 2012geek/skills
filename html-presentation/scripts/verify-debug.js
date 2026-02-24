#!/usr/bin/env node

const fs = require('fs');
const SlideVerifier = require('./overflow-verifier');
const path = require('path');

async function main() {
  const inputFile = process.argv[2];
  const slideIndex = parseInt(process.argv[3]) || 0;

  if (!inputFile) {
    console.error('Usage: node verify-debug.js <input.md> [slide-index]');
    console.error('');
    console.error('Examples:');
    console.error('  node verify-debug.js slides.md 0        # Verify first slide');
    console.error('  node verify-debug.js slides.md 3        # Verify fourth slide');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`Error: File not found: ${inputFile}`);
    process.exit(1);
  }

  const content = fs.readFileSync(inputFile, 'utf-8');
  const slides = content.split(/^---$/gm).filter(s => s.trim());

  const targetSlide = slides[slideIndex];
  if (!targetSlide) {
    console.error(`Error: Slide ${slideIndex} not found (file has ${slides.length} slides)`);
    process.exit(1);
  }

  console.log(`Verifying slide ${slideIndex} of ${slides.length}...`);
  const verifier = new SlideVerifier({ debugMode: true });

  try {
    const result = await verifier.verify(targetSlide);
    console.log('');
    console.log('=== Results ===');
    console.log(`Title: ${result.basicInfo.title}`);
    console.log(`Vertical Overflow: ${result.basicInfo.vOverflow ? 'YES ⚠️' : 'No ✅'}`);
    console.log(`Horizontal Overflow: ${result.basicInfo.hOverflow ? 'YES ⚠️' : 'No ✅'}`);
    console.log(`Scroll Ratio: ${result.basicInfo.ratio}x`);
    console.log(`Screenshot Size: ${(result.screenshot.length / 1024).toFixed(1)} KB`);

    // Save screenshot
    const screenshotPath = path.join(__dirname, '..', `debug-slide-${slideIndex}.png`);
    fs.writeFileSync(screenshotPath, result.screenshot);
    console.log(`\nScreenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  } finally {
    await verifier.cleanup();
  }
}

main().catch(error => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

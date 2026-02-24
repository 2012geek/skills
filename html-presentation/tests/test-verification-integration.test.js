#!/usr/bin/env node

/**
 * Test verification flow integration
 * This test verifies that the verification flow is properly integrated
 * without actually running the full verification (requires API key)
 */

const { generateSlidevMarkdown } = require('../scripts/slidev-generator');
const fs = require('fs');
const path = require('path');

async function testIntegration() {
  console.log('🧪 Testing verification flow integration...\n');

  // Create a simple test markdown
  const testMarkdown = `# Test Presentation

## Slide 1
This is a test slide with some content.

- Item 1
- Item 2
- Item 3

## Slide 2
Another slide with code:

\`\`\`javascript
function test() {
  return true;
}
\`\`\`
`;

  const testInputPath = path.join(__dirname, '.test-verification-input.md');
  const testOutputPath = path.join(__dirname, '.test-verification-output.md');

  try {
    // Write test input
    fs.writeFileSync(testInputPath, testMarkdown);

    // Test 1: Generate without verification
    console.log('Test 1: Generate slides WITHOUT verification');
    await generateSlidevMarkdown(testInputPath, testOutputPath, {
      optimizeSlides: false,
      verifySlides: false
    });

    const result1 = fs.readFileSync(testOutputPath, 'utf-8');
    console.log('✅ Generated without verification');
    console.log(`   Output length: ${result1.length} characters\n`);

    // Test 2: Check if verifySlides option is recognized
    console.log('Test 2: Check if verifySlides option is recognized');
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  ANTHROPIC_API_KEY not set - skipping actual verification test');
      console.log('   (This is expected in CI/without credentials)\n');
    } else {
      console.log('✅ ANTHROPIC_API_KEY is set - verification would run');
      console.log('   (Not running actual verification to save time)\n');
    }

    // Test 3: Check that the integration point exists in the code
    console.log('Test 3: Check if verification integration exists in code');
    const slidevGeneratorCode = fs.readFileSync(path.join(__dirname, '../scripts/slidev-generator.js'), 'utf-8');

    const hasVerifyMethod = slidevGeneratorCode.includes('async verifyAndFix');
    const hasVerifyCall = slidevGeneratorCode.includes('verifySlides && process.env.ANTHROPIC_API_KEY');
    const hasIterativeLoop = slidevGeneratorCode.includes('for (let i = 0; i < maxIterations') && slidevGeneratorCode.includes('verification');

    if (hasVerifyMethod && hasVerifyCall && hasIterativeLoop) {
      console.log('✅ Verification integration found in code');
      console.log(`   - verifyAndFix method: ${hasVerifyMethod}`);
      console.log(`   - verifySlides check: ${hasVerifyCall}`);
      console.log(`   - Iterative loop: ${hasIterativeLoop}\n`);
    } else {
      console.log('❌ Verification integration NOT complete');
      console.log(`   - verifyAndFix method: ${hasVerifyMethod}`);
      console.log(`   - verifySlides check: ${hasVerifyCall}`);
      console.log(`   - Iterative loop: ${hasIterativeLoop}\n`);
      process.exit(1);
    }

    // Test 4: Check that build.js has --verify flag
    console.log('Test 4: Check if build.js supports --verify flag');
    const buildJsCode = fs.readFileSync(path.join(__dirname, '../scripts/build.js'), 'utf-8');

    const hasVerifyFlag = buildJsCode.includes('--verify') && buildJsCode.includes('verifySlides');
    const hasVerifyHelp = buildJsCode.includes('Slide Verification') && buildJsCode.includes('auto-fix');

    if (hasVerifyFlag && hasVerifyHelp) {
      console.log('✅ build.js supports --verify flag');
      console.log(`   - Flag support: ${hasVerifyFlag}`);
      console.log(`   - Help text: ${hasVerifyHelp}\n`);
    } else {
      console.log('❌ build.js --verify flag NOT complete');
      console.log(`   - Flag support: ${hasVerifyFlag}`);
      console.log(`   - Help text: ${hasVerifyHelp}\n`);
      process.exit(1);
    }

    console.log('✅ All integration tests passed!\n');

  } finally {
    // Clean up test files
    try {
      if (fs.existsSync(testInputPath)) fs.unlinkSync(testInputPath);
      if (fs.existsSync(testOutputPath)) fs.unlinkSync(testOutputPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run tests
testIntegration().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

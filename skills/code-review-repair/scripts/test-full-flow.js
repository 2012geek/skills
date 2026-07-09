/**
 * Test full repair flow with new API approach
 */

const { GitCodeAPIRepair } = require('../lib/gitcode-api-repair.js');
const fs = require('fs');

// Load config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));

const api = new GitCodeAPIRepair(config);

(async () => {
  try {
    console.log('🔧 Testing full repair flow for PR #50\n');

    // Test 1: Get review status
    console.log('📊 Testing getReviewStatus...');
    const status = await api.getReviewStatus(50);
    console.log('Result:', JSON.stringify(status, null, 2));

    // Test 2: Get unresolved comments
    console.log('\n📝 Testing getUnresolvedComments...');
    const comments = await api.getUnresolvedComments(50);
    console.log(`Found ${comments.length} unresolved comments`);
    if (comments.length > 0) {
      console.log('First comment:', JSON.stringify(comments[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  }
})();

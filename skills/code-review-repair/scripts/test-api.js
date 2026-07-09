/**
 * Test GitCode review comments API
 */

const https = require('https');

const token = 'hxE6zrUBGsSiauzuH7hJtUcn';
const owner = 'openeuler';
const repo = 'lerobot_ros2';
const prNumber = 50;

// Try the DiffNote API endpoint
const options = {
  hostname: 'web-api.gitcode.com',
  port: 443,
  path: `/issuepr/api/v1/projects/${owner}%2F${repo}/merge_requests/${prNumber}/discussions/note_type?page=1&per_page=100&note_type=DiffNote&sort=asc`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const jsonData = JSON.parse(data);
      console.log('Status:', res.statusCode);
      console.log('Response:', JSON.stringify(jsonData, null, 2));
    } catch (e) {
      console.log('Raw data:', data.substring(0, 1000));
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.end();

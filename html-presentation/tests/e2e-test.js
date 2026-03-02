/**
 * 端到端测试 - 验证完整工作流程
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const http = require('http');

const ROOT = path.dirname(__dirname);
const TEST_INPUT = path.join(ROOT, 'docs/plans/intelligent-overflow-detection.md');
const TEST_OUTPUT = path.join(ROOT, 'docs/plans/intelligent-overflow-detection.slides.md');

let testsPassed = 0;
let testsFailed = 0;

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`);
}

function test(name, fn) {
  try {
    fn();
    log('✅', `PASS: ${name}`);
    testsPassed++;
  } catch (e) {
    log('❌', `FAIL: ${name}`);
    log('   ', e.message);
    testsFailed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// 测试 1: 检查输入文件存在
test('Input file exists', () => {
  assert(fs.existsSync(TEST_INPUT), `Input file not found: ${TEST_INPUT}`);
});

// 测试 2: 运行生成器
test('Generator runs successfully', () => {
  const result = execSync(`node cli.js generate "${TEST_INPUT}" --theme seriph`, {
    cwd: ROOT,
    encoding: 'utf-8'
  });
  assert(result.includes('Presentation generated'), 'Generator output missing success message');
});

// 测试 3: 检查输出文件存在
test('Output file exists', () => {
  assert(fs.existsSync(TEST_OUTPUT), `Output file not found: ${TEST_OUTPUT}`);
});

// 测试 4: 检查输出文件格式正确
test('Output is valid Slidev markdown', () => {
  const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
  
  // 检查 frontmatter
  assert(content.startsWith('---\ntheme:'), 'Missing frontmatter');
  assert(content.includes('layout: default') || content.includes('layout:'), 'Missing layout');
  
  // 检查不应该有 HTML 标签（除了代码块内的）
  const lines = content.split('\n');
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) {
      assert(!line.includes('<p>'), 'Found HTML <p> tag outside code block');
      assert(!line.includes('<ul>'), 'Found HTML <ul> tag outside code block');
      assert(!line.includes('<pre>'), 'Found HTML <pre> tag outside code block');
      assert(!line.includes('&quot;'), 'Found HTML encoded &quot;');
    }
  }
});

// 测试 5: 检查幻灯片数量
test('Correct number of slides', () => {
  const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
  const slideCount = (content.match(/^---$/gm) || []).length;
  assert(slideCount >= 9, `Expected at least 9 slides, got ${slideCount}`);
});

// 测试 6: 检查代码块格式
test('Code blocks are properly formatted', () => {
  const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
  // 检查代码块使用三个反引号而不是 <pre><code>
  assert(!content.includes('<pre><code>'), 'Found HTML code block instead of markdown');
  assert(content.includes('```'), 'No markdown code blocks found');
});

// 测试 7: 启动 Slidev 并检查是否正常运行
async function testSlidevServer() {
  log('⏳', 'Testing Slidev server...');
  
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['slidev', TEST_OUTPUT, '--port', '3032'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let output = '';
    let timeout;
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('public slide show')) {
        // 服务器启动成功，尝试访问
        setTimeout(() => {
          http.get('http://localhost:3032/', (res) => {
            if (res.statusCode === 200) {
              log('✅', 'PASS: Slidev server responds with 200');
              testsPassed++;
              proc.kill();
              clearTimeout(timeout);
              resolve();
            } else {
              log('❌', `FAIL: Slidev server returned ${res.statusCode}`);
              testsFailed++;
              proc.kill();
              clearTimeout(timeout);
              resolve();
            }
          }).on('error', (e) => {
            log('❌', `FAIL: Cannot connect to Slidev server: ${e.message}`);
            testsFailed++;
            proc.kill();
            clearTimeout(timeout);
            resolve();
          });
        }, 5000);
      }
    });
    
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    timeout = setTimeout(() => {
      log('❌', 'FAIL: Slidev server timeout');
      testsFailed++;
      proc.kill();
      resolve();
    }, 30000);
    
    proc.on('error', (e) => {
      log('❌', `FAIL: Slidev process error: ${e.message}`);
      testsFailed++;
      clearTimeout(timeout);
      resolve();
    });
  });
}

// 运行测试
async function main() {
  console.log('\n========================================');
  console.log('  HTML-Presentation E2E Test Suite');
  console.log('========================================\n');
  
  // 同步测试已在上面运行
  
  // 异步测试
  await testSlidevServer();
  
  // 结果
  console.log('\n========================================');
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================\n');
  
  if (testsFailed > 0) {
    process.exit(1);
  }
}

main();

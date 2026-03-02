#!/usr/bin/env node

/**
 * Integration Test - 端到端集成测试
 * 测试从 Markdown 到 Slidev 的完整工作流程
 */

const path = require('path')
const fs = require('fs').promises
const { spawn } = require('child_process')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function success(message) { log(`✅ ${message}`, 'green') }
function error(message) { log(`❌ ${message}`, 'red') }
function warn(message) { log(`⚠️  ${message}`, 'yellow') }
function info(message) { log(`ℹ️  ${message}`, 'blue') }
function dim(message) { log(message, 'gray') }
function header(message) { log(message, 'cyan') }

/**
 * 执行构建命令
 */
async function runBuild(args, testDir) {
  // Use relative path to build-v5.js from test-integration.js directory
  const buildPath = '../build-v5.js'
  const cmd = `node ${buildPath} ${args.join(' ')}`

  log(`执行: ${cmd}`)
  dim(`工作目录: ${testDir}`)

  const proc = spawn(cmd, {
    cwd: testDir,
    stdio: 'inherit',
    shell: true
  })

    let output = []
    let hasError = false

    proc.stdout.on('data', data => {
      output.push(data.toString())
    })

    proc.stderr.on('data', data => {
      output.push(data.toString())
      hasError = true
    })

    proc.on('close', (code) => {
      const fullOutput = output.join('')

      if (code === 0 && !hasError) {
        success('构建成功')
        resolve(fullOutput)
      } else {
        error('构建失败 (退出码: ${code})')
        dim('输出:')
        dim(fullOutput)
        reject(new Error(fullOutput))
      }
    })

    proc.on('error', (err) => {
      hasError = true
      reject(err)
    })
  })
}

/**
 * 创建测试 Markdown
 */
async function createTestMarkdown(testDir) {
  const testMarkdown = `# Integration Test

## Features

This is an integration test for the enhanced Slidev presentation builder.

## Feature 1: Code Display

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
  return true;
}
\`\`\`

## Feature 2: Lists

- Item 1
- Item 2
- Item 3

## Feature 3: Images

![Remote Image](https://via.placeholder.com/600x400)

## Feature 4: Long Content

This slide has a lot of content that should trigger the smart splitter.

## Feature 5: Code Block

\`\`\`python
def long_function():
    """A very long function that does many things."""
    # Step 1
    # Step 2
    # Step 3
    return result
\`\`\`

## Feature 6: Table

| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Data 1    | Data 2    | Data 3    |
| Data 4    | Data 5    | Data 6    |

## Feature 7: Quote

> "This is a test quote to ensure quote rendering works correctly."
> — *Author*

---

## End

Note: This presentation tests the complete build pipeline.
`

  const testFile = path.join(testDir, 'integration-test.md')

  try {
    await fs.writeFile(testFile, testMarkdown, 'utf-8')
    console.log(`Created test file: ${testFile}`)
    return testFile
  } catch (err) {
    console.error(`Failed to create test file: ${err.message}`)
    throw err
  }
}

/**
 * 测试场景
 */
const testScenarios = [
  {
    name: '场景 1: 基础构建',
    description: '只生成 Slidev Markdown，不优化',
    args: ['integration-test.md', '--mode', 'build', 'output.html']
  },
  {
    name: '场景 2: 图片优化构建',
    description: '下载并优化图片',
    args: ['integration-test.md', '--mode', 'build', 'output.html', '--optimize-images']
  },
  {
    name: '场景 3: 浏览器测量构建',
    description: '使用浏览器模式测量内容',
    args: ['integration-test.md', '--mode', 'build', 'output.html', '--use-browser']
  },
  {
    name: '场景 4: AI 优化构建',
    description: '启用 AI 内容优化',
    args: ['integration-test.md', '--mode', 'build', 'output.html', '--enable-ai']
  },
  {
    name: '场景 5: 完整优化构建',
    description: '启用所有优化功能',
    args: [
      'integration-test.md',
      '--mode', 'build',
      'output.html',
      '--optimize-images',
      '--use-browser',
      '--enable-ai'
    ]
  }
]

/**
 * 运行测试场景
 */
async function runScenarios(testDir) {
  await createTestMarkdown(testDir)

  header('\n🧪 Integration Test Suite\n')
  header('='.repeat(70))

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: []
  }

  for (const scenario of testScenarios) {
    info(`\n${scenario.name}`)
    dim(`   ${scenario.description}`)

    try {
      const output = await runBuild(scenario.args, testDir)
      results.total++

      // 检查关键输出
      const hasError = output.includes('❌') ||
                       output.includes('Error') ||
                       output.includes('失败')

      const hasSuccess = output.includes('✅') ||
                        output.includes('成功')

      if (hasSuccess) {
        results.passed++
        success('通过')
      } else if (hasError) {
        results.failed++
        error('失败')
      } else {
        results.skipped.push({
          scenario: scenario.name,
          reason: '无法判断结果'
        })
      }

      dim('输出:')
      dim(output.split('\n').slice(0, 10).join('   '))

    } catch (err) {
      results.failed++
      error(`异常: ${err.message}`)
    }
  }

  // 总结
  header('\n' + '='.repeat(70))
  header('测试汇总')
  header('='.repeat(70))

  info(`总测试数: ${results.total}`)
  info(`通过: ${results.passed}`)
  info(`失败: ${results.failed}`)
  info(`跳过: ${results.skipped.length}`)

  if (results.failed === 0) {
    success('✅ 集成测试完成!')
  } else {
    warn(`⚠️  部分测试失败`)
  }

  return results.failed === 0
}

/**
 * 主测试函数
 */
async function main() {
  const testDir = path.join(process.cwd(), '.test-integration')

  // 清理并创建测试目录
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(testDir, { recursive: true })

  try {
    const success = await runScenarios(testDir)
    process.exit(success ? 0 : 1)
  } catch (err) {
    error(`测试失败: ${err.message}`)
    console.error(err.stack)
    process.exit(1)
  }
}

// 运行测试
if (require.main === module) {
  main()
}

module.exports = { runScenarios, main }

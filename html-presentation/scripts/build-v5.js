#!/usr/bin/env node

/**
 * Slidev Presentation Builder v5.0.0
 * 完整集成版本 - 集成所有新模块
 * @description Markdown to Slidev presentations with full optimization pipeline
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// ============================================================================
// DEPENDENCIES - 集成所有新模块
// ============================================================================

const { ContentMeasurer } = require('../core/content-measurer.js');
const { SmartSplitter } = require('../core/smart-splitter.js');
const { ImageProcessor } = require('../core/image-processor.js');
const { AIProcessor } = require('../core/ai-processor.js');
const { ThemeManager } = require('../core/theme-manager.js');
const { build: buildSlidev } = require('./build-slidev.js');
const { generateSlidevMarkdown } = require('./slidev-generator.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  mode: 'dev',
  title: 'Presentation',
  theme: 'seriph',
  transition: 'slide',
  lineNumbers: true,
  port: 3030,
  host: '0.0.0.0',

  // 新增功能开关
  optimize: false,
  optimizeLevel: 'basic', // 'basic' or 'full'
  optimizeImages: false,
  useBrowserMeasurement: false,
  enableAI: false,

  // 文件路径配置
  assetsDir: 'assets',
  imagesDir: 'assets/images',
  themesDir: 'themes'
};

// ============================================================================
// ENHANCED BUILD PIPELINE
// ============================================================================

/**
 * 完整的构建管道
 */
async function buildWithPipeline(inputPath, outputPath, config) {
  console.log(`🚀 Starting Enhanced Build Pipeline v5.0.0`);
  console.log(`📄 Input: ${inputPath}`);
  console.log(`🎨 Theme: ${config.theme}`);
  console.log(`🧠 Mode: ${config.mode.toUpperCase()}`);

  const results = {
    originalSlides: 0,
    optimizedSlides: 0,
    splitSlides: 0,
    processedImages: 0,
    measurementMode: 'estimate'
  };

  try {
    // 1. 读取原始 Markdown
    console.log('\n--- 步骤 1: 读取内容 ---');
    const originalMarkdown = fs.readFileSync(inputPath, 'utf-8');
    const lines = originalMarkdown.split('\n');
    results.originalSlides = lines.length;
    console.log(`   原始幻灯片数: ${lines.length}`);

    // 2. 处理图片（如果启用）
    let processedMarkdown = originalMarkdown;
    if (config.optimizeImages) {
      console.log('\n--- 步骤 2: 处理图片 ---');
      const imageProcessor = new ImageProcessor({
        cacheDir: config.imagesDir,
        optimize: config.optimizeImages,
        optimizeQuality: 85,
        maxWidth: 1920,
        maxHeight: 1080
      });

      const imageResult = await imageProcessor.processImages(
        processedMarkdown,
        process.cwd()
      );

      processedMarkdown = imageResult.updatedMarkdown;
      results.processedImages = imageResult.stats.processed || 0;
      console.log(`   已处理: ${results.processed} 张图片`);
      console.log(`   优化: ${imageResult.stats.processed > 0 ? '是' : '否'}`);
    }

    // 3. 分析并优化内容（如果启用）
    if (config.optimize) {
      console.log('\n--- 步骤 3: 内容优化 ---');

      const aiProcessor = new AIProcessor({
        enabled: config.enableAI,
        apiKey: process.env.ANTHROPIC_API_KEY,
        debug: false
      });

      // 使用 ContentMeasurer 分析（支持浏览器模式）
      const measurer = new ContentMeasurer({
        mode: config.useBrowserMeasurement ? 'browser' : 'estimate',
        debug: false
      });

      const splitter = new SmartSplitter(measurer);

      // 简化的优化流程：对每个"幻灯片"进行分析
      const contentBlocks = splitIntoBlocks(processedMarkdown);

      for (let i = 0; i < contentBlocks.length; i++) {
        const block = contentBlocks[i];

        // AI 优化
        const aiResult = await aiProcessor.processSlide(block, {
          optimize: config.optimizeLevel === 'full'
        });

        // 检查是否需要拆分
        const splitDecision = splitter.shouldSplit(aiResult.optimized || block);

        if (splitDecision.shouldSplit) {
          console.log(`   块 ${i + 1}: 需要拆分 (${splitDecision.reason})`);
          const splitResults = await splitter.autoSplit(aiResult.optimized || block);

          for (const split of splitResults.splits) {
            results.optimizedSlides++;
          }
        } else {
          results.optimizedSlides++;
        }
      }

      if (aiProcessor.config.enabled) {
        const stats = aiProcessor.getStats();
        console.log(`   AI 调用: ${stats.totalCalls} 次`);
        console.log(`   Token 使用: ${stats.totalTokens}`);
        console.log(`   预估成本: $${stats.estimatedCost}`);
      }
    }

    // 4. 生成 Slidev Markdown
    console.log('\n--- 步骤 4: 生成 Slidev Markdown ---');

    // Write processed markdown to temp file for generateSlidevMarkdown to read
    const tempInputPath = path.join(process.cwd(), '.slidev-input.md');
    const markdownToProcess = config.optimize ? processedMarkdown : originalMarkdown;
    fs.writeFileSync(tempInputPath, markdownToProcess, 'utf-8');

    const tempPath = path.join(process.cwd(), '.slidev-pipeline.md');

    await generateSlidevMarkdown(
      tempInputPath,
      tempPath,
      { optimizeSlides: false }  // slidev-generator 内部优化
    );

    // 5. 构建或启动
    console.log('\n--- 步骤 5: 构建演示文稿 ---');

    if (config.mode === 'dev') {
      console.log('[DEBUG] 启动 Dev 模式');
      await startDevMode(tempPath, config);
    } else {
      console.log('[DEBUG] 启动 Build 模式');
      await startBuildMode(tempPath, outputPath, config);
    }

  } catch (err) {
    console.error('[DEBUG] 构建失败:', err.message);
    console.error('[DEBUG] 错误堆栈:', err.stack);

    // 检查是否是 buildSlidev 抛出的错误
    if (err.message && err.message.includes('Slidev build failed')) {
      console.error('[DEBUG] buildSlidev 执行失败，重新抛出错误');
      throw err;
    }

    console.log(`\n❌ Build failed: ${err.message}`);
    throw err;
  }
}

/**
 * 拆分内容为块
 */
function splitIntoBlocks(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let currentBlock = [];

  for (const line of lines) {
    // 检测幻灯片分隔符
    if (line.trim() === '---') {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'));
      }
      currentBlock = [];
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'));
  }

  // 如果没有分隔符，整个内容作为一个块
  if (blocks.length === 0) {
    blocks.push(markdown);
  }

  return blocks;
}

/**
 * 启动开发模式
 */
async function startDevMode(inputPath, config) {
  console.log('🚀 启动 Dev Server');
  console.log(`   主题: ${config.theme}`);
  console.log(`   端口: ${config.port}`);

  const slidevBin = path.join(__dirname, '../node_modules/@slidev/cli/bin/slidev.mjs');

  if (!require('fs').existsSync(slidevBin)) {
    console.error(`❌ Slidev binary not found: ${slidevBin}`);
    console.log('   Installing Slidev...');
    throw new Error('Slidev binary not found. Please run: npm install');
  }

  const slidev = spawn('node', [slidevBin, inputPath, '--port', config.port.toString()], {
    stdio: 'inherit',
    env: {
      ...process.env,
      SLIDEV_THEME: config.theme
    }
  });

  if (!slidev) {
    throw new Error('Failed to spawn slidev process');
  }

  // 清理
  slidev.on('close', () => {
    try {
      if (require('fs').exists(inputPath)) {
        // 不删除原始文件
        const stats = require('fs').statSync(inputPath);
        console.log(`   临时文件: ${inputPath} (${Math.round(stats.size / 1024)}KB)`);
      }
    } catch (err) {
      // 忽略
    }
  });

  slidev.on('error', (err) => {
    console.error(`❌ Slidev error: ${err.message}`);
    process.exit(1);
  });

  await new Promise((resolve, reject) => {
    slidev.on('exit', resolve);
    slidev.on('error', reject);
  });
}

/**
 * 启动构建模式
 */
async function startBuildMode(inputPath, outputPath, config) {
  console.log('🏗️ 构建静态文件');
  console.log('[DEBUG] startBuildMode 被调用');

  // Resolve paths to absolute paths
  const resolvedInputPath = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const resolvedOutputPath = path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);

  console.log(`   输入: ${resolvedInputPath}`);
  console.log(`   输出: ${resolvedOutputPath}`);

  try {
    console.log('[DEBUG] 调用 buildSlidev...');
    await buildSlidev(resolvedInputPath, resolvedOutputPath, {
      title: config.title,
      theme: config.theme,
      highlighter: 'shiki',
      lineNumbers: config.lineNumbers
    });
    console.log('[DEBUG] buildSlidev 完成');
  } catch (err) {
    console.log('[DEBUG] buildSlidev 失败:', err.message);
    throw err;
  }

  console.log('[DEBUG] 构建步骤完成');
  console.log('✅ 构建完成');
  console.log(`\n打开: ${resolvedOutputPath}`);
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  console.error('[DEBUG] main() called with args:', process.argv.slice(2));
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Slidev Presentation Builder v5.0.0 - Enhanced Build Pipeline
Markdown to Slidev presentations with full optimization

USAGE:
  node build.js <input.md> [options]

OPTIONS:
  --mode <mode>           Mode: dev (default) or build
  --theme <name>         Theme: ${DEFAULT_CONFIG.theme}
  --optimize              Enable content optimization (default: false)
  --optimize-level <n>    Level: basic (default) or full
  --optimize-images        Enable image optimization (default: false)
  --use-browser           Use browser measurement (default: false)
  --enable-ai            Enable AI optimization (requires API key)
  --port <number>        Port for dev server (default: 3030)
  --no-line-numbers      Disable code line numbers

EXAMPLES:
  # Dev mode with all features
  node build.js slides.md --optimize --optimize-level full --optimize-images --use-browser --enable-ai

  # Build static HTML
  node build.js slides.md dist/index.html --mode build

FEATURES:
  ✅ AI Content Optimization (Anthropic Claude)
  ✅ Browser-based Content Measurement
  ✅ Image Optimization (Sharp)
  ✅ Smart Content Splitting
  ✅ Theme Management
  ✅ Remote Image Download & Processing

ENVIRONMENT VARIABLES:
  ANTHROPIC_API_KEY    Required for AI optimization (full level)

MODES:
  dev   - Live server with full toolbar (drawing, presenter view, etc)
  build  - Static HTML export
    `);
    process.exit(0);
  }

  // 解析选项
  const config = { ...DEFAULT_CONFIG };

  // First, separate options from positional args
  const optionArgs = [];
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      optionArgs.push(arg);
      // For options with values, also add the next arg
      if (['--mode', '--theme', '--optimize-level', '--port'].includes(arg) && i + 1 < args.length && !args[i + 1].startsWith('--')) {
        optionArgs.push(args[++i]);
      }
    } else {
      positionalArgs.push(arg);
    }
  }

  // Parse options
  for (let i = 0; i < optionArgs.length; i++) {
    const arg = optionArgs[i];
    const nextArg = optionArgs[i + 1];

    if (arg === '--mode' && nextArg) {
      config.mode = nextArg;
      i++;
    } else if (arg === '--theme' && nextArg) {
      config.theme = nextArg;
      i++;
    } else if (arg === '--optimize') {
      config.optimize = true;
      if (nextArg === 'true' || (nextArg === 'full' && config.optimizeLevel !== 'full')) {
        config.optimizeLevel = nextArg;
        i++;
      }
    } else if (arg === '--optimize-level' && nextArg) {
      config.optimizeLevel = nextArg;
      i++;
    } else if (arg === '--optimize-images') {
      config.optimizeImages = true;
    } else if (arg === '--use-browser') {
      config.useBrowserMeasurement = true;
    } else if (arg === '--enable-ai') {
      config.enableAI = true;
    } else if (arg === '--port' && nextArg) {
      config.port = parseInt(nextArg);
      i++;
    } else if (arg === '--no-line-numbers') {
      config.lineNumbers = false;
    }
  }

  // Extract input and output paths from positional args
  const inputPath = positionalArgs[0];
  const outputPath = positionalArgs[1] || 'output.html';

  if (!inputPath) {
    console.error('Error: Please specify input markdown file');
    process.exit(1);
  }

  try {
    await buildWithPipeline(inputPath, outputPath, config);
  } catch (err) {
    console.error(`Build failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  build: buildWithPipeline,
  DEFAULT_CONFIG
};

// Run main if this file is executed directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

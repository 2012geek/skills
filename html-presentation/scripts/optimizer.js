#!/usr/bin/env node

/**
 * Presentation Optimizer v1.2
 * 使用 LLM 优化 Markdown 内容，使演示文稿更美观
 *
 * Phase 3 实现：缓存、增量优化和指标
 */

const fs = require('fs');
const path = require('path');

// 导入工具库
const {
  ContentAnalyzer,
  ContentOptimizer,
  CodeProcessor,
  optimizeContent,
  processCode
} = require('../lib/llm-optimizer.js');

const {
  MarkdownParser,
  MarkdownBuilder
} = require('../lib/markdown-utils.js');

const {
  CodeEnhancer,
  enhanceCode
} = require('../lib/code-enhancer.js');

const {
  IncrementalTracker,
  MetricsCollector
} = require('../lib/cache.js');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  enableOptimization: process.env.PRES_OPTIMIZER_ENABLED !== 'false',
  optimizationLevel: process.env.PRES_OPTIMIZER_LEVEL || 'basic',
  cacheDir: '.pres-optimizer-cache',
  maxConcurrent: 3,
};

// ============================================================================
// MAIN OPTIMIZER CLASS
// ============================================================================

class PresentationOptimizer {
  constructor(inputPath, options = {}) {
    this.inputPath = inputPath;
    this.options = { ...CONFIG, ...options };
    this.content = null;
    this.analysis = null;
    this.optimizedContent = null;

    // 初始化增量跟踪和指标收集
    const cacheDir = path.resolve(this.options.cacheDir);
    this.tracker = new IncrementalTracker(cacheDir);
    this.metrics = new MetricsCollector();
  }

  /**
   * 执行完整的优化流程
   */
  async optimize() {
    const startTime = Date.now();

    // 读取原始内容
    console.log(`📖 读取文件: ${this.inputPath}`);
    this.content = fs.readFileSync(this.inputPath, 'utf-8');

    // 检查文件是否更改（增量优化）
    const hasChanged = this.tracker.hasChanged(this.inputPath);
    if (!hasChanged && !this.options.force) {
      console.log('✅ 文件未更改，跳过优化（使用 --force 强制重新优化）');
      this.metrics.recordSlide(false);
      return this.content;
    }

    if (!this.options.enableOptimization) {
      console.log('⏭️  优化已禁用，返回原始内容');
      return this.content;
    }

    // 基础优化级别：只做结构分析
    if (this.options.optimizationLevel === 'basic') {
      return await this.basicOptimize();
    }

    // 完整优化：使用 LLM
    return await this.fullOptimize();
  }

  /**
   * 基础优化：不使用 LLM
   */
  async basicOptimize() {
    console.log('🔍 执行基础优化（不使用 LLM）...');

    // 解析 Markdown
    const parsed = MarkdownParser.parse(this.content);

    console.log(`   📊 解析结果:`);
    console.log(`   - 幻灯片数: ${parsed.slides.length}`);
    console.log(`   - 代码块数: ${parsed.info.codeBlocks.length}`);
    console.log(`   - 标题数: ${parsed.info.headings.length}`);

    // 优化每个代码块
    const optimizedSlides = parsed.slides.map((slide, index) => {
      return this.optimizeSlideBasic(slide, index);
    });

    // 记录指标
    this.metrics.recordSlide(true);
    parsed.info.codeBlocks.forEach(() => {
      this.metrics.recordCodeBlock();
    });

    // 更新文件哈希
    this.tracker.updateHash(this.inputPath);

    return this.rebuildMarkdown(optimizedSlides, parsed.info);
  }

  /**
   * 完整优化：使用 LLM
   */
  async fullOptimize() {
    console.log('🤖 执行完整优化（使用 LLM）...');

    // 步骤 1: 分析内容
    console.log('\n📊 步骤 1: 分析内容结构');
    const cacheDir = path.resolve(this.options.cacheDir);
    const analyzer = new ContentAnalyzer({ cacheDir, metrics: this.metrics });
    this.analysis = await analyzer.analyze(this.content);
    this.metrics.recordSlide(true);

    // 步骤 2: 优化内容
    console.log('\n✨ 步骤 2: 优化内容');
    const optimizerInstance = new ContentOptimizer({ cacheDir, metrics: this.metrics });
    const optimized = await optimizerInstance.optimize(this.content, this.analysis);

    return optimized;
  }

  /**
   * 优化单张幻灯片（基础模式）
   */
  optimizeSlideBasic(slide, index) {
    const content = slide.content.join('\n');

    // 提取代码块
    const codeBlocks = MarkdownParser.extractCodeBlocks(content);

    // 处理每个代码块
    let optimizedContent = content;

    for (const block of codeBlocks) {
      const enhanced = enhanceCode(block.code, block.language);

      // 生成带高亮的代码块
      const enhancer = new CodeEnhancer(block.language);
      const slidevCode = enhancer.generateSlidevCodeBlock(
        enhanced.original,
        enhanced.highlights,
        block.language
      );

      // 替换原代码块
      optimizedContent = optimizedContent.replace(block.fullMatch, slidevCode);
    }

    return {
      ...slide,
      content: optimizedContent.split('\n')
    };
  }

  /**
   * 重建 Markdown
   */
  rebuildMarkdown(slides, info) {
    const builder = new MarkdownBuilder();

    // 添加 Frontmatter
    builder.raw(`---
theme: seriph
highlighter: shiki
lineNumbers: false
class: text-left
---

`);

    // 添加幻灯片
    slides.forEach((slide, index) => {
      if (index > 0) {
        builder.separator();
      }
      builder.raw(slide.content.join('\n'));
    });

    return builder.build();
  }

  /**
   * 生成优化报告
   */
  generateReport() {
    if (!this.analysis) {
      return '未执行分析';
    }

    const report = {
      summary: '优化报告',
      slides: this.analysis.structure?.length || 0,
      keyPoints: this.analysis.keyPoints?.length || 0,
      codeBlocks: this.analysis.codeBlocks?.length || 0,
      visualElements: this.analysis.visualElements?.length || 0,
      suggestions: []
    };

    // 根据分析生成建议
    if (report.codeBlocks > 5) {
      report.suggestions.push('建议：代码块较多，考虑使用代码折叠或分步展示');
    }

    if (this.analysis.visualElements && this.analysis.visualElements.length > 0) {
      report.suggestions.push('建议：添加可视化元素以增强理解');
    }

    return report;
  }

  /**
   * 打印指标报告
   */
  printMetrics() {
    this.metrics.printReport();

    // 打印缓存统计（如果使用 LLM）
    if (this.options.optimizationLevel === 'full') {
      const cacheDir = path.resolve(this.options.cacheDir);
      const { OptimizationCache } = require('../lib/cache.js');
      const cache = new OptimizationCache(cacheDir);
      const stats = cache.getStats();

      console.log('\n💾 Cache Stats:');
      console.log(`  Entries: ${stats.entries}`);
      console.log(`  Hit Rate: ${stats.hitRate}`);
      console.log(`  Total Size: ${stats.totalSize}`);
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Presentation Optimizer v1.2

Usage:
  node optimizer.js <input.md> [output.md] [options]

Arguments:
  input.md               输入的 Markdown 文件路径
  output.md              输出的优化后文件 (可选，默认: input-optimized.md)

Options:
  --level <basic|full>  优化级别
                         basic: 基础优化（不使用 LLM，仅代码处理）
                         full:  完整优化（使用 LLM）
                         默认: basic

  --no-optimization      禁用优化，直接返回原文件

  --dry-run              只显示分析结果，不生成文件

  --force                强制重新优化，忽略增量检查

  --cache-stats          显示缓存统计信息

  --cache-clean          清理过期缓存

  --cache-dir <path>      指定缓存目录 (默认: .pres-optimizer-cache)

Examples:
  # 基础优化（默认）
  node optimizer.js presentation.md

  # 完整优化（使用 LLM）
  node optimizer.js presentation.md --level full

  # 只显示分析结果
  node optimizer.js presentation.md --dry-run

  # 强制重新优化
  node optimizer.js presentation.md --force

  # 查看缓存统计
  node optimizer.js presentation.md --cache-stats

  # 清理缓存
  node optimizer.js presentation.md --cache-clean

Environment Variables:
  PRES_OPTIMIZER_ENABLED  是否启用优化 (默认: true)
  PRES_OPTIMIZER_LEVEL     优化级别 (默认: basic)
  ANTHROPIC_API_KEY        Anthropic API Key (full level 需要)

Features:
  - 增量优化：只优化更改的文件
  - 持久化缓存：减少 LLM 调用成本
  - 指标收集：量化优化效果
    `);
    process.exit(0);
  }

  // 解析参数 - 先处理选项，再处理位置参数
  const options = {
    optimizationLevel: 'basic',
    enableOptimization: true,
    dryRun: false,
    force: false,
    showCacheStats: false,
    cleanCache: false,
    cacheDir: '.pres-optimizer-cache'
  };

  // 提取所有选项和位置参数
  const positionalArgs = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const optionName = args[i];
      switch (optionName) {
        case '--level':
          options.optimizationLevel = args[++i];
          break;
        case '--no-optimization':
          options.enableOptimization = false;
          break;
        case '--dry-run':
          options.dryRun = true;
          break;
        case '--force':
          options.force = true;
          break;
        case '--cache-stats':
          options.showCacheStats = true;
          break;
        case '--cache-clean':
          options.cleanCache = true;
          break;
        case '--cache-dir':
          options.cacheDir = args[++i];
          break;
        default:
          console.error(`Unknown option: ${optionName}`);
          process.exit(1);
      }
    } else {
      positionalArgs.push(args[i]);
    }
  }

  const inputPath = positionalArgs[0];
  let outputPath = positionalArgs[1] || null;

  // 处理缓存统计（无需输入文件）
  if (options.showCacheStats) {
    const { OptimizationCache } = require('../lib/cache.js');
    const cache = new OptimizationCache(path.resolve(options.cacheDir));
    const stats = cache.getStats();
    console.log('\n💾 Cache Statistics:');
    console.log('─'.repeat(40));
    console.log(`Entries: ${stats.entries}`);
    console.log(`Hits: ${stats.hits}`);
    console.log(`Misses: ${stats.misses}`);
    console.log(`Hit Rate: ${stats.hitRate}`);
    console.log(`Total Size: ${stats.totalSize}`);
    console.log(`Created: ${stats.created}`);
    console.log(`Last Access: ${stats.lastAccess}`);
    console.log('─'.repeat(40));
    process.exit(0);
  }

  // 处理缓存清理（无需输入文件）
  if (options.cleanCache) {
    const { OptimizationCache } = require('../lib/cache.js');
    const cache = new OptimizationCache(path.resolve(options.cacheDir));
    const cleaned = cache.cleanup();
    console.log(`\n🧹 Cleaned ${cleaned} expired cache entries`);
    process.exit(0);
  }

  // 需要输入文件
  if (!inputPath) {
    console.error('Error: Missing input file path');
    console.log('Usage: node optimizer.js <input.md> [output.md] [options]');
    process.exit(1);
  }

  // 执行优化
  (async () => {
    try {
      const optimizer = new PresentationOptimizer(inputPath, options);

      if (options.dryRun) {
        console.log('📋 Dry Run 模式\n');

        // 只分析，不优化
        const content = fs.readFileSync(inputPath, 'utf-8');
        const parsed = MarkdownParser.parse(content);

        console.log('📊 内容分析:\n');
        console.log(`  幻灯片数量: ${parsed.slides.length}`);
        console.log(`  代码块数量: ${parsed.info.codeBlocks.length}`);
        console.log(`  标题数量: ${parsed.info.headings.length}`);
        console.log(`  总行数: ${parsed.info.totalLines}`);

        console.log('\n📋 代码块详情:\n');
        parsed.info.codeBlocks.forEach((block, idx) => {
          const enhancer = new CodeEnhancer(block.language);
          const complexity = enhancer.analyzeComplexity(block.code);
          const summary = enhancer.summarizeCode(block.code);

          console.log(`  ${idx + 1}. ${block.language} - ${summary}`);
          console.log(`     行号: ${block.startLine}-${block.endLine}`);
          console.log(`     复杂度: ${complexity.complexity} (${complexity.codeLines} 行代码)`);
        });

        console.log('\n💡 优化建议:\n');

        // 根据分析给出建议
        if (parsed.info.codeBlocks.length > 0) {
          console.log('  ✅ 代码块将添加语法高亮');
        }

        const longSlides = parsed.slides.filter(s => s.endLine - s.lineNumber > 30);
        if (longSlides.length > 0) {
          console.log('  ⚠️  发现 ' + longSlides.length + ' 张内容较多的幻灯片，建议分页');
        }

        process.exit(0);
      }

      const optimized = await optimizer.optimize();

      if (!outputPath) {
        outputPath = inputPath.replace(/\.md$/, '-optimized.md');
      }

      if (optimized) {
        fs.writeFileSync(outputPath, optimized);
        console.log(`✅ 优化完成: ${outputPath}`);
      } else {
        console.log('ℹ️  未生成优化文件');
      }

      // 打印指标报告
      optimizer.printMetrics();

    } catch (error) {
      console.error(`❌ 优化失败: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  PresentationOptimizer,
  CONFIG
};

#!/usr/bin/env node

/**
 * Intelligent Slide Layout Auto-Fixer CLI
 *
 * Automatically analyzes slides, detects overflow issues, and applies smart CSS fixes.
 *
 * Usage:
 *   node scripts/fix-layouts.js <slide-file> [options]
 *
 * Options:
 *   --dry-run      Analyze and report changes without modifying files
 *   --verbose      Show detailed processing information
 *   --restore      Restore from the most recent backup
 */

const fs = require('fs').promises;
const path = require('path');
const { parseSlides } = require('./lib/slide-parser');
const { analyzeSlide } = require('./lib/slide-analyzer');
const { transformSlides } = require('./lib/layout-transformer');
const { reconstructMarkdown } = require('./lib/markdown-reconstructor');
const { generateReport } = require('./lib/report-generator');
const { createBackup, restoreBackup } = require('./lib/backup-manager');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Parse command line arguments
 */
function parseArgs(args) {
  const options = {
    dryRun: false,
    verbose: false,
    restore: false,
    filePath: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--restore') {
      options.restore = true;
    } else if (!arg.startsWith('--') && !options.filePath) {
      options.filePath = arg;
    }
  }

  return options;
}

/**
 * Log message with optional color and verbose check
 */
function log(message, color = '', verboseOnly = false) {
  if (verboseOnly && !global.verbose) {
    return;
  }
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Process slides file
 */
async function processSlides(filePath, options) {
  const absolutePath = path.resolve(filePath);

  log(`\n${colors.bright}📊 Intelligent Slide Layout Auto-Fixer${colors.reset}`);
  log(`${colors.dim}${'='.repeat(50)}${colors.reset}\n`);

  // Read file
  log(`📖 Reading file: ${absolutePath}`, colors.cyan);
  const markdown = await fs.readFile(absolutePath, 'utf8');

  // Parse slides
  log(`🔍 Parsing slides...`, colors.blue, true);
  const slides = parseSlides(markdown);
  log(`   Found ${slides.length} slides`, colors.dim, true);

  // Analyze slides
  log(`🔬 Analyzing slides...`, colors.blue, true);
  const analysisResults = slides.map(slide => ({
    index: slide.index,
    analysis: analyzeSlide(slide)
  }));

  if (options.verbose) {
    analysisResults.forEach(({ index, analysis }) => {
      log(`   Slide ${index + 1}: ${analysis.type} (${analysis.layout})`, colors.dim);
      log(`      Reason: ${analysis.reason}`, colors.dim);
    });
  }

  // Transform slides (inject CSS)
  log(`🔧 Applying smart CSS fixes...`, colors.blue, true);
  const transformedSlides = transformSlides(slides);

  // Reconstruct markdown
  log(`📝 Reconstructing markdown...`, colors.blue, true);
  const fixedMarkdown = reconstructMarkdown(transformedSlides);

  // Generate report
  const changes = analysisResults.map(({ index, analysis }) => ({
    slide: index + 1,
    type: analysis.type,
    layout: analysis.layout,
    reason: analysis.reason,
    cssInjected: index === 0 // CSS injected into first slide
  }));

  const summary = {
    totalSlides: slides.length,
    slidesProcessed: slides.length,
    cssInjected: true,
    changesDetected: changes.length
  };

  const report = generateReport(summary, changes);

  // Save report
  const reportPath = `${absolutePath}.layout-fix-report.json`;
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  log(`📋 Report saved: ${reportPath}`, colors.green);

  // Dry run - don't modify file
  if (options.dryRun) {
    log(`\n${colors.yellow}⚠️  Dry run mode - no files modified${colors.reset}`);
    log(`\n${colors.bright}Summary:${colors.reset}`);
    log(`  Total slides: ${summary.totalSlides}`, colors.dim);
    log(`  CSS would be injected: ${summary.cssInjected}`, colors.dim);
    log(`  Changes detected: ${summary.changesDetected}`, colors.dim);
    return report;
  }

  // Create backup
  log(`\n💾 Creating backup...`, colors.blue);
  const backupPath = await createBackup(absolutePath);
  log(`   Backup created: ${backupPath}`, colors.green);

  // Write fixed markdown
  log(`💾 Writing fixed slides...`, colors.blue);
  await fs.writeFile(absolutePath, fixedMarkdown, 'utf8');
  log(`   File updated: ${absolutePath}`, colors.green);

  // Show summary
  log(`\n${colors.bright}✅ Layout fix complete!${colors.reset}`);
  log(`\n${colors.bright}Summary:${colors.reset}`);
  log(`  Total slides: ${summary.totalSlides}`, colors.dim);
  log(`  CSS injected: ${summary.cssInjected}`, colors.dim);
  log(`  Changes: ${summary.changesDetected}`, colors.dim);
  log(`  Backup: ${backupPath}`, colors.dim);

  return report;
}

/**
 * Restore from backup
 */
async function restoreFromBackup(filePath) {
  const absolutePath = path.resolve(filePath);

  log(`\n${colors.bright}🔄 Restoring from backup${colors.reset}`);
  log(`${colors.dim}${'='.repeat(50)}${colors.reset}\n`);

  // Find most recent backup
  const dir = path.dirname(absolutePath);
  const basename = path.basename(absolutePath);
  const files = await fs.readdir(dir);

  const backups = files
    .filter(f => f.startsWith(basename) && f.includes('.backup-'))
    .sort()
    .reverse();

  if (backups.length === 0) {
    log(`${colors.red}❌ No backups found for ${absolutePath}${colors.reset}`);
    process.exit(1);
  }

  const mostRecentBackup = path.join(dir, backups[0]);
  log(`📂 Found backup: ${mostRecentBackup}`, colors.cyan);

  // Restore
  await restoreBackup(mostRecentBackup, absolutePath);

  log(`${colors.green}✅ Successfully restored from backup${colors.reset}`);
  log(`   Restored: ${absolutePath}`, colors.dim);
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  // Set verbose flag globally
  global.verbose = options.verbose;

  // Validate arguments
  if (!options.filePath) {
    console.error(`${colors.red}Error: No file specified${colors.reset}`);
    console.error(`\nUsage: node scripts/fix-layouts.js <slide-file> [options]`);
    console.error(`\nOptions:`);
    console.error(`  --dry-run      Analyze and report without modifying`);
    console.error(`  --verbose      Show detailed information`);
    console.error(`  --restore      Restore from most recent backup`);
    process.exit(1);
  }

  // Check if file exists
  const absolutePath = path.resolve(options.filePath);
  try {
    await fs.access(absolutePath);
  } catch (error) {
    log(`${colors.red}❌ File not found: ${absolutePath}${colors.reset}`);
    process.exit(1);
  }

  try {
    if (options.restore) {
      await restoreFromBackup(options.filePath);
    } else {
      await processSlides(options.filePath, options);
    }
  } catch (error) {
    log(`${colors.red}❌ Error: ${error.message}${colors.reset}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}

module.exports = { processSlides, restoreFromBackup };

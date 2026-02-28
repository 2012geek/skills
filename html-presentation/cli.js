#!/usr/bin/env node

/**
 * HTML Presentation CLI
 * Command-line interface for generating presentations
 */

const { program } = require('commander');
const path = require('path');
const fs = require('fs');
const { SlideGenerator } = require('./lib');
const { ContentAnalyzer, ThemeManager } = require('./lib');

const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`)
};

program
  .name('html-presentation')
  .description('Generate intelligent Slidev presentations from markdown')
  .version('5.0.0');

program
  .command('generate')
  .description('Generate presentation from markdown')
  .argument('<input>', 'Input markdown file')
  .option('-o, --output <file>', 'Output file')
  .option('-t, --theme <theme>', 'Theme name', 'seriph')
  .option('--title <title>', 'Presentation title')
  .option('--author <author>', 'Author name')
  .option('--verify', 'Enable verification with LLM judgment')
  .option('--no-verify', 'Disable verification')
  .option('--interactive', 'Enable human intervention mode', false)
  .option('--max-iterations <n>', 'Max auto-fix iterations', '3')
  .option('--threshold <score>', 'Quality threshold (0-100)', '80')
  .action(async (input, options) => {
    try {
      logger.info(`Generating presentation from ${input}`);

      const generator = new SlideGenerator({
        verifyEnabled: options.verify,
        interactive: options.interactive,
        maxIterations: parseInt(options.maxIterations),
        threshold: parseInt(options.threshold)
      });

      const presentation = await generator.generate(input, {
        theme: options.theme,
        title: options.title,
        author: options.author
      });

      const markdown = generator.renderToMarkdown(presentation);

      const outputFile = options.output ||
        input.replace(/\.md$/, '.slides.md');

      await fs.promises.writeFile(outputFile, markdown);

      logger.success(`Presentation generated: ${outputFile}`);
      logger.info(`Theme: ${presentation.theme}`);
      logger.info(`Slides: ${presentation.slides.length}`);

      if (options.verify) {
        logger.info('Verification enabled with LLM judgment');
        if (options.interactive) {
          logger.info('Interactive mode: will prompt for manual fixes if needed');
        }
      }
    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('analyze')
  .description('Analyze markdown file')
  .argument('<input>', 'Input markdown file')
  .action(async (input) => {
    try {
      const analyzer = new ContentAnalyzer();

      logger.info(`Analyzing ${input}`);
      const result = await analyzer.analyze(input);

      logger.success('Analysis complete:');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('recommend')
  .description('Get theme recommendations')
  .argument('<input>', 'Input markdown file')
  .action(async (input) => {
    try {
      const analyzer = new ContentAnalyzer();
      const manager = new ThemeManager();

      logger.info(`Analyzing ${input}`);
      const result = await analyzer.analyze(input);
      const recommendations = manager.recommendThemes(result.metrics);

      logger.success('Theme recommendations:');
      recommendations.forEach(rec => {
        console.log(`  - ${rec.theme} (${rec.priority})`);
        console.log(`    ${rec.reason}`);
      });
    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Start live preview with browser')
  .argument('<input>', 'Input markdown file')
  .option('-p, --port <port>', 'Port number', '3030')
  .option('--no-browser', 'Do not launch browser')
  .option('--headless', 'Run in headless mode')
  .action(async (input, options) => {
    try {
      const { PreviewManager } = require('./preview');

      logger.info(`Starting preview for ${input}`);

      const manager = new PreviewManager();
      const result = await manager.start({
        inputFile: input,
        port: parseInt(options.port)
      });

      if (result.browser) {
        logger.success(`Browser opened at ${result.url}`);
        logger.info('Press Ctrl+C to stop');
      } else {
        logger.info(`Server running at ${result.url}`);
        logger.info('Preview running in headless mode');
      }

      // Keep process alive
      process.on('SIGINT', async () => {
        logger.info('\nStopping preview...');
        await manager.stop();
        process.exit(0);
      });

    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export presentation to PDF, HTML, or screenshots')
  .argument('<input>', 'Input markdown file or URL')
  .option('-f, --format <format>', 'Export format (pdf, html, screenshot)', 'pdf')
  .option('-o, --output <path>', 'Output file or directory')
  .option('--all-slides', 'Capture all slides (for screenshots)', false)
  .action(async (input, options) => {
    try {
      const { ExportManager } = require('./preview');

      const exporter = new ExportManager();

      const isUrl = input.startsWith('http://') || input.startsWith('https://');
      const url = isUrl ? input : null;
      const outputPath = options.output || `./output.${options.format}`;

      logger.info(`Exporting to ${options.format}...`);

      let result;
      switch (options.format) {
        case 'pdf':
          result = await exporter.exportToPDF({
            url: url || `http://localhost:3030`,
            outputPath
          });
          break;
        case 'html':
          result = await exporter.exportToHTML({
            url: url || `http://localhost:3030`,
            outputPath
          });
          break;
        case 'screenshot':
          result = await exporter.captureScreenshot({
            url: url || `http://localhost:3030`,
            outputPath,
            captureAll: options.allSlides
          });
          break;
        default:
          throw new Error(`Unknown format: ${options.format}`);
      }

      if (result.success) {
        logger.success(`Export complete: ${result.path}`);
        if (result.files) {
          logger.info(`Captured ${result.files.length} slides`);
        }
      } else {
        logger.error(`Export failed: ${result.error}`);
        process.exit(1);
      }

    } catch (error) {
      logger.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();

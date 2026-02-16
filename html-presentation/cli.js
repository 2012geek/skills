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
  .action(async (input, options) => {
    try {
      logger.info(`Generating presentation from ${input}`);

      const generator = new SlideGenerator();
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

program.parse();

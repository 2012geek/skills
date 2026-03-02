#!/usr/bin/env node

/**
 * Slidev Presentation Builder
 * Converts Markdown to Slidev presentation
 * @version 4.0.0 - Slidev-only (Reveal.js removed)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// SLIDEV-SPECIFIC FUNCTIONS
// ============================================================================

const DEFAULT_CONFIG = {
  title: 'Presentation',
  theme: 'seriph',
  highlighter: 'shiki',
  lineNumbers: true,
  transition: 'slide',
  fonts: {
    sans: '"Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  }
};

const THEMES = ['default', 'seriph', 'apple-basic', 'cb', 'github', 'shibainu', 'simula', 'dracula'];

function generateSlidevFrontmatter(config) {
  return `---
theme: ${config.theme}
highlighter: ${config.highlighter}
lineNumbers: ${config.lineNumbers}
drawings:
  persist: true
editor: false
transition: ${config.transition}
title: ${config.title}
mdc: true
download: true
info: true
canCopy: true
transitionSlide: true
mouseWheel: true
fonts:
  sans: ["Microsoft YaHei", "微软雅黑", "sans-serif"]
  serif: ["Microsoft YaHei", "微软雅黑", "sans-serif"]
  mono: ["Consolas", "Monaco", "Courier New", "monospace"]
---

`;
}

function processSpeakerNotes(content) {
  return content.replace(/^Note:\s*(.+)$/gm, '<Note>\n  $1\n</Note>');
}

function processFragments(content) {
  let processed = content;
  processed = processed.replace(/^(\s*)[-*]\s+(.+)$/gm, '$1- $2 <!-- v-click -->');
  processed = processed.replace(/^(\s*)\d+\.\s+(.+)$/gm, '$1- $2 <!-- v-click -->');
  return processed;
}

function enhanceMarkdownForSlidev(content) {
  let enhanced = content;
  enhanced = processFragments(enhanced);
  enhanced = processSpeakerNotes(enhanced);
  return enhanced;
}

function generateSlidevStyles() {
  return `
/* Chinese Font Optimization - Microsoft YaHei Black Bold */
* {
  font-family: "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  font-weight: 900 !important;
}

h1, h2, h3, h4, h5, h6 {
  font-weight: 900 !important;
  text-align: left !important;
}

p, li, td, th, span, div {
  font-family: "Microsoft YaHei", "微软雅黑", -apple-system, BlinkMacSystemFont, sans-serif !important;
  font-weight: 900 !important;
  text-align: left !important;
}

.slide-content {
  text-align: left !important;
  max-height: 90vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 20px;
}

ul, ol {
  text-align: left !important;
  margin-left: 40px !important;
}

li {
  text-align: left !important;
  margin-bottom: 8px !important;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 15px 0;
  text-align: left !important;
}

th, td {
  padding: 12px 15px;
  text-align: left !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

th {
  background: rgba(99, 102, 241, 0.1);
  font-weight: 900 !important;
}

pre {
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  margin: 15px 0;
  text-align: left !important;
}

code {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
}

p code, li code {
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 6px;
  border-radius: 4px;
}

blockquote {
  border-left: 4px solid #6366f1;
  padding-left: 20px;
  margin: 15px 0;
  font-style: italic;
  color: rgba(0, 0, 0, 0.8);
  text-align: left !important;
}

/* Scrollbar styling */
.slide-content::-webkit-scrollbar {
  width: 8px;
}

.slide-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.slide-content::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.3);
  border-radius: 4px;
}

.slide-content::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.5);
}

/* ========================================
   Two-column layout (for TOC, lists, etc.)
   ======================================== */

.slide-content:deep(.two-cols) {
  display: grid !important;
  grid-template-columns: 1fr 1fr !important;
  gap: 1.5rem !important;
  align-items: start !important;
  padding: 0.5rem 1.5rem !important;
}

/* Title spans full width in two-column layout */
.slide-content:deep(.two-cols) > h2,
.slide-content:deep(.two-cols) > h3,
.slide-content:deep(.two-cols) > h4 {
  grid-column: 1 / -1 !important;
  font-size: 1.8rem !important;
  margin-bottom: 0.5rem !important;
  margin-top: 0 !important;
}

.slide-content:deep(.two-cols) ul,
.slide-content:deep(.two-cols) ol {
  margin: 0 !important;
  padding-left: 0.8rem !important;
}

.slide-content:deep(.two-cols) li {
  margin-bottom: 0.25rem !important;
  line-height: 1.2 !important;
}

/* Sub-items tighter */
.slide-content:deep(.two-cols) li li {
  margin-bottom: 0.15rem !important;
  font-size: 0.9em !important;
}

/* ========================================
   Compact font variant (for dense content)
   ======================================== */

.slide-content:deep(.font-compact) {
  font-size: 0.85em !important;
}

.slide-content:deep(.font-compact) li {
  margin-bottom: 0.2rem !important;
  line-height: 1.15 !important;
}

.slide-content:deep(.font-compact) p {
  margin-bottom: 0.5rem !important;
  line-height: 1.15 !important;
}

/* ========================================
   Scroll-enabled variant (for long content)
   ======================================== */

.slide-content:deep(.scroll-enabled) {
  max-height: 85vh !important;
  overflow-y: auto !important;
}

.slide-content:deep(.scroll-enabled)::-webkit-scrollbar {
  width: 10px !important;
}

.slide-content:deep(.scroll-enabled)::-webkit-scrollbar-thumb {
  background: rgba(99, 102, 241, 0.4) !important;
  border-radius: 5px !important;
}

.slide-content:deep(.scroll-enabled)::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 102, 241, 0.6) !important;
}

/* ========================================
   TOC-specific optimizations
   ======================================== */

/* Make TOC titles smaller */
.slide-content:deep(.two-cols) h2 {
  font-size: 1.5rem !important;
  margin-bottom: 0.3rem !important;
}

/* Aggressive TOC spacing for very dense content */
.slide-content:deep(.two-cols) ul,
.slide-content:deep(.two-cols) ol {
  font-size: 0.8em !important;
  padding-left: 0.6rem !important;
}

.slide-content:deep(.two-cols) li {
  margin-bottom: 0.15rem !important;
  line-height: 1.1 !important;
}

/* Sub-items even tighter */
.slide-content:deep(.two-cols) li li {
  margin-bottom: 0.1rem !important;
  font-size: 0.85em !important;
  line-height: 1.1 !important;
}

/* Reduce column gap for TOC */
.slide-content:deep(.two-cols) {
  gap: 0.8rem !important;
  padding: 0.3rem 1rem !important;
}
`;
}

async function build(inputPath, outputPath, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  // Resolve paths - handle both relative and absolute paths
  const scriptDir = __dirname;
  const baseDir = path.dirname(path.dirname(path.dirname(scriptDir)));

  let resolvedInputPath, resolvedOutputPath;
  if (path.isAbsolute(inputPath)) {
    resolvedInputPath = inputPath;
  } else {
    resolvedInputPath = path.resolve(baseDir, inputPath);
  }

  if (path.isAbsolute(outputPath)) {
    resolvedOutputPath = outputPath;
  } else {
    resolvedOutputPath = path.resolve(baseDir, outputPath);
  }

  console.log(`🎨 Building with Slidev...`);
  console.log(`📄 Input: ${resolvedInputPath}`);
  console.log(`📄 Output: ${resolvedOutputPath}`);
  console.log(`🎨 Theme: ${finalConfig.theme}`);

  const markdown = fs.readFileSync(resolvedInputPath, 'utf-8');

  // For Slidev, content scrolling handles long slides naturally
  const processedMarkdown = markdown;

  const enhancedMarkdown = enhanceMarkdownForSlidev(processedMarkdown);
  const frontmatter = generateSlidevFrontmatter(finalConfig);
  const slidevMarkdown = frontmatter + enhancedMarkdown;

  const tempDir = path.join(process.cwd(), '.slidev-temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const slidesPath = path.join(tempDir, 'slides.md');
  fs.writeFileSync(slidesPath, slidevMarkdown, 'utf-8');

  const stylePath = path.join(tempDir, 'style.css');
  fs.writeFileSync(stylePath, generateSlidevStyles(), 'utf-8');

  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log(`🔨 Running Slidev build...`);
    // Use local slidev binary to avoid version conflicts
    const slidevBin = path.join(__dirname, '../node_modules/@slidev/cli/bin/slidev.mjs');
    const slidevCmd = fs.existsSync(slidevBin) ? `node ${slidevBin}` : `npx @slidev/cli@0.49.29`;
    // Build with download enabled for PDF export
    // Use absolute path for tempDir to avoid cwd issues
    const absTempDir = path.resolve(tempDir);
// NOTE: Removed --emptyOutDir as it is not supported in newer @slidev/cli versions
    const cmd = `yes '' | THEME_ROOT=${projectRoot}/node_modules ${slidevCmd} build ${slidesPath} --out ${outputDir}`;
    console.log(`[DEBUG] Slidev build command: ${cmd}`);
    console.log(`[DEBUG] tempDir: ${absTempDir}`);
    console.log(`[DEBUG] outputDir: ${outputDir}`);

    const startTime = Date.now();
    execSync(cmd, {
      stdio: 'inherit',
      cwd: absTempDir,
      shell: '/bin/bash',
      env: {
        ...process.env,
        THEME_ROOT: path.join(projectRoot, 'node_modules')
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[DEBUG] Build elapsed: ${elapsed}ms`);

    console.log('✅ Built with Slidev');
    console.log(`📄 Output: ${resolvedOutputPath}`);
    console.log(`🎨 Theme: ${finalConfig.theme}`);

    console.log(`✅ Built with Slidev`);
    console.log(`📄 Output: ${resolvedOutputPath}`);
    console.log(`🎨 Theme: ${finalConfig.theme}`);

    // Copy Slidev's index.html to the final output path
    const slidevIndexHtml = path.join(outputDir, 'index.html');
    if (fs.existsSync(slidevIndexHtml)) {
      let content = fs.readFileSync(slidevIndexHtml, 'utf-8');

      // Fix asset paths - use generic prefix
      content = content.replace(/href="\/assets\//g, 'href="./assets/');
      content = content.replace(/src="\/assets\//g, 'src="./assets/');

      // Inject custom styles for better content display and toolbar
      const customStyles = generateSlidevStyles();
      content = content.replace('</head>', `  <style>${customStyles}</style>\n</head>`);

      fs.writeFileSync(resolvedOutputPath, content);
      console.log(`✅ Copied, fixed asset paths, and injected styles: ${resolvedOutputPath}`);
    }

    fs.rmSync(tempDir, { recursive: true, force: true });

  } catch (error) {
    console.error(`❌ Slidev build failed:`, error.message);
    console.error(`📁 Temp directory preserved at: ${tempDir}`);
    process.exit(1);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const inputPath = args[0];
  const outputPath = args[1] || path.join('dist', 'index.html');

  const config = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) {
      config.title = args[++i];
    } else if (args[i] === '--theme' && args[i + 1]) {
      config.theme = args[++i];
    }
  }

  build(inputPath, outputPath, config);
}

module.exports = {
  build,
  enhanceMarkdownForSlidev,
  generateSlidevFrontmatter,
  DEFAULT_CONFIG,
  THEMES
};

#!/usr/bin/env node

/**
 * HTML Presentation Builder
 * Multi-framework presentation builder (Reveal.js + Slidev)
 * @version 3.1.0 - Dev mode support + Vue examples
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { build: buildReveal } = require('./build-reveal');
const { build: buildSlidev } = require('./build-slidev');

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_CONFIG = {
  mode: 'dev',  // 'dev' or 'build' - DEFAULT: dev (full toolbar)
  framework: 'slidev',
  title: 'Presentation',
  theme: 'seriph',  // Built-in theme, no install required
  highlightTheme: 'monokai',
  transition: 'slide',
  sidebar: true,
  export: true,
  autoAnimate: true,
  mouseWheel: true,
  previewLinks: true,
  codeLineNumbers: true,
  lineNumbers: true,
  port: 3030,
  host: '0.0.0.0',  // Allow network access
  optimize: false,  // Enable content optimization
  optimizeLevel: 'basic'  // 'basic' or 'full'
};

const REVEAL_THEMES = ['black', 'white', 'league', 'beige', 'night', 'dracula', 'solarized'];
const SLIDEV_THEMES = ['default', 'seriph', 'apple-basic', 'cb', 'github', 'shibainu', 'simula', 'dracula'];

const HIGHLIGHT_THEMES = [
  'atom-one-dark', 'atom-one-light', 'github', 'github-dark', 'monokai',
  'moon', 'nord', 'obsidian', 'solarized-dark', 'solarized-light', 'tomorrow'
];

// ============================================================================
// MAIN BUILD FUNCTION
// ============================================================================

async function startDevMode(inputPath, config) {
  const scriptDir = __dirname;
  const baseDir = path.dirname(path.dirname(path.dirname(scriptDir)));

  let resolvedInputPath;
  if (path.isAbsolute(inputPath)) {
    resolvedInputPath = inputPath;
  } else {
    resolvedInputPath = path.resolve(baseDir, inputPath);
  }

  // Get local IP address for network access
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        localIP = net.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }

  console.log(`🚀 Starting Slidev Dev Mode...`);
  console.log(`📄 Input: ${resolvedInputPath}`);
  console.log(`🎨 Theme: ${config.theme}`);
  console.log(`🌐 Port: ${config.port}`);
  console.log(`🌍 Network access: ENABLED (${config.host})`);
  console.log(`\n✨ Features enabled:`);
  console.log(`  ✅ Drawing/annotation tools (press 'd')`);
  console.log(`  ✅ Presenter view (press 'p')`);
  console.log(`  ✅ Slide overview (press 'o')`);
  console.log(`  ✅ Fullscreen (press 'f')`);
  console.log(`  ✅ Camera (press 'c')`);
  console.log(`  ✅ Speaker notes (press 's')`);
  console.log(`  ✅ Live reload on file changes`);
  console.log(`  ✅ Vue 组件交互`);
  console.log(`\n🌐 Access URLs:`);
  console.log(`  Local:   http://localhost:${config.port}`);
  console.log(`  Network: http://${localIP}:${config.port}`);
  console.log(`🛑 Press Ctrl+C to stop\n`);

  // Clear proxy for Slidev
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;

  // Optimize content if requested
  let inputForBuild = resolvedInputPath;
  let optimizedTempPath = null;
  if (config.optimize) {
    console.log(`\n🤖 Optimizing content (level: ${config.optimizeLevel})...`);
    const { PresentationOptimizer } = require('./optimizer');
    const optimizer = new PresentationOptimizer(resolvedInputPath, {
      optimizationLevel: config.optimizeLevel,
      enableOptimization: true
    });

    try {
      const optimized = await optimizer.optimize();
      // Write to temporary file
      optimizedTempPath = path.join(process.cwd(), '.slidev-optimized.md');
      fs.writeFileSync(optimizedTempPath, optimized);
      inputForBuild = optimizedTempPath;
      console.log(`✅ Optimization complete\n`);
    } catch (err) {
      console.warn(`⚠️  Optimization failed: ${err.message}`);
      console.warn(`📄 Using original content\n`);
    }
  }

  // Generate Slidev markdown first
  const { generateSlidevMarkdown: generateSlidevMd } = require('./slidev-generator');
  const tempPath = path.join(process.cwd(), '.slidev-temp-dev.md');
  await generateSlidevMd(inputForBuild, tempPath, { optimizeSlides: true });

  const slidevBin = path.join(__dirname, '../node_modules/@slidev/cli/bin/slidev.mjs');
  const useNpx = !fs.existsSync(slidevBin);

  const args = [
    tempPath,
    '--port', config.port.toString(),
    '--remote', 'slidev'  // Enable remote mode to listen on 0.0.0.0
  ];

  const cmd = useNpx ? 'npx' : 'node';
  const cmdArgs = useNpx ? ['@slidev/cli@0.49.29', ...args] : [slidevBin, ...args];

  // Set environment for network access
  const spawnOptions = {
    stdio: ['inherit', 'inherit', 'inherit'],
    shell: false,
    env: { ...process.env }
  };

  // Spawn Slidev directly
  const slidev = spawn(cmd, cmdArgs, spawnOptions);

  // Clean up temp files on exit
  const cleanup = () => {
    const filesToClean = [tempPath];
    if (optimizedTempPath) {
      filesToClean.push(optimizedTempPath);
    }
    for (const file of filesToClean) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  };

  slidev.on('close', cleanup);
  slidev.on('error', (err) => {
    cleanup();
    console.error(`❌ Failed to start Slidev: ${err.message}`);
    process.exit(1);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
}

async function build(inputPath, outputPath, config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  console.log(`🎨 HTML Presentation Builder v3.1.0`);
  console.log(`📄 Mode: ${finalConfig.mode.toUpperCase()}`);
  console.log(`📄 Framework: ${finalConfig.framework.toUpperCase()}`);

  // Dev mode: start live server
  if (finalConfig.mode === 'dev' && finalConfig.framework === 'slidev') {
    await startDevMode(inputPath, finalConfig);
    return;
  }

  // Build mode: generate static files
  if (finalConfig.framework === 'slidev') {
    // First, use slidev-generator to process and optimize slides
    console.log(`\n📝 Processing slides with LLM optimization...`);
    const { generateSlidevMarkdown: generateSlidevMd } = require('./slidev-generator');

    // Generate to temp file with LLM optimization
    const tempOptimizedPath = path.join(process.cwd(), '.slidev-optimized.md');
    await generateSlidevMd(inputPath, tempOptimizedPath, { optimizeSlides: true });

    // Use the optimized markdown for build
    inputForBuild = tempOptimizedPath;

    // Use Slidev builder
    const slidevConfig = {
      title: finalConfig.title,
      theme: finalConfig.theme,
      highlighter: 'shiki',
      lineNumbers: finalConfig.lineNumbers,
      transition: finalConfig.transition
    };
    await buildSlidev(inputForBuild, outputPath, slidevConfig);
  } else {
    // Use Reveal.js builder (default)
    const revealConfig = {
      title: finalConfig.title,
      theme: finalConfig.theme,
      highlightTheme: finalConfig.highlightTheme || finalConfig.theme,
      transition: finalConfig.transition,
      sidebar: finalConfig.sidebar,
      export: finalConfig.export,
      autoAnimate: finalConfig.autoAnimate,
      mouseWheel: finalConfig.mouseWheel,
      previewLinks: finalConfig.previewLinks,
      codeLineNumbers: finalConfig.codeLineNumbers
    };
    buildReveal(inputPath, outputPath, revealConfig);
  }
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
HTML Presentation Builder v3.2.0
Multi-framework presentation builder (Reveal.js + Slidev)
DEFAULT MODE: DEV (Slidev with full toolbar)

Usage:
  node build.js <input.md> [output.html] [options]

Arguments:
  input.md       Path to markdown file containing slides
  output.html    Path to output HTML file (only for build mode)

Mode Options:
  --mode <name>         Mode: dev (default) or build
                         dev: Live server with full toolbar
                         build: Static HTML output

Framework Options:
  --framework <name>    Framework to use: slidev (default) or reveal

Content Optimization:
  --optimize            Enable content optimization (default: disabled)
  --optimize-level <n>  Optimization level: basic (default) or full
                         basic: Code enhancement without LLM
                         full:  LLM-powered content optimization
                         Requires ANTHROPIC_API_KEY for 'full' level

Theme Options:
  --theme <name>        Theme for the selected framework
                         Reveal.js: ${REVEAL_THEMES.join(', ')}
                         Slidev: ${SLIDEV_THEMES.join(', ')}

  --highlight <theme>   Code highlighting theme (Reveal.js only)
                         ${HIGHLIGHT_THEMES.join(', ')}

Display Options:
  --no-sidebar          Disable sidebar navigation (Reveal.js only)
  --no-export           Disable PPTX export button (Reveal.js only)
  --no-auto-animate     Disable auto-animate transitions (Reveal.js only)
  --no-mouse-wheel      Disable mouse wheel navigation (Reveal.js only)
  --no-line-numbers     Disable code line numbers

Dev Mode Options:
  --port <number>       Port for dev server (default: 3030)
  --host <address>      Host for dev server (default: 0.0.0.0 for network access)

Examples:
  # Start dev mode (default) - full toolbar with drawing, presenter view
  node build.js slides.md

  # Build static HTML
  node build.js slides.md output.html --mode build

  # Build with Reveal.js
  node build.js slides.md output.html --framework reveal --mode build

  # Dev mode with content optimization (basic)
  node build.js slides.md --optimize

  # Build with LLM-powered optimization (requires API key)
  node build.js slides.md output.html --mode build --optimize --optimize-level full

  # Dev mode with custom port
  node build.js slides.md --port 8080

Mode Comparison:

  DEV MODE (Default):
    ✅ Drawing/annotation tools (press 'd')
    ✅ Presenter view (press 'p')
    ✅ Slide overview (press 'o')
    ✅ Fullscreen (press 'f')
    ✅ Camera (press 'c')
    ✅ Speaker notes (press 's')
    ✅ Live reload on file changes
    ✅ Content scrolling support
    ❌ Requires running server
    ⚠️  For: Live presentations, demos

  BUILD MODE:
    ✅ Static HTML file
    ✅ Easy deployment (GitHub Pages, S3)
    ✅ Content scrolling support
    ✅ PDF export
    ❌ Limited toolbar (no drawing)
    ⚠️  For: Static hosting, sharing

Framework Comparison:

  Slidev (Default):
    ✅ Dev mode with full toolbar
    ✅ Developer-friendly (Vue.js)
    ✅ Live coding support
    ✅ Built-in LaTeX support
    ✅ Mermaid diagram support
    ✅ Better for code-heavy presentations

  Reveal.js:
    ✅ Mature and stable
    ✅ PPTX export support
    ✅ Advanced animations (auto-animate)
    ✅ Resizable sidebar navigation
    ✅ Better for visual-heavy presentations
    ❌ No dev mode (build only)

Optimization Levels:

  BASIC (default with --optimize):
    ✅ Code syntax highlighting
    ✅ Automatic line highlighting (functions, returns, control flow)
    ✅ Code complexity analysis
    ✅ No API key required
    ❌ No content restructuring

  FULL (--optimize-level full):
    ✅ All basic features
    ✅ LLM-powered content optimization
    ✅ Title simplification
    ✅ Key point extraction
    ✅ Visual element suggestions
    ⚠️  Requires ANTHROPIC_API_KEY

Features (both frameworks):
  - Microsoft YaHei (微软雅黑) Black Bold font
  - Bold titles with left alignment
  - Content scrolling for long slides
  - Speaker notes support (Note: syntax)

Speaker Notes (Dev mode only):
  Add "Note: Your notes here" after any slide content.
  Press 's' to view speaker notes.
    `);
    process.exit(0);
  }

  const inputPath = args[0];
  const outputPath = args[1] || path.join('dist', 'index.html');

  // Parse options
  const config = {};
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      config.mode = args[++i];
    } else if (args[i] === '--framework' && args[i + 1]) {
      config.framework = args[++i];
    } else if (args[i] === '--title' && args[i + 1]) {
      config.title = args[++i];
    } else if (args[i] === '--theme' && args[i + 1]) {
      config.theme = args[++i];
    } else if (args[i] === '--highlight' && args[i + 1]) {
      config.highlightTheme = args[++i];
    } else if (args[i] === '--port' && args[i + 1]) {
      config.port = parseInt(args[++i]);
    } else if (args[i] === '--host' && args[i + 1]) {
      config.host = args[++i];
    } else if (args[i] === '--optimize') {
      config.optimize = true;
    } else if (args[i] === '--optimize-level' && args[i + 1]) {
      config.optimizeLevel = args[++i];
    } else if (args[i] === '--no-sidebar') {
      config.sidebar = false;
    } else if (args[i] === '--no-export') {
      config.export = false;
    } else if (args[i] === '--no-auto-animate') {
      config.autoAnimate = false;
    } else if (args[i] === '--no-mouse-wheel') {
      config.mouseWheel = false;
    } else if (args[i] === '--no-line-numbers') {
      config.codeLineNumbers = false;
      config.lineNumbers = false;
    }
  }

  build(inputPath, outputPath, config).catch(err => {
    console.error(`❌ Build failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { build, DEFAULT_CONFIG, REVEAL_THEMES, SLIDEV_THEMES };

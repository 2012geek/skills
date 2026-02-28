# HTML Presentation Skill v2.0

> **Status:** ✅ Production Ready - Verification System Complete

A production-grade presentation system with LLM-powered quality assurance, automatic slide optimization, and intelligent caching.

## What's New in v2.0

### 🎯 Verification System
- **Automatic Quality Assurance:** LLM-based slide quality judgment (0-100 scoring)
- **Intelligent Auto-Fix:** Up to 3 automatic iterations to fix layout issues
- **Loop Detection:** Prevents infinite fix cycles with hash-based tracking
- **Human Intervention:** Interactive prompts when auto-fix fails

### ⚡ Performance
- **Three-Layer Caching:** L1 (memory) → L2 (disk) → L3 (semantic)
- **Cache Statistics:** Real-time hit rate monitoring
- **Automatic Promotion:** Fast access to frequently used content

### 🛠️ Enhanced CLI
- `--verify`: Enable LLM verification
- `--interactive`: Human intervention mode
- `--threshold`: Set quality threshold (0-100)
- `--max-iterations`: Control auto-fix attempts

## Quick Start

```bash
# Install dependencies
npm install

# Set Anthropic API key (required for verification)
export ANTHROPIC_API_KEY="your-api-key"

# Generate presentation (basic)
node cli.js generate slides.md --theme seriph

# Generate with verification
node cli.js generate slides.md --verify --threshold 85

# Generate with interactive mode
node cli.js generate slides.md --verify --interactive

# Run tests
npm test
```

## Features

### 1. Basic Generation

```bash
# Generate presentation (no verification)
node cli.js generate input.md -o output.slides.md --theme seriph
```

### 2. Verification Mode

```bash
# Enable automatic quality verification
node cli.js generate input.md --verify

# Set custom quality threshold
node cli.js generate input.md --verify --threshold 90

# Control max auto-fix iterations
node cli.js generate input.md --verify --max-iterations 5
```

### 3. Interactive Mode

```bash
# Enable human intervention when auto-fix fails
node cli.js generate input.md --verify --interactive

# You'll be prompted to:
# 1. Skip (use current version)
# 2. Edit manually (opens editor)
# 3. View screenshots (opens images)
# 4. Try specific layout
# 5. Defer (mark as known issue)
```

### 4. Other Commands

```bash
# Analyze markdown content
node cli.js analyze input.md

# Get theme recommendations
node cli.js recommend input.md

# Start live preview
node cli.js preview input.md --port 3030

# Export to PDF/HTML/screenshots
node cli.js export input.md -f pdf -o output.pdf
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     CLI Layer                       │
│  (generate, analyze, recommend, preview, export)    │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                  Verification Layer                  │
│  (VerifyFixLoop, AttemptHistory, HumanIntervention) │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                   Content Layer                     │
│  (Analyzer, Layout Engine, Theme Manager,           │
│   Slide Generator, Asset Processor)                 │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│                   Cache Layer                       │
│  (L1 Memory, L2 Disk, L3 Semantic)                 │
└─────────────────────────────────────────────────────┘
```

## API Usage

### Basic Usage

```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator();

const result = await generator.generate('slides.md', {
  theme: 'seriph',
  title: 'My Presentation',
  author: 'Author Name'
});

console.log(`Generated ${result.stats.totalSlides} slides`);
```

### With Verification

```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator({
  verifyEnabled: true,
  threshold: 85,
  maxIterations: 3,
  interactive: false
});

const result = await generator.generate('slides.md', {
  theme: 'seriph'
});

console.log(`Verified: ${result.stats.verifiedSlides}`);
console.log(`Skipped: ${result.stats.skippedSlides}`);

// Clean up resources
await generator.close();
```

### With Human Intervention

```javascript
const generator = new SlideGenerator({
  verifyEnabled: true,
  interactive: true  // Prompt user on failures
});

const result = await generator.generate('slides.md');

// User will be interactively prompted when auto-fix fails

await generator.close();
```

### Using Cache Manager

```javascript
const { CacheManager } = require('./html-presentation');

const cache = new CacheManager({
  l1Max: 100,
  l1TTL: 60000,        // 1 minute
  cacheDir: '/tmp/cache',
  l2TTL: 3600000,      // 1 hour
  similarityThreshold: 0.85
});

// Use cache
await cache.set('key', { data: 'value' });
const result = await cache.get('key');

// View statistics
cache.printStats();

// Clean up
await cache.clear();
```

## Migration from v1.x

See [MIGRATION.md](MIGRATION.md) for detailed migration guide.

**Key Changes:**
- Verification is now opt-in (disabled by default)
- Anthropic API key required for verification
- Call `close()` when using verification
- New CLI options: `--verify`, `--interactive`, `--threshold`, `--max-iterations`

## Configuration

### Environment Variables

```bash
# Anthropic API key (required for verification)
export ANTHROPIC_API_KEY="sk-ant-..."

# Optional: Verification settings
export VERIFY_ENABLED=true
export VERIFY_THRESHOLD=85
export VERIFY_MAX_ITERATIONS=3
```

### Configuration File

Create `config.json`:

```json
{
  "anthropic": {
    "apiKey": "sk-ant-..."
  },
  "verification": {
    "enabled": true,
    "threshold": 85,
    "maxIterations": 3,
    "interactive": false
  },
  "cache": {
    "l1Max": 100,
    "l1TTL": 60000,
    "l2TTL": 3600000,
    "similarityThreshold": 0.85
  }
}
```

## Development Status

### ✅ Phase 1: Foundation (COMPLETE)
- Core utilities (Logger, PlatformDetector, HealthChecker, ErrorHandler)
- Test infrastructure with Jest
- CI/CD pipeline with GitHub Actions

### ✅ Phase 2: Content Processing (COMPLETE)
- Content Analyzer for parsing and classifying markdown
- Layout Engine for smart layout selection
- Theme Manager for community theme recommendations
- Slide Generator for creating Slidev presentations
- Asset Processor for handling images
- CLI interface for easy usage

### ✅ Phase 3: Preview System (COMPLETE)
- File Watcher with debouncing
- Preview Manager with browser automation
- Export Manager (PDF, HTML, screenshots)
- CLI preview and export commands
- Live reload support

### ✅ Phase 4: Verification System (COMPLETE)
- VerifyFixLoop with auto-fix and loop detection
- AttemptHistory for tracking fix attempts
- LLMJudge with buffer-based evaluation
- LLMFixer for automatic markdown fixing
- HumanIntervention for interactive failure handling
- Three-layer caching system (L1/L2/L3)
- Terminal utilities for CLI interaction

## Testing

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

**Test Coverage:**
- VerifyFixLoop: 13 tests passing
- CacheManager: 20 tests passing
- Overall: 110+ tests passing

## Documentation

- [Migration Guide](MIGRATION.md) - Migrating from v1.x to v2.0
- [Changelog](CHANGELOG.md) - Version history and changes
- [Implementation Plan](docs/plans/2026-02-26-html-presentation-v2-implementation.md) - Technical design

## Performance

### Without Verification
- **Speed:** ~1-2 seconds per presentation
- **Use case:** Rapid prototyping

### With Verification
- **First time:** ~5-10 seconds per slide
- **Cached:** ~1-2 seconds per slide
- **Use case:** Production presentations

### Cache Performance
- Target hit rate: >85%
- Typical hit rate: 90-95%
- L1 hit rate: 60-70%
- L2 hit rate: 20-30%
- L3 hit rate: 5-10%

## License

MIT

# HTML-Presentation v2.0 Migration Guide

## Overview

HTML-Presentation v2.0 introduces a revolutionary verification system with LLM-powered quality assurance and automatic slide optimization. This guide helps you migrate from v1.x to v2.0.

## What's New in v2.0

### Core Features

1. **Verify-Fix Loop System**
   - Automatic slide quality verification using Claude vision
   - Intelligent fix suggestions based on LLM analysis
   - Loop detection to prevent infinite fix cycles
   - Configurable quality thresholds and iteration limits

2. **Human Intervention Manager**
   - Interactive prompts when auto-fix fails
   - Manual editing capabilities
   - Screenshot viewing for visual debugging
   - Layout override options
   - Defer mechanism for known issues

3. **Three-Layer Caching**
   - L1: In-memory LRU cache (fastest)
   - L2: Disk cache (persistent)
   - L3: Semantic cache (similarity matching)
   - Automatic cache promotion between layers

4. **Enhanced CLI**
   - `--verify` flag to enable verification
   - `--interactive` flag for human intervention
   - `--threshold` to set quality threshold (0-100)
   - `--max-iterations` to control auto-fix attempts

## Breaking Changes

### Configuration

**v1.x:**
```javascript
const generator = new SlideGenerator({
  theme: 'seriph',
  title: 'My Presentation'
});
```

**v2.0:**
```javascript
const generator = new SlideGenerator({
  theme: 'seriph',
  title: 'My Presentation',
  verifyEnabled: false, // NEW: opt-in to verification
  interactive: false,    // NEW: opt-in to human intervention
  threshold: 80,         // NEW: quality threshold
  maxIterations: 3       // NEW: max auto-fix attempts
});
```

### Environment Variables

**New Required for Verification:**
```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

## Migration Steps

### Step 1: Update Dependencies

```bash
cd html-presentation
npm install
```

New dependencies:
- `@anthropic-ai/sdk` - Claude API client
- `puppeteer` - Browser automation
- `open` - File viewing utility

### Step 2: Update API Usage

**Before (v1.x):**
```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator();
const result = await generator.generate('slides.md');
```

**After (v2.0 - Basic):**
```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator({
  verifyEnabled: false // Disable verification for v1.x behavior
});

const result = await generator.generate('slides.md');

// NEW: Clean up resources
await generator.close();
```

**After (v2.0 - With Verification):**
```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator({
  verifyEnabled: true,  // Enable verification
  threshold: 80,        // Quality threshold
  maxIterations: 3,     // Max auto-fix attempts
  interactive: false    // No human intervention
});

const result = await generator.generate('slides.md');

console.log(`Generated ${result.stats.totalSlides} slides`);
console.log(`Verified: ${result.stats.verifiedSlides}`);
console.log(`Skipped: ${result.stats.skippedSlides}`);

await generator.close();
```

**After (v2.0 - Interactive Mode):**
```javascript
const { SlideGenerator } = require('./html-presentation');

const generator = new SlideGenerator({
  verifyEnabled: true,
  interactive: true,   // Enable human intervention
  threshold: 80,
  maxIterations: 3
});

const result = await generator.generate('slides.md');

// When auto-fix fails, you'll be prompted to:
// 1. Skip (use current version)
// 2. Edit manually (opens editor)
// 3. View screenshots (opens images)
// 4. Try specific layout
// 5. Defer (mark as known issue)

await generator.close();
```

### Step 3: Update CLI Usage

**Before (v1.x):**
```bash
node cli.js generate slides.md --theme seriph
```

**After (v2.0 - Basic):**
```bash
# Same as v1.x (verification off by default)
node cli.js generate slides.md --theme seriph

# Enable verification
node cli.js generate slides.md --verify --threshold 85

# Interactive mode
node cli.js generate slides.md --verify --interactive

# Full options
node cli.js generate slides.md \
  --verify \
  --interactive \
  --threshold 85 \
  --max-iterations 5 \
  --theme seriph
```

## API Changes

### SlideGenerator

**New Options:**
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verifyEnabled` | boolean | false | Enable LLM verification |
| `interactive` | boolean | false | Enable human intervention |
| `threshold` | number | 80 | Quality threshold (0-100) |
| `maxIterations` | number | 3 | Max auto-fix iterations |
| `apiKey` | string | env var | Anthropic API key |

**New Methods:**
- `close()` - Clean up resources (required when verification enabled)

**New Return Properties:**
```javascript
{
  success: true,
  outputPath: './slides.md',
  stats: {
    totalSlides: 10,
    verifiedSlides: 8,    // NEW
    skippedSlides: 1      // NEW
  }
}
```

## Using the Cache System

### Programmatic Usage

```javascript
const { CacheManager } = require('./html-presentation');

const cache = new CacheManager({
  l1Max: 100,           // L1 cache size
  l1TTL: 60000,         // L1 TTL (1 minute)
  cacheDir: '/tmp/cache', // L2 cache directory
  l2TTL: 3600000,       // L2 TTL (1 hour)
  similarityThreshold: 0.85 // L3 similarity threshold
});

// Use cache
await cache.set('key', { data: 'value' });
const result = await cache.get('key');

// View statistics
cache.printStats();

// Clean up
await cache.clear();
```

## Troubleshooting

### Issue: "ANTHROPIC_API_KEY not set"

**Solution:** Set the environment variable:
```bash
export ANTHROPIC_API_KEY="your-key-here"
```

### Issue: Verification is slow

**Solution:**
1. Enable caching (automatic)
2. Reduce `--max-iterations`
3. Increase `--threshold` to reduce fixes

### Issue: Auto-fix creates infinite loop

**Solution:** The system detects loops automatically. If you see "Fix loop detected":
1. Use `--interactive` mode
2. Choose "Skip" or "Edit manually"
3. Report the issue for improvement

### Issue: Screenshot files accumulating

**Solution:** Clean up temporary screenshots:
```bash
rm -f slide-*-attempt-*.png
```

## Best Practices

### 1. Enable Verification Selectively

```bash
# For development (fast)
node cli.js generate slides.md

# For production (quality)
node cli.js generate slides.md --verify --threshold 85
```

### 2. Use Interactive Mode for Critical Slides

```bash
# Review problematic slides manually
node cli.js generate slides.md --verify --interactive
```

### 3. Monitor Cache Performance

```javascript
cache.printStats();
// Look for hit rate > 85%
```

### 4. Clean Up Resources

Always call `close()` when using verification:
```javascript
try {
  const result = await generator.generate('slides.md');
} finally {
  await generator.close();
}
```

## Performance Considerations

### Without Verification
- **Speed:** ~1-2 seconds per presentation
- **Quality:** Depends on manual review
- **Use case:** Rapid prototyping

### With Verification
- **Speed:** ~5-10 seconds per slide (first time)
- **Quality:** Automatically verified
- **Use case:** Production presentations

### With Caching
- **Speed:** ~1-2 seconds per slide (cached)
- **Quality:** Automatically verified
- **Use case:** Iterative development

## Rollback Plan

If you need to rollback to v1.x:

```bash
# Uninstall v2.0
npm uninstall html-presentation

# Install v1.x
npm install html-presentation@1.x

# Update your code to remove v2.0 options
```

## Support

For issues or questions:
1. Check this migration guide
2. Review the README.md
3. Check existing GitHub issues
4. Create a new issue with details

## Changelog

See CHANGELOG.md for detailed version history.

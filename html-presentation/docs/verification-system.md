# Slide Verification System

## Overview

The verification system automatically detects and fixes slide overflow issues using real-time rendering and LLM judgment.

## How It Works

1. **Generate** slide markdown
2. **Render** with temporary Slidev server
3. **Capture** screenshot with Puppeteer
4. **Judge** aesthetic quality with LLM (0-100 score)
5. **Fix** if score < 80 or overflow detected
6. **Repeat** up to 3 iterations

## Usage

### Basic Usage

```bash
# Enable verification
node build.js slides.md output.html --mode build --verify
```

### Disable Verification

```bash
# Using CLI flag
node build.js slides.md output.html --mode build --no-verify

# Using environment variable
VERIFY_ENABLED=false node build.js slides.md output.html --mode build --verify
```

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| VERIFY_ENABLED | true | Enable/disable verification |
| VERIFY_MAX_ITERATIONS | 3 | Maximum fix attempts per slide |
| VERIFY_SCORE_THRESHOLD | 80 | Minimum aesthetic score (0-100) |
| VERIFY_TIMEOUT | 15000 | API timeout in milliseconds |

### Debug Tools

```bash
# Verify specific slide
node scripts/verify-debug.js slides.md 3
```

Output: Screenshot saved to `debug-slide-3.png`

## Troubleshooting

**Verification slow?**
- Use `--no-verify` to disable
- Reduce `VERIFY_MAX_ITERATIONS` to 1 or 2

**Server fails to start?**
- Increase `VERIFY_TIMEOUT`
- Check port availability (3031-3040)

**LLM errors?**
- Verify `ANTHROPIC_API_KEY` is set
- Check API rate limits

## Requirements

- Node.js >= 18
- ANTHROPIC_API_KEY environment variable
- Internet connection for LLM API calls

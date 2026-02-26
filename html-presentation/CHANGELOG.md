# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-24

### Added
- Automatic slide overflow detection using Puppeteer screenshots
- LLM-based aesthetic judgment (0-100 scoring) with Claude Sonnet 4.5
- Auto-fix loop with up to 3 iterations for quality improvement
- Configuration options (VERIFY_ENABLED, VERIFY_MAX_ITERATIONS, VERIFY_SCORE_THRESHOLD, VERIFY_TIMEOUT)
- Debug tool for manual slide verification
- Comprehensive error handling with graceful degradation
- Environment variable and CLI flag support for verification control

### Changed
- Build flow now supports optional slide verification
- Better error messages and user feedback
- Improved resource cleanup and management

### Fixed
- Slides no longer overflow screen boundaries (when verification enabled)
- Better visual balance and layout distribution with LLM optimization
- Proper cleanup of Puppeteer browsers and Slidev servers
- Resource leaks prevented with try-finally patterns

### Technical Details
- **Dependencies Added:** @anthropic-ai/sdk, puppeteer (already present)
- **Tests:** 243 tests passing
- **Documentation:** Complete verification system guide
- **Debug Tools:** verify-debug.js for manual verification

## [1.0.0] - Initial Release

### Added
- Markdown to Slidev presentation conversion
- Automatic slide splitting based on H1/H2 headers
- Frontmatter injection with theme configuration
- Dev server with hot reload at localhost:3030
- LLM optimization with basic/full levels

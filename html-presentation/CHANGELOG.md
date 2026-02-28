# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-28

### Added - Verification System
- **VerifyFixLoop:** Core orchestration for verify-fix workflow
  - Automatic slide quality verification using LLM judgment
  - Configurable max iterations (default: 3)
  - Loop detection to prevent infinite fix cycles
  - Integration with SlidevRenderer, PuppeteerCapturer, LLMJudge, LLMFixer
- **AttemptHistory:** Tracks fix attempts with MD5 hashing
  - Records attempts with timestamps and metadata
  - Detects fix loops using hash comparison
  - Provides full history tracking per slide
- **LLMJudge:** Enhanced with buffer-based evaluation
  - New `evaluate()` method accepting image buffers
  - Supports both file path and buffer inputs
  - Validates judgment structure with required fields
- **LLMFixer:** Automatic markdown fixing based on judgment
  - Builds fix prompts from judgment feedback
  - Extracts fixed markdown from LLM responses
  - Supports fix-and-save workflow

### Added - Human Intervention
- **HumanIntervention:** Interactive failure handling
  - 5 intervention modes: skip, edit, view screenshots, apply layout, defer
  - Menu-driven user interface with clear options
  - Editor integration for manual markdown editing
  - Screenshot viewing for visual debugging
  - Layout override capabilities
- **Terminal:** Interactive CLI utilities
  - `prompt()` for user input
  - `menu()` for multi-choice selection
  - `confirm()` for yes/no questions
  - `editFile()` for editor integration
  - `header()`, `success()`, `error()`, `warn()`, `info()` for styled output
  - `table()` for tabular data display

### Added - Three-Layer Caching
- **CacheManager:** Orchestration of L1/L2/L3 cache layers
  - Automatic cache promotion between layers
  - Comprehensive statistics tracking (hits, misses, hit rates)
  - Configurable TTL and size limits per layer
  - `printStats()` for performance monitoring
- **SimpleLRUCache:** In-memory LRU cache implementation
  - TTL-based expiration
  - Automatic eviction when at capacity
  - Timer-based cleanup
- **DiskCache:** Persistent disk-based caching
  - File system storage with MD5 hashing
  - TTL-based expiration
  - Automatic cache directory initialization
- **SemanticCache:** Content similarity matching
  - Keyword extraction from text
  - Jaccard similarity calculation
  - Keyword-based indexing for fast lookup
  - Configurable similarity threshold (default: 0.85)

### Added - CLI Enhancements
- **New CLI Options:**
  - `--verify` / `--no-verify`: Enable/disable verification
  - `--interactive`: Enable human intervention mode
  - `--max-iterations <n>`: Max auto-fix iterations (default: 3)
  - `--threshold <score>`: Quality threshold 0-100 (default: 80)
- **Enhanced SlideGenerator:**
  - Integration with VerifyFixLoop
  - Optional verification (opt-in via `verifyEnabled`)
  - Verification statistics tracking (verified, skipped slides)
  - Proper resource cleanup with `close()` method

### Changed
- Verification is now opt-in (disabled by default for backward compatibility)
- Anthropic API key can be set via `ANTHROPIC_API_KEY` environment variable
- SlideGenerator requires `close()` call when verification enabled
- Cache stats include per-layer hit rates

### Fixed
- Removed `lru-cache` dependency (ESM incompatibility)
- Implemented custom SimpleLRUCache for CommonJS compatibility
- Improved error handling in verification workflow

### Dependencies
- **Added:** `open` (v11.0.0) - File viewing utility
- **Removed:** `lru-cache` - Replaced with custom implementation
- **Existing:** `@anthropic-ai/sdk` (v0.78.0), `puppeteer` (v24.37.3)

### Tests
- **Unit Tests:** 13 tests for VerifyFixLoop and AttemptHistory
- **Unit Tests:** 20 tests for CacheManager and utilities
- **Total:** 33 new tests passing
- **Coverage:** All new modules have comprehensive test coverage

### Documentation
- **MIGRATION.md:** Complete migration guide from v1.x to v2.0
- Updated CHANGELOG.md with detailed v2.0 changes
- Inline documentation for all new modules

## [1.0.0] - Initial Release

### Added
- Markdown to Slidev presentation conversion
- Automatic slide splitting based on H1/H2 headers
- Frontmatter injection with theme configuration
- Dev server with hot reload at localhost:3030
- LLM optimization with basic/full levels

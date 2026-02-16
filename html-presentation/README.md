# HTML Presentation Skill v5.0

> **Status:** 🚧 Under Active Development - Phase 2 Complete

A production-grade presentation system with interactive preview, intelligent content analysis, and LLM-powered optimization.

## Quick Start

```bash
# Install dependencies
npm install

# Run health check
npm run health

# Run tests
npm test

# Start development mode (coming in Phase 3)
npm run dev
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
- 84/84 tests passing with >80% coverage

### ✅ Phase 3: Preview System (COMPLETE)
- File Watcher with debouncing
- Preview Manager with browser automation
- Export Manager (PDF, HTML, screenshots)
- CLI preview and export commands
- Live reload support
- 110/110 tests passing

### 📋 Phase 4: LLM Integration (PLANNED)
- LLM client with retry logic
- Content optimization
- Multimodal processing

### 📋 Phase 5: Polish & Testing (PLANNED)
- Performance optimization
- Visual refinements
- Documentation

## Documentation

- [Phase 1 Summary](docs/phase1-foundation.md)
- [Phase 2 Summary](docs/phase2-content-processing.md)
- [Phase 3 Summary](docs/phase3-preview-system.md)
- [Complete Design Document](../docs/plans/2026-02-15-html-presentation-optimization-design.md)
- [Implementation Plan](../docs/plans/2026-02-15-html-presentation-implementation.md)

## Testing

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Coverage report
npm run test:coverage

# Watch mode
npm run test:watch
```

## License

MIT

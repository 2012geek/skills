# HTML Presentation Skill - Complete Redesign Design

**Date**: 2026-02-11
**Version**: 2.0
**Status**: Approved for Implementation

## Executive Summary

The current html-presentation skill suffers from display issues caused by aggressive CSS overrides trying to fix content overflow after rendering. This design proposes a complete rewrite that prevents overflow at the content generation stage.

---

## Architecture Overview

```
Input (.md)
    ↓
[1] Parse & Structure
    ↓
[2] Select/Download Theme (from official Slidev themes)
    ↓
[3] Load Theme Constraints
    ↓
[4] Image Processing (download, optimize, extract metadata)
    ↓
[5] LLM Content Optimization (optional, with confirmation)
    ↓
[6] Browser-Based Measurement (real dimensions with theme)
    ↓
[7] Intelligent Split (recursive, until content fits)
    ↓
[8] Generate Slidev Markdown (with proper frontmatter)
    ↓
[9] Clean Render (no CSS overrides, theme naturally applied)
    ↓
[10] Validate (screenshot verification)
    ↓
Output (slides.md + dist/)
```

---

## Core Components

### 1. Browser Content Measurer (`core/browser-measurer.js`)

Uses Playwright to render content in a real Slidev environment and measure actual dimensions.

### 2. Enhanced Smart Splitter (`core/smart-splitter.js`)

Splits content based on REAL measurements, not estimates.

### 3. Theme Manager (`core/theme-manager.js`)

Manages official Slidev themes from GitHub/npm.

### 4. Theme Downloader (`core/theme-downloader.js`)

Downloads official themes from Slidev sources.

### 5. Enhanced Image Processor (`core/image-processor.js`)

Processes images before measurement.

### 6. LLM Content Optimizer (`core/llm-optimizer.js`)

Uses Claude API to optimize slide content.

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- Directory structure
- Error handler
- Configuration system
- Theme manager skeleton
- CLI framework

### Phase 2: Theme System (Week 2)
- Theme downloader
- Theme registry
- Theme CLI commands
- Theme loading tests

### Phase 3: Browser Measurement (Week 2-3)
- Browser measurer
- Playwright integration
- Measurement caching
- Performance benchmarking

### Phase 4: Image Processing (Week 3)
- Enhanced image processor
- Image optimization
- Format conversion
- Metadata extraction

### Phase 5: LLM Optimization (Week 4)
- LLM optimizer
- Prompt templates
- Optimization strategies
- User confirmation flow

### Phase 6: Smart Splitting (Week 4-5)
- Rewrite smart splitter
- Recursive splitting
- Split point detection
- Layout hint generation

### Phase 7: Build Pipeline (Week 5-6)
- Rewrite build script
- Integrate all components
- Validation step
- Caching layer

### Phase 8: Testing & Polish (Week 6-7)
- Comprehensive tests
- Error scenarios
- Performance optimization
- Documentation
- User acceptance testing

---

**Document Version**: 1.0
**Last Updated**: 2026-02-11
**Author**: Claude Code

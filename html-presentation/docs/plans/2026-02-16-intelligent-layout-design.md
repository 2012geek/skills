# Intelligent Slide Layout Auto-Fixer Design

**Date**: 2026-02-16
**Status**: Approved
**Approach**: LLM-powered automated layout optimization

---

## 🎯 Problem Statement

Slide presentations have persistent overflow issues:
- Page content elements rendering at 1698px width in 980px containers
- `layout: center` being used globally (title-only layout)
- Manual CSS fixes only targeting specific elements
- Inconsistent layouts across slides
- Time-consuming manual fixes

**Root Cause**: The `layout: center` frontmatter setting is designed for title slides only, but it's applied globally, causing all content to overflow.

---

## 💡 Solution Overview

**Intelligent LLM-Powered Layout Engine**: Automated system that analyzes slide content, determines optimal layouts per slide, and applies responsive CSS constraints - all without manual editing.

### Key Principles

1. **Content-Aware**: Analyze actual slide content to determine best layout
2. **Zero Manual Work**: Fully automated transformation
3. **Multi-Layer Protection**: CSS constraints at multiple levels
4. **Reversible**: Backup and restore capability
5. **Scalable**: Works for any future slides

---

## 🏗️ Architecture

```
Input: slides.md
    ↓
┌─────────────────────────────────────────┐
│  Slide Parser & Analyzer                │
│  - Split into slide objects             │
│  - Detect slide types                   │
│  - Calculate content metrics            │
│  - Identify overflow risks              │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  Layout Decision Engine                 │
│  - Title → center                       │
│  - Content → default                    │
│  - Two-col → default                    │
│  - Image → default + img constraints    │
│  - Code → default + code scroll         │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  Smart CSS Generator                    │
│  - Responsive variables                 │
│  - Element-specific constraints         │
│  - Multi-layer overflow protection      │
└─────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────┐
│  Transformer                            │
│  - Insert optimal frontmatter           │
│  - Inject global smart CSS              │
│  - Create backup                        │
│  - Generate report                      │
└─────────────────────────────────────────┘
    ↓
Output: fixed-slides.md + report
```

---

## 📐 Component Design

### Component 1: Slide Analyzer

**Purpose**: Categorize slides and detect content characteristics

**Detection Algorithm**:
```javascript
function analyzeSlide(markdown) {
  const metrics = {
    hasH1: /^#\s/.test(markdown),
    h2Count: (markdown.match(/^##\s/gm) || []).length,
    hasCode: /```/.test(markdown),
    codeBlockCount: (markdown.match(/```/g) || []).length / 2,
    hasImages: markdown.includes('<img'),
    imageCount: (markdown.match(/<img/g) || []).length,
    hasGrid: markdown.includes('grid-template-columns'),
    hasCards: markdown.includes('case-card') || markdown.includes('comparison-card'),
    lineCount: markdown.split('\n').length,
    hasVClick: markdown.includes('<v-click'),
    hasLists: /^\s*[-*+]\s/m.test(markdown)
  };

  // Slide type determination
  if (metrics.hasH1 && !metrics.hasCode && metrics.lineCount < 20) {
    return { type: 'title', layout: 'center' };
  }

  if (metrics.imageCount >= 2 && metrics.lineCount < 40) {
    return { type: 'image', layout: 'default', imageHeavy: true };
  }

  if (metrics.hasGrid || metrics.hasCards) {
    return { type: 'two-col', layout: 'default' };
  }

  if (metrics.codeBlockCount >= 2) {
    return { type: 'code', layout: 'default', codeHeavy: true };
  }

  if (metrics.h2Count >= 2) {
    return { type: 'content', layout: 'default' };
  }

  return { type: 'simple', layout: 'default' };
}
```

---

### Component 2: Smart CSS Generator

**Purpose**: Generate bulletproof responsive CSS

**CSS Architecture**:
```css
/* Layer 1: Viewport-based variables */
:root {
  --content-max-width: min(85vw, 1100px);
  --text-max-width: min(75vw, 900px);
  --code-max-width: min(90vw, 1000px);
}

/* Layer 2: Container constraints */
.slidev-slide-content {
  max-width: 95vw !important;
  overflow-x: hidden !important;
  box-sizing: border-box !important;
}

/* Layer 3: Universal element constraints */
.slidev-slide-content > * {
  max-width: var(--content-max-width);
  box-sizing: border-box !important;
}

/* Layer 4: Text-specific constraints */
h1, h2, h3, h4, h5, h6,
p, ul, ol, li,
blockquote, .slidev-vclick-target {
  max-width: var(--text-max-width) !important;
  overflow-wrap: break-word !important;
  word-break: break-word !important;
  overflow-x: hidden !important;
}

/* Layer 5: Code block handling */
pre, code, .shiki {
  max-width: var(--code-max-width) !important;
  overflow-x: auto !important;
  white-space: pre-wrap !important;
  word-wrap: break-word !important;
}

/* Layer 6: Image constraints */
img {
  max-width: min(90vw, 1500px) !important;
  max-height: min(75vh, 900px) !important;
  object-fit: contain !important;
}

/* Layer 7: Grid protection */
[style*="grid-template-columns"] {
  max-width: 95vw !important;
  overflow-x: hidden !important;
}

/* Layer 8: Emergency clamp */
* {
  max-width: 100vw !important;
}
```

---

### Component 3: Auto-Transformer

**Purpose**: Execute transformation with safety features

**Features**:
- Parse slides.md into slide array
- Apply layout analysis per slide
- Inject frontmatter where needed
- Add global smart CSS to first slide
- Create backup: `slides.md.backup-YYYYMMDD-HHMMSS`
- Generate JSON report of all changes
- Support `--dry-run` mode
- Support `--restore` to undo changes

**CLI Interface**:
```bash
node scripts/fix-layouts.js <input-file> [options]

Options:
  --dry-run       Show changes without applying
  --restore       Restore from backup
  --verbose       Show detailed output
  --force         Overwrite existing backups
  --no-backup     Skip backup creation (not recommended)
```

---

### Component 4: Change Reporter

**Purpose**: Document all transformations

**Report Structure**:
```json
{
  "timestamp": "2026-02-16T10:30:00Z",
  "inputFile": "slides.md",
  "outputFile": "slides.md",
  "backupFile": "slides.md.backup-20260216-103000",
  "summary": {
    "totalSlides": 15,
    "slidesModified": 12,
    "titleSlides": 1,
    "contentSlides": 8,
    "imageSlides": 2,
    "codeSlides": 2
  },
  "changes": [
    {
      "slideNumber": 1,
      "originalLayout": "center",
      "newLayout": "center",
      "type": "title",
      "reason": "H1 only, minimal content"
    },
    {
      "slideNumber": 4,
      "originalLayout": "center",
      "newLayout": "default",
      "type": "content",
      "reason": "Multiple H2, content-rich"
    }
  ],
  "cssAdded": true,
  "overflowProtection": {
    "layers": 8,
    "elementsConstrained": ["h1-h6", "p", "ul", "ol", "li", "blockquote", "pre", "code", "img", "table", "grid"]
  }
}
```

---

## 🔄 Workflow

### Normal Operation

1. User runs: `node scripts/fix-layouts.js slides.md`
2. Script creates backup
3. Parse and analyze all slides
4. Apply layout assignments
5. Inject smart CSS
6. Generate report
7. Write fixed slides
8. Done!

### Dry Run

1. User runs: `node scripts/fix-layouts.js slides.md --dry-run`
2. Parse and analyze (no file writes)
3. Display preview of changes
4. Ask for confirmation
5. Apply if approved

### Restore

1. User runs: `node scripts/fix-layouts.js slides.md --restore`
2. Find latest backup
3. Restore original file
4. Report restoration complete

---

## ✅ Success Criteria

1. **No Overflow**: All slides render within viewport bounds
2. **Zero Manual Work**: Fully automated transformation
3. **Reversible**: Backup and restore working
4. **Responsive**: Works across screen sizes (1920px, 1366px, 768px)
5. **Preserved Content**: No content loss or corruption
6. **Documentation**: Clear report of all changes

---

## 🧪 Testing Strategy

### Unit Tests
- Slide type detection accuracy
- CSS generation correctness
- Layout decision logic

### Integration Tests
- End-to-end transformation
- Backup/restore functionality
- Dry-run mode accuracy

### Visual Tests
- Screenshot comparison before/after
- Multiple viewport sizes
- All slide types

---

## 📁 File Structure

```
html-presentation/
├── scripts/
│   └── fix-layouts.js           # Main transformation script
├── tests/
│   ├── fix-layouts.test.js      # Test suite
│   └── fixtures/
│       ├── overflow-slides.md   # Test input
│       └── fixed-slides.md      # Expected output
└── docs/
    └── plans/
        └── 2026-02-16-intelligent-layout-design.md  # This file
```

---

## 🚀 Implementation Phases

### Phase 1: Core Engine (Estimate: 2-3 hours)
- [ ] Slide parser implementation
- [ ] Type detection algorithm
- [ ] Layout decision engine
- [ ] Unit tests for analyzer

### Phase 2: CSS Generator (Estimate: 1-2 hours)
- [ ] CSS template system
- [ ] Responsive variable calculation
- [ ] Multi-layer constraint system
- [ ] CSS injection logic

### Phase 3: Transformer (Estimate: 2-3 hours)
- [ ] Backup/restore system
- [ ] File transformation pipeline
- [ ] Report generation
- [ ] CLI argument parsing

### Phase 4: Testing & Validation (Estimate: 1-2 hours)
- [ ] Integration tests
- [ ] Visual regression tests
- [ ] Multiple viewport testing
- [ ] Edge case handling

**Total Estimate**: 6-10 hours

---

## 🎯 Next Steps

1. ✅ Design approved
2. ⏭️ Create implementation plan with writing-plans skill
3. ⏭️ Implement Phase 1-4
4. ⏭️ Test on actual slides.md
5. ⏭️ Generate before/after screenshots
6. ⏭️ Deploy and validate

---

**Design Status**: ✅ Approved, ready for implementation
**Last Updated**: 2026-02-16

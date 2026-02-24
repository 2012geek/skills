# Layout Fixer Usage Guide

The Intelligent Slide Layout Auto-Fixer automatically analyzes your Slidev presentations, detects potential overflow issues, and applies smart CSS fixes to prevent content from overflowing.

## Features

- **Automatic Slide Analysis**: Detects different slide types (title, code, image, two-column, etc.)
- **Smart CSS Injection**: Applies 8-layer overflow protection system
- **Safe Operation**: Creates timestamped backups before modifying files
- **Detailed Reporting**: Generates JSON reports of all changes made
- **Dry Run Mode**: Preview changes without modifying files
- **Restore Capability**: Easily restore from any backup

## Installation

The layout fixer is included in the html-presentation skill. No additional installation needed.

## Usage

### Basic Usage

Fix a slide deck:

```bash
node scripts/fix-layouts.js path/to/slides.md
```

### Dry Run Mode

Preview what would be changed without modifying files:

```bash
node scripts/fix-layouts.js path/to/slides.md --dry-run
```

### Verbose Mode

See detailed processing information:

```bash
node scripts/fix-layouts.js path/to/slides.md --verbose
```

### Combined Options

Use multiple options together:

```bash
node scripts/fix-layouts.js path/to/slides.md --dry-run --verbose
```

### Restore from Backup

Restore the most recent backup:

```bash
node scripts/fix-layouts.js path/to/slides.md --restore
```

## How It Works

### 1. Slide Parsing

The fixer parses your markdown into individual slides, extracting:
- Frontmatter metadata
- Slide content
- Layout information

### 2. Slide Analysis

Each slide is analyzed to determine:
- **Slide Type**: title, code, image, two-column, content, or simple
- **Appropriate Layout**: center or default
- **Content Characteristics**: H1/H2 count, code blocks, images, grids, etc.

### 3. CSS Generation

Smart CSS is generated based on the slide layout with 8 protection layers:

1. **CSS Variables**: Configurable max widths and heights
2. **Container Constraints**: Overall slide boundaries
3. **Text Constraints**: Word wrapping and breaking
4. **Code Block Constraints**: Scrollable code blocks
5. **Image Constraints**: Auto-scaling images
6. **Grid Constraints**: Overflow handling for grids
7. **List Constraints**: Word wrapping for lists
8. **Table Constraints**: Scrollable tables

### 4. Transformation

The generated CSS is injected into the first slide as a `<style>` block, which applies to all slides.

### 5. Backup & Report

- A timestamped backup is created: `slides.md.backup-YYYYMMDDHHmmss`
- A JSON report is generated: `slides.md.layout-fix-report.json`

## Report Format

The generated JSON report includes:

```json
{
  "summary": {
    "totalSlides": 16,
    "slidesProcessed": 16,
    "cssInjected": true,
    "changesDetected": 16
  },
  "changes": [
    {
      "slide": 1,
      "type": "title",
      "layout": "center",
      "reason": "H1 only, minimal content",
      "cssInjected": true
    }
  ],
  "timestamp": "2026-02-24T03:10:56.074Z"
}
```

## Slide Types Detected

### Title Slides
- **Characteristics**: H1 only, minimal content, no code
- **Layout**: `center`
- **Example**: Title slides with just a heading

### Two-Column Slides
- **Characteristics**: Contains grid layouts or cards
- **Layout**: `default`
- **Example**: Slides with `<div class="grid grid-cols-2">`

### Code Slides
- **Characteristics**: Multiple code blocks (2+)
- **Layout**: `default` with code-heavy flag
- **Example**: Slides with multiple code examples

### Image Slides
- **Characteristics**: Multiple images (2+)
- **Layout**: `default` with image-heavy flag
- **Example**: Slides with multiple `<img>` tags

### Content Slides
- **Characteristics**: Multiple H2 headings (2+)
- **Layout**: `default`
- **Example**: Slides with multiple sections

### Simple Slides
- **Characteristics**: Default fallback
- **Layout**: `default`
- **Example**: Most regular slides

## CSS Generated

### Center Layout

```css
.layout-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: var(--container-max-height);
}
```

### Default Layout

The default layout includes:
- Max width constraints
- Text wrapping and breaking
- Code block scrolling
- Image auto-scaling
- Grid overflow handling
- List word wrapping
- Table scrolling

## Best Practices

1. **Always Use Dry Run First**: Check what will be changed before applying
2. **Review the Report**: The JSON report shows exactly what was analyzed
3. **Keep Backups**: Backups are created automatically before any modifications
4. **Test Your Slides**: After fixing, preview your slides to ensure they look correct
5. **Use Verbose Mode**: See detailed information about each slide during processing

## Troubleshooting

### Issue: Slides don't render after fixing

**Solution**: Restore from backup
```bash
node scripts/fix-layouts.js path/to/slides.md --restore
```

### Issue: CSS not applying

**Solution**: Check that the `<style>` tag is present in the first slide after the frontmatter.

### Issue: Content still overflows

**Solution**: The fixer provides best-effort overflow prevention. Some manual adjustments may be needed for extreme cases:
- Reduce font size
- Split content across multiple slides
- Use scrolling containers manually
- Adjust image sizes

## File Structure

```
scripts/
├── fix-layouts.js              # Main CLI script
├── lib/
│   ├── backup-manager.js       # Backup creation/restoration
│   ├── css-generator.js        # Smart CSS generation
│   ├── layout-transformer.js   # Slide transformation
│   ├── markdown-reconstructor.js # Markdown reconstruction
│   ├── report-generator.js     # Report generation
│   ├── slide-analyzer.js       # Slide type analysis
│   └── slide-parser.js         # Markdown parsing
└── __tests__/
    ├── backup-manager.test.js
    ├── css-generator.test.js
    ├── integration.test.js
    ├── layout-transformer.test.js
    ├── markdown-reconstructor.test.js
    ├── report-generator.test.js
    ├── slide-analyzer.test.js
    └── slide-parser.test.js
```

## Testing

Run the test suite:

```bash
npm test
```

Run integration tests:

```bash
npm test -- scripts/integration.test.js
```

## Examples

### Example 1: Fix with Preview

```bash
# 1. Dry run to see changes
node scripts/fix-layouts.js presentation.md --dry-run --verbose

# 2. Apply fixes
node scripts/fix-layouts.js presentation.md

# 3. Preview the result
node cli.js preview presentation.md --port 3030
```

### Example 2: Fix and Verify

```bash
# Apply fixes
node scripts/fix-layouts.js presentation.md --verbose

# Check the report
cat presentation.md.layout-fix-report.json

# If issues, restore
node scripts/fix-layouts.js presentation.md --restore
```

### Example 3: Batch Processing

```bash
# Fix multiple presentations
for file in presentations/*.md; do
  node scripts/fix-layouts.js "$file" --verbose
done
```

## Configuration

The CSS generation can be configured by modifying the `generateSmartCSS` call in `layout-transformer.js`:

```javascript
const css = generateSmartCSS({
  maxWidth: '1100px',      // Maximum slide width
  padding: '40px',          // Slide padding
  maxHeight: '80vh',        // Maximum container height
  textMaxWidth: '900px',    // Maximum text width
  codeMaxHeight: '400px',   // Maximum code block height
  gridGap: '20px',          // Grid gap spacing
  layout: 'default',        // Target layout
  enableTextWrapping: true,
  enableCodeScroll: true,
  enableImageScaling: true
});
```

## Contributing

To extend the layout fixer:

1. Add new slide types in `slide-analyzer.js`
2. Add new CSS rules in `css-generator.js`
3. Update the transformer in `layout-transformer.js`
4. Add tests in `__tests__/`
5. Update this documentation

## License

Part of the html-presentation skill. See main project LICENSE.

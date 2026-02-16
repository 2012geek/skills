# Basic Usage Example

This example demonstrates the basic usage of the HTML Presentation skill.

## Analyze Content

```javascript
const { ContentAnalyzer } = require('../lib');

const analyzer = new ContentAnalyzer();
const analysis = await analyzer.analyze('presentation.md');

console.log('Metrics:', analysis.metrics);
console.log('Sections:', analysis.structure.sections);
```

## Generate Presentation

```javascript
const { SlideGenerator } = require('../lib');

const generator = new SlideGenerator();
const presentation = await generator.generate('presentation.md', {
  theme: 'seriph',
  title: 'My Presentation'
});

console.log(presentation.frontmatter);
console.log('Slides:', presentation.slides.length);
```

## Start Preview

```javascript
const { PreviewManager } = require('../preview');

const manager = new PreviewManager();

await manager.start({
  inputFile: 'presentation.md',
  port: 3030
});

// Browser opens with live preview
// File changes trigger automatic reload

// Stop when done
await manager.stop();
```

## Export to PDF

```javascript
const { ExportManager } = require('../preview');

const exporter = new ExportManager();
const result = await exporter.exportToPDF({
  url: 'http://localhost:3030',
  outputPath: './presentation.pdf'
});

console.log('PDF exported:', result.path);
```

## CLI Usage

```bash
# Generate presentation
node cli.js generate slides.md

# Analyze content
node cli.js analyze slides.md

# Start preview
node cli.js preview slides.md

# Export to PDF
node cli.js export slides.md -f pdf -o presentation.pdf

# Export screenshots of all slides
node cli.js export slides.md -f screenshot -o slides/ --all-slides
```

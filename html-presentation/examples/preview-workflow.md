# Preview Workflow Example

This example demonstrates a complete preview workflow with live reload.

## Start Preview with Live Reload

```javascript
const { PreviewManager } = require('../preview');

async function runPreview() {
  const manager = new PreviewManager();

  // Start preview
  await manager.start({
    inputFile: 'presentation.md',
    port: 3030
  });

  console.log('Preview started at http://localhost:3030');
  console.log('Press Ctrl+C to stop');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nStopping preview...');
    await manager.stop();
    process.exit(0);
  });
}

runPreview().catch(console.error);
```

## File Change Detection

The PreviewManager automatically watches the input file for changes:

1. Edit `presentation.md`
2. Save the file
3. File Watcher detects change (debounced 200ms)
4. Preview refreshes automatically via Slidev's WebSocket

## Export During Preview

```javascript
const { ExportManager } = require('../preview');

async function captureWhilePreviewing() {
  const preview = new PreviewManager();
  const exporter = new ExportManager();

  // Start preview
  await preview.start({
    inputFile: 'presentation.md',
    port: 3030
  });

  // Wait for preview to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Capture screenshots while previewing
  const result = await exporter.captureScreenshot({
    url: 'http://localhost:3030',
    outputPath: './screenshots/',
    captureAll: true
  });

  console.log(`Captured ${result.files.length} slides`);

  // Continue preview...
  // When done, stop the preview
  await preview.stop();
}

captureWhilePreviewing().catch(console.error);
```

## Export to Different Formats

```bash
# Terminal 1: Start preview
node cli.js preview slides.md

# Terminal 2: Export while preview is running
node cli.js export http://localhost:3030 -f pdf -o presentation.pdf
node cli.js export http://localhost:3030 -f html -o presentation.html
node cli.js export http://localhost:3030 -f screenshot -o slide- --all-slides
```

## Advanced: Custom Export Workflow

```javascript
const { PreviewManager } = require('../preview');
const { ExportManager } = require('../preview');
const { SlideGenerator } = require('../lib');

async function customWorkflow() {
  const generator = new SlideGenerator();
  const preview = new PreviewManager();
  const exporter = new ExportManager();

  // 1. Generate presentation
  const presentation = await generator.generate('slides.md', {
    theme: 'seriph'
  });

  console.log(`Generated ${presentation.slides.length} slides`);

  // 2. Start preview
  await preview.start({
    inputFile: 'slides.md',
    port: 3030
  });

  console.log('Preview started');

  // 3. Wait for user to review
  await new Promise(resolve => setTimeout(resolve, 10000));

  // 4. Export to multiple formats
  const pdfResult = await exporter.exportToPDF({
    url: 'http://localhost:3030',
    outputPath: './output/presentation.pdf'
  });

  const htmlResult = await exporter.exportToHTML({
    url: 'http://localhost:3030',
    outputPath: './output/presentation.html'
  });

  console.log('Export complete:', pdfResult, htmlResult);

  // 5. Stop preview
  await preview.stop();
}

customWorkflow().catch(console.error);
```

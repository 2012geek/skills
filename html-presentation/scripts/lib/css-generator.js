/**
 * Smart CSS Generator - 8-Layer Overflow Protection System
 *
 * Generates comprehensive CSS rules to prevent content overflow in slides.
 * Each layer addresses specific overflow scenarios.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.maxWidth - Maximum slide width (default: '1100px')
 * @param {string} options.padding - Slide padding (default: '40px')
 * @param {string} options.maxHeight - Maximum container height (default: '80vh')
 * @param {string} options.textMaxWidth - Maximum text width (default: '900px')
 * @param {string} options.codeMaxHeight - Maximum code block height (default: '400px')
 * @param {string} options.gridGap - Grid gap spacing (default: '20px')
 * @param {string} options.layout - Specific layout to target ('default', 'center', 'two-col')
 * @param {boolean} options.enableTextWrapping - Enable text wrapping (default: true)
 * @param {boolean} options.enableCodeScroll - Enable code block scrolling (default: true)
 * @param {boolean} options.enableImageScaling - Enable image auto-scaling (default: true)
 * @returns {string} Generated CSS
 */
function generateSmartCSS(options = {}) {
  // Default configuration
  const config = {
    maxWidth: '1100px',
    padding: '40px',
    maxHeight: '80vh',
    textMaxWidth: '900px',
    codeMaxHeight: '400px',
    gridGap: '20px',
    layout: 'default',
    enableTextWrapping: true,
    enableCodeScroll: true,
    enableImageScaling: true,
    ...options
  };

  const cssLayers = [];

  // Layer 1: CSS Variables
  cssLayers.push(generateVariablesLayer(config));

  // Layer 2: Container Constraints
  cssLayers.push(generateContainerLayer(config));

  // Layer 3: Text Constraints
  if (config.enableTextWrapping) {
    cssLayers.push(generateTextLayer(config));
  }

  // Layer 4: Code Block Constraints
  if (config.enableCodeScroll) {
    cssLayers.push(generateCodeLayer(config));
  }

  // Layer 5: Image Constraints
  if (config.enableImageScaling) {
    cssLayers.push(generateImageLayer(config));
  }

  // Layer 6: Grid Constraints
  cssLayers.push(generateGridLayer(config));

  // Layer 7: List Constraints
  cssLayers.push(generateListLayer(config));

  // Layer 8: Table Constraints
  cssLayers.push(generateTableLayer(config));

  // Layout-specific CSS
  if (config.layout === 'center') {
    cssLayers.push(generateCenterLayout(config));
  } else if (config.layout === 'two-col') {
    cssLayers.push(generateTwoColumnLayout(config));
  }

  return cssLayers.join('\n\n');
}

/**
 * Layer 1: CSS Variables
 */
function generateVariablesLayer(config) {
  return `:root {
  --slide-max-width: ${config.maxWidth};
  --slide-padding: ${config.padding};
  --container-max-height: ${config.maxHeight};
  --text-max-width: ${config.textMaxWidth};
  --code-max-height: ${config.codeMaxHeight};
  --grid-gap: ${config.gridGap};
}`;
}

/**
 * Layer 2: Container Constraints
 */
function generateContainerLayer(config) {
  return `.slidev-layout {
  max-width: var(--slide-max-width);
  margin: 0 auto;
  padding: var(--slide-padding);
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  max-height: var(--container-max-height);
}`;
}

/**
 * Layer 3: Text Constraints
 */
function generateTextLayer(config) {
  return `.slidev-layout h1,
.slidev-layout h2,
.slidev-layout h3,
.slidev-layout h4,
.slidev-layout h5,
.slidev-layout h6 {
  overflow-wrap: break-word;
  word-wrap: break-word;
  word-break: break-word;
  hyphens: auto;
  max-width: 100%;
}

.slidev-layout p {
  max-width: var(--text-max-width);
  overflow: hidden;
  text-overflow: ellipsis;
}

.slidev-layout span,
.slidev-layout div {
  overflow-wrap: break-word;
  word-wrap: break-word;
}`;
}

/**
 * Layer 4: Code Block Constraints
 */
function generateCodeLayer(config) {
  return `.slidev-layout pre {
  max-height: var(--code-max-height);
  overflow: auto;
  overflow-wrap: normal;
  white-space: pre;
  word-wrap: normal;
}

.slidev-layout code {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}`;
}

/**
 * Layer 5: Image Constraints
 */
function generateImageLayer(config) {
  return `.slidev-layout img {
  max-width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}`;
}

/**
 * Layer 6: Grid Constraints
 */
function generateGridLayer(config) {
  return `.slidev-layout [style*="grid"],
.slidev-layout [class*="grid"] {
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
}

.slidev-layout [style*="grid"] > *,
.slidev-layout [class*="grid"] > * {
  min-width: 0;
  overflow: hidden;
}`;
}

/**
 * Layer 7: List Constraints
 */
function generateListLayer(config) {
  return `.slidev-layout ul,
.slidev-layout ol {
  overflow: hidden;
  word-wrap: break-word;
  max-width: 100%;
}

.slidev-layout li {
  overflow-wrap: break-word;
  word-wrap: break-word;
  max-width: 100%;
}`;
}

/**
 * Layer 8: Table Constraints
 */
function generateTableLayer(config) {
  return `.slidev-layout table {
  overflow: auto;
  display: block;
  max-width: 100%;
}

.slidev-layout th,
.slidev-layout td {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}`;
}

/**
 * Center Layout
 */
function generateCenterLayout(config) {
  return `.layout-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: var(--container-max-height);
}

.layout-center > * {
  max-width: 100%;
}`;
}

/**
 * Two Column Layout
 */
function generateTwoColumnLayout(config) {
  return `.layout-two-col {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--grid-gap);
  align-items: start;
}

@media (max-width: 768px) {
  .layout-two-col {
    grid-template-columns: 1fr;
  }
}`;
}

module.exports = { generateSmartCSS };

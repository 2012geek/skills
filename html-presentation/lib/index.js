/**
 * Lib Index
 * Exports all library modules
 *
 * v1.0 modules (legacy):
 * - ContentAnalyzer (lib/)
 * - LayoutEngine (lib/)
 * - ThemeManager (lib/)
 * - SlideGenerator (lib/)
 * - AssetProcessor (lib/)
 *
 * v2.0 modules (new architecture):
 * - ContentAnalyzerV2 (core/)
 * - LayoutSelectorV2 (core/)
 * - SlideGeneratorV2 (core/)
 */

// v1.0 modules
const { ContentAnalyzer } = require('./content-analyzer');
const { LayoutEngine } = require('./layout-engine');
const { ThemeManager } = require('./theme-manager');
const { SlideGenerator } = require('./slide-generator');
const { AssetProcessor } = require('./asset-processor');

// v2.0 modules (stubs - to be implemented in Phase 1)
const { ContentAnalyzer: ContentAnalyzerV2 } = require('../core/content-analyzer');
const { LayoutSelector: LayoutSelectorV2 } = require('../core/layout-selector');
const { SlideGenerator: SlideGeneratorV2 } = require('../core/slide-generator');

module.exports = {
  // v1.0 exports
  ContentAnalyzer,
  LayoutEngine,
  ThemeManager,
  SlideGenerator,
  AssetProcessor,

  // v2.0 exports
  ContentAnalyzerV2,
  LayoutSelectorV2,
  SlideGeneratorV2
};

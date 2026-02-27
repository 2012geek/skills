/**
 * html-presentation v2.0
 *
 * BREAKING CHANGES from v1.x:
 * - Previous lib/ modules (LayoutEngine, ThemeManager, AssetProcessor) have been moved or removed
 * - SlideGenerator, ContentAnalyzer, LayoutSelector are now in core/ directory
 * - API has been simplified with v2 architecture
 *
 * See MIGRATION.md for details (to be added in Task 12)
 */

const { SlideGenerator } = require('../core/slide-generator');
const { ContentAnalyzer } = require('../core/content-analyzer');
const { LayoutSelector } = require('../core/layout-selector');

module.exports = {
  SlideGenerator,
  ContentAnalyzer,
  LayoutSelector
};

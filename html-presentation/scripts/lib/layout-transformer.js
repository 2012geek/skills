const { generateSmartCSS } = require('./css-generator');

/**
 * Transform slides by applying layouts and injecting smart CSS
 *
 * @param {Array<Object>} slides - Array of slide objects with index, frontmatter, content
 * @returns {Array<Object>} Transformed slides with CSS injected into first slide
 */
function transformSlides(slides) {
  // Handle null or undefined input
  if (!slides || !Array.isArray(slides)) {
    return [];
  }

  // Handle empty array
  if (slides.length === 0) {
    return [];
  }

  // Create a deep copy to avoid mutating the original
  const transformedSlides = slides.map(slide => ({
    ...slide,
    frontmatter: { ...slide.frontmatter }
  }));

  // Get the layout from the first slide (prefer frontmatter, then analyzed layout, then default)
  const firstSlide = transformedSlides[0];
  const layout = firstSlide.frontmatter?.layout || firstSlide.layout || 'default';

  // Generate smart CSS based on layout
  const css = generateSmartCSS({ layout });

  // Inject CSS into the first slide's frontmatter style field
  if (css) {
    const existingStyle = firstSlide.frontmatter?.style || '';
    firstSlide.frontmatter.style = existingStyle ? `${existingStyle}\n${css}` : css;

    // Remove rawFrontmatter to force reconstruction with modified frontmatter
    delete firstSlide.rawFrontmatter;
  }

  return transformedSlides;
}

module.exports = { transformSlides };

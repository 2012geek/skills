const SLIDE_SEPARATOR = '\n---\n';
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n/;

/**
 * Parse markdown slides into an array of slide objects
 * @param {string} markdown - The full markdown content
 * @returns {Array<Object>} Array of slide objects with index, frontmatter, content
 */
function parseSlides(markdown) {
  // Input validation
  if (typeof markdown !== 'string') {
    throw new TypeError('markdown must be a string');
  }
  if (!markdown.trim()) {
    return [];
  }

  const slides = [];

  // Process the markdown character by character to properly split slides
  let remaining = markdown;
  let index = 0;

  while (remaining.length > 0) {
    // Check if this slide starts with frontmatter
    const frontmatterMatch = remaining.match(FRONTMATTER_REGEX);

    let frontmatter = {};
    let contentStart = 0;

    if (frontmatterMatch) {
      frontmatter = parseSimpleYaml(frontmatterMatch[1]);
      contentStart = frontmatterMatch[0].length;
    }

    // Find the next slide separator (--- on its own line)
    // But not if it's part of frontmatter
    let nextSeparator = -1;
    const searchStart = contentStart > 0 ? contentStart : 0;

    for (let i = searchStart; i < remaining.length - 4; i++) {
      // Check if we found the slide separator
      if (remaining.substr(i, SLIDE_SEPARATOR.length) === SLIDE_SEPARATOR) {
        // Make sure this isn't part of frontmatter (which would be ---\n at start)
        if (i > 0) {
          nextSeparator = i;
          break;
        }
      }
    }

    let slideContent;
    if (nextSeparator === -1) {
      // This is the last slide
      slideContent = remaining.substring(contentStart).trim();
      remaining = '';
    } else {
      slideContent = remaining.substring(contentStart, nextSeparator).trim();
      remaining = remaining.substring(nextSeparator + SLIDE_SEPARATOR.length); // Skip past separator
    }

    if (slideContent || Object.keys(frontmatter).length > 0) {
      slides.push({
        index: index++,
        frontmatter,
        content: slideContent
      });
    }
  }

  return slides;
}

/**
 * Parse simple YAML frontmatter
 * @param {string} yaml - YAML string
 * @returns {Object} Parsed object with key-value pairs
 */
function parseSimpleYaml(yaml) {
  // Input validation
  if (!yaml || typeof yaml !== 'string') {
    return {};
  }

  const result = {};
  const lines = yaml.split('\n');

  lines.forEach(line => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      result[key.trim()] = value.trim();
    }
  });

  return result;
}

module.exports = { parseSlides };

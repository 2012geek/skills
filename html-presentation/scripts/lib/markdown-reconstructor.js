/**
 * Reconstruct markdown from an array of slide objects
 *
 * @param {Array<Object>} slides - Array of slide objects with index, frontmatter, content
 * @returns {string} Reconstructed markdown
 */
function reconstructMarkdown(slides) {
  // Handle null or undefined input
  if (!slides || !Array.isArray(slides)) {
    return '';
  }

  // Handle empty array
  if (slides.length === 0) {
    return '';
  }

  // Reconstruct each slide
  const slideMarkdowns = slides.map((slide, index) => {
    const frontmatter = slide.frontmatter || {};
    const content = slide.content || '';

    // Use raw frontmatter if available (preserves original YAML formatting)
    if (slide.rawFrontmatter) {
      return `---\n${slide.rawFrontmatter}\n---\n\n${content}`;
    }

    // Build frontmatter section
    let frontmatterSection = '';
    if (Object.keys(frontmatter).length > 0) {
      frontmatterSection = formatFrontmatter(frontmatter);
    }

    // Combine frontmatter and content
    if (frontmatterSection) {
      return `${frontmatterSection}\n\n${content}`;
    }
    return content;
  });

  // Join slides with separator
  return slideMarkdowns.join('\n---\n');
}

/**
 * Format frontmatter object as YAML
 *
 * @param {Object} frontmatter - Frontmatter object
 * @returns {string} Formatted YAML frontmatter
 */
function formatFrontmatter(frontmatter) {
  const lines = ['---'];

  Object.entries(frontmatter).forEach(([key, value]) => {
    const formattedValue = formatYamlValue(value);
    lines.push(`${key}: ${formattedValue}`);
  });

  lines.push('---');

  return lines.join('\n');
}

/**
 * Format a value for YAML output
 *
 * @param {*} value - Value to format
 * @returns {string} Formatted value
 */
function formatYamlValue(value) {
  // Handle different types
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return String(value);
  }

  // Handle strings
  if (typeof value === 'string') {
    // Check if it's a multi-line string
    if (value.includes('\n')) {
      // Use literal style scalar for multi-line strings
      // Don't add extra indentation for CSS to preserve formatting
      const lines = value.split('\n');
      return `|\n${lines.map(line => '  ' + line).join('\n')}`;
    }

    // Check if value needs quoting
    if (needsQuoting(value)) {
      return JSON.stringify(value);
    }

    return value;
  }

  // For arrays and objects, convert to JSON (simple approach)
  return JSON.stringify(value);
}

/**
 * Check if a string value needs quoting in YAML
 *
 * @param {string} value - String value to check
 * @returns {boolean} True if quoting is needed
 */
function needsQuoting(value) {
  // Strings that look like other YAML types should be quoted
  if (value === '' || value === 'null' || value === 'true' || value === 'false') {
    return true;
  }

  // Strings starting with special characters
  if (/^[\{\}\[\],&*#?|<>%@"'`]/.test(value)) {
    return true;
  }

  // Strings containing colons followed by space (might look like key-value)
  if (/: /.test(value)) {
    return true;
  }

  return false;
}

module.exports = { reconstructMarkdown };

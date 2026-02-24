function parseSlides(markdown) {
  const slides = [];
  const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n/;

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
      // Check if we found \n---\n
      if (remaining.substr(i, 5) === '\n---\n') {
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
      remaining = remaining.substring(nextSeparator + 5); // Skip past \n---\n
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

function parseSimpleYaml(yaml) {
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

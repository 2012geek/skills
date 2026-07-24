const fs = require('fs');
const path = require('path');

/**
 * Parse known-bugs/INDEX.md and return an array of entry objects.
 *
 * Each entry: { file, name, description, link }
 * - `file`: the .md filename (e.g. "assert-vs-raise.md")
 * - `name`: the stem (e.g. "assert-vs-raise")
 * - `description`: the one-line description after the em dash
 * - `link`: the relative link target from the markdown
 *
 * INDEX.md lines look like:
 *   - [assert-vs-raise.md](assert-vs-raise.md) — Python validation-path assert should be ValueError
 *
 * Lines that don't match the pattern are ignored (comments, blank lines, headings).
 */
function loadKnownBugsIndex(kbDir) {
  const indexPath = path.join(kbDir, 'INDEX.md');
  if (!fs.existsSync(indexPath)) {
    return [];
  }
  const content = fs.readFileSync(indexPath, 'utf-8');
  const entries = [];
  const lineRegex = /^-\s+\[([^\]]+)\]\(([^)]+)\)\s*—\s*(.+)$/gm;
  let match;
  while ((match = lineRegex.exec(content)) !== null) {
    const file = match[1];
    entries.push({
      file,
      name: path.basename(file, '.md'),
      link: match[2],
      description: match[3].trim(),
    });
  }
  return entries;
}

/**
 * Read the full markdown content of a single known-bugs entry.
 */
function loadKnownBugFile(kbDir, file) {
  const filePath = path.join(kbDir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`known-bugs entry not found: ${file}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Given a knownBugRelevance array from the planner, return only the entries
 * marked relevant: true.
 */
function filterRelevance(knownBugRelevance) {
  if (!Array.isArray(knownBugRelevance)) {
    return [];
  }
  return knownBugRelevance.filter(entry => entry && entry.relevant === true);
}

module.exports = { loadKnownBugsIndex, loadKnownBugFile, filterRelevance };

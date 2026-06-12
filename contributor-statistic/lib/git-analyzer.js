'use strict';

// ============================================================================
// GIT ANALYZER
// ============================================================================

class GitAnalyzer {
  static parseShortlog(output) {
    if (!output || !output.trim()) return [];

    const lines = output.trim().split('\n');
    return lines.map(line => {
      const match = line.trim().match(/^\s*(\d+)\t(.+?)\s*<(.+?)>/);
      if (!match) return null;
      return { name: match[2].trim(), email: match[3], commits: parseInt(match[1], 10) };
    }).filter(Boolean);
  }

  static parseLog(output) {
    if (!output || !output.trim()) return [];

    return output.trim().split('\n').map(line => {
      const parts = line.split('|');
      if (parts.length < 5) return null;
      return {
        hash: parts[0],
        author: parts[1],
        email: parts[2],
        date: parts[3],
        subject: parts.slice(4).join('|')
      };
    }).filter(Boolean);
  }

  static parseNumstat(output) {
    if (!output || !output.trim()) return {};

    const result = {};
    let currentHash = null;
    let currentAuthor = null;

    for (const line of output.trim().split('\n')) {
      const hashMatch = line.match(/^([a-f0-9]+)\|(.+)$/);
      if (hashMatch) {
        currentHash = hashMatch[1];
        currentAuthor = hashMatch[2];
        result[currentHash] = { author: currentAuthor, linesAdded: 0, linesRemoved: 0, files: [] };
        continue;
      }

      const statMatch = line.match(/^(-|\d+)\t(-|\d+)\t(.+)$/);
      if (statMatch && currentHash) {
        const added = statMatch[1] === '-' ? 0 : parseInt(statMatch[1], 10);
        const removed = statMatch[2] === '-' ? 0 : parseInt(statMatch[2], 10);
        const file = statMatch[3];

        if (added > 0 || removed > 0) {
          result[currentHash].linesAdded += added;
          result[currentHash].linesRemoved += removed;
          result[currentHash].files.push(file);
        }
      }
    }

    return result;
  }

  static aggregateByContributor(shortlog, commits) {
    const contributors = {};

    for (const entry of shortlog) {
      contributors[entry.name] = {
        name: entry.name,
        email: entry.email,
        totalCommits: entry.commits,
        totalLinesAdded: 0,
        totalLinesRemoved: 0,
        files: [],
        commits: [],
      };
    }

    for (const c of commits) {
      const contrib = contributors[c.author];
      if (!contrib) continue;

      contrib.totalLinesAdded += c.linesAdded || 0;
      contrib.totalLinesRemoved += c.linesRemoved || 0;
      if (c.files) {
        for (const f of c.files) {
          if (!contrib.files.includes(f)) contrib.files.push(f);
        }
      }
      contrib.commits.push(c);
    }

    return contributors;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { GitAnalyzer };
'use strict';

// ============================================================================
// COMMIT FILTER
// ============================================================================

class CommitFilter {
  constructor(config) {
    this.lineChangeThreshold = config?.lineChangeThreshold ?? 100;
    this.maxImportantCommits = config?.maxImportantCommits ?? 5;
  }

  totalLinesChanged(commit) {
    return (commit.linesAdded || 0) + (commit.linesRemoved || 0);
  }

  filterBySize(commits) {
    return commits.filter(c => this.totalLinesChanged(c) >= this.lineChangeThreshold);
  }

  groupByAuthor(commits) {
    const groups = {};
    for (const c of commits) {
      const author = c.author || 'unknown';
      if (!groups[author]) groups[author] = [];
      groups[author].push(c);
    }
    return groups;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { CommitFilter };
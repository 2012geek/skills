/**
 * Generate a JSON report from summary and changes
 *
 * @param {Object} summary - Summary statistics and metadata
 * @param {Array<Object>} changes - Array of change objects
 * @returns {Object} Report object with summary, changes, and timestamp
 */
function generateReport(summary, changes) {
  // Create report object, preserving null/undefined
  const report = {
    summary: summary,
    changes: changes,
    timestamp: new Date().toISOString()
  };

  // Default empty object/array if undefined (but not null)
  if (report.summary === undefined) {
    report.summary = {};
  }

  if (report.changes === undefined) {
    report.changes = [];
  }

  // Merge summary properties to top level for easy access
  if (summary && typeof summary === 'object') {
    Object.keys(summary).forEach(key => {
      // Don't override existing top-level properties
      if (!(key in report)) {
        report[key] = summary[key];
      }
    });
  }

  return report;
}

module.exports = { generateReport };

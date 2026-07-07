class Deduplicator {
  deduplicate(findings) {
    if (!findings || findings.length === 0) return [];

    const merged = {};
    const unique = [];

    for (const finding of findings) {
      const key = `${finding.file}:${finding.line}`;
      if (merged[key]) {
        // Same file+line from different agents — merge sources
        if (!merged[key].sources.includes(finding.source)) {
          merged[key].sources.push(finding.source);
        }
        // Keep higher severity
        const severityOrder = ['security', 'critical', 'medium', 'low'];
        const currentIdx = severityOrder.indexOf(merged[key].severity);
        const newIdx = severityOrder.indexOf(finding.severity);
        if (newIdx < currentIdx) merged[key].severity = finding.severity;
      } else {
        merged[key] = {
          ...finding,
          sources: [finding.source]
        };
        unique.push(merged[key]);
      }
    }

    return unique;
  }
}

module.exports = { Deduplicator };

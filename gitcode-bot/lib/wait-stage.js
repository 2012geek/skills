class WaitStage {
  shouldProceed(issue, projectConfig) {
    const waitHours = projectConfig.waitHours ?? 24;

    if (!issue.createdAt) return true;

    const elapsed = (Date.now() - new Date(issue.createdAt).getTime()) / (1000 * 60 * 60);
    return elapsed >= waitHours;
  }
}

module.exports = { WaitStage };

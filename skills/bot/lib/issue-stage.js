const { IssueManager } = require('./issue-manager');

class IssueStage {
  constructor(issueManager) {
    this.issueManager = issueManager;
  }

  async checkDuplicate(owner, repo, finding) {
    return await this.issueManager.findDuplicate(owner, repo, finding);
  }

  async run(confirmedFindings, projectConfig) {
    const { owner, repo } = projectConfig;
    const issueRecords = [];

    for (const finding of confirmedFindings) {
      try {
        // Check for duplicate before creating
        const duplicate = await this.issueManager.findDuplicate(owner, repo, finding);
        if (duplicate) {
          issueRecords.push({
            issueNumber: duplicate.number,
            findingId: finding.id,
            status: 'open',
            branch: null,
            owner,
            repo
          });
          continue;
        }

        const issue = await this.issueManager.createIssue(
          owner, repo, finding, finding.verifyTest
        );
        issueRecords.push(issue);
      } catch (e) {
        console.warn(`Failed to create Issue for finding ${finding.id}: ${e.message}`);
      }
    }

    return issueRecords;
  }
}

module.exports = { IssueStage };

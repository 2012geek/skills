class IssueManager {
  constructor(gitcodeApi) {
    this.api = gitcodeApi;
  }

  async createIssue(owner, repo, finding, verifyTest) {
    const title = `[${finding.severity}] ${finding.title}`;
    const body = this._formatBody(finding, verifyTest);

    const result = await this.api.createIssue({
      title,
      body,
      labels: 'bot-detected'
    });

    return {
      issueNumber: result.number,
      findingId: finding.id,
      verifyTest,
      status: 'open',
      branch: null,
      owner,
      repo
    };
  }

  async listOpenIssues(owner, repo) {
    return await this.api.listIssues('bot-detected');
  }

  async closeIssue(owner, repo, issueNumber) {
    return await this.api.closeIssue(issueNumber);
  }

  async commentOnIssue(owner, repo, issueNumber, comment) {
    return await this.api.commentOnIssue(issueNumber, comment);
  }

  async findDuplicate(owner, repo, finding) {
    const existing = await this.listOpenIssues(owner, repo);
    return existing.find(i => {
      const body = i.body || '';
      return body.includes(finding.file) && body.includes(`${finding.line}`);
    });
  }

  _formatBody(finding, verifyTest) {
    let body = `**File**: ${finding.file}\n**Line**: ${finding.line}\n\n${finding.description}\n\n`;

    if (finding.suggestion) {
      body += `**Suggested fix**: ${finding.suggestion}\n\n`;
    }

    if (verifyTest && verifyTest.testCode) {
      body += `**Reproduction test**:\n\`\`\`\n${verifyTest.testCode}\n\`\`\`\n\n`;
      body += `**Test result**: ${verifyTest.testResult}\n`;
    }

    return body;
  }
}

module.exports = { IssueManager };

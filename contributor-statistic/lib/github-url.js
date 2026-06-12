'use strict';

// ============================================================================
// GITHUB URL BUILDER
// ============================================================================

class GitHubUrlBuilder {
  constructor(remoteUrl) {
    if (!remoteUrl) {
      throw new Error('remoteUrl is required');
    }

    let normalized = remoteUrl;

    // SSH format: git@github.com:org/repo.git
    const sshMatch = remoteUrl.match(/^git@([^:]+):([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (sshMatch) {
      normalized = `https://${sshMatch[1]}/${sshMatch[2]}/${sshMatch[3]}`;
    }

    // HTTPS format: https://github.com/org/repo.git
    const httpsMatch = normalized.match(/^https:\/\/([^/]+)\/([^/]+)\/([^/.]+)(?:\.git)?$/);
    if (!httpsMatch) {
      throw new Error(`Cannot parse remote URL: ${remoteUrl}`);
    }

    this.host = httpsMatch[1];
    this.org = httpsMatch[2];
    this.repoName = httpsMatch[3];
    this.baseUrl = `https://${this.host}/${this.org}/${this.repoName}`;
  }

  commitUrl(hash) {
    return `${this.baseUrl}/commit/${hash}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { GitHubUrlBuilder };
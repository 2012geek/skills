const fs = require('fs');
const path = require('path');

const EMPTY_STATE = {
  findings: [],
  issues: [],
  fixes: [],
  prs: [],
  lastScanAt: null
};

class StateStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  }

  _filePath(owner, repo) {
    return path.join(this.stateDir, `${owner}_${repo}.json`);
  }

  load(owner, repo) {
    const filePath = this._filePath(owner, repo);
    if (!fs.existsSync(filePath)) return { ...EMPTY_STATE, findings: [], issues: [], fixes: [], prs: [] };
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  }

  save(owner, repo, state) {
    const filePath = this._filePath(owner, repo);
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
  }

  addFinding(owner, repo, finding) {
    const state = this.load(owner, repo);
    if (!finding.id) {
      finding.id = `f-auto-${state.findings.length + 1}`;
    }
    state.findings.push(finding);
    this.save(owner, repo, state);
    return finding;
  }

  updateFinding(owner, repo, findingId, updates) {
    const state = this.load(owner, repo);
    const finding = state.findings.find(f => f.id === findingId);
    if (finding) Object.assign(finding, updates);
    this.save(owner, repo, state);
  }

  addIssue(owner, repo, issueRecord) {
    const state = this.load(owner, repo);
    state.issues.push(issueRecord);
    this.save(owner, repo, state);
    return issueRecord;
  }

  updateIssue(owner, repo, issueNumber, updates) {
    const state = this.load(owner, repo);
    const issue = state.issues.find(i => i.issueNumber === issueNumber);
    if (issue) Object.assign(issue, updates);
    this.save(owner, repo, state);
  }

  addFix(owner, repo, fixAttempt) {
    const state = this.load(owner, repo);
    state.fixes.push(fixAttempt);
    this.save(owner, repo, state);
  }

  addPR(owner, repo, prRecord) {
    const state = this.load(owner, repo);
    state.prs.push(prRecord);
    this.save(owner, repo, state);
  }

  getApprovedIssues(owner, repo) {
    const state = this.load(owner, repo);
    return state.issues.filter(i => i.status === 'open');
  }

  getLastScanAt(owner, repo) {
    return this.load(owner, repo).lastScanAt;
  }

  setLastScanAt(owner, repo, timestamp) {
    const state = this.load(owner, repo);
    state.lastScanAt = timestamp;
    this.save(owner, repo, state);
  }
}

module.exports = { StateStore };

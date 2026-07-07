#!/usr/bin/env node
/**
 * gitcode-bot CLI — Infrastructure operations Claude calls via Bash.
 *
 * Every command outputs { ok: true|false, ... } JSON.
 * Claude parses the JSON and uses the data in its pipeline.
 */

const { ConfigManager } = require('../lib/config-manager');
const { StateStore } = require('../lib/state-store');
const { Deduplicator } = require('../lib/deduplicator');
const { IssueManager } = require('../lib/issue-manager');
const { IssueStage } = require('../lib/issue-stage');
const { WaitStage } = require('../lib/wait-stage');
const { PRManager } = require('../lib/pr-manager');
const { TestDiscovery } = require('../lib/test-discovery');
const { TestRunner } = require('../lib/test-runner');
const { GitCodeAPI, GitManager } = require('@skills/gitcode-sdk');
const path = require('path');
const os = require('os');

const STATE_DIR = process.env.GITCODE_BOT_STATE_DIR || path.join(os.homedir(), '.gitcode-bot', 'state');
const REPOS_DIR = path.join(os.homedir(), '.gitcode-bot', 'repos');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      args[key] = argv[i + 1];
    }
  }
  return args;
}

function resolveProject(config, projectStr) {
  const [owner, repo] = projectStr.split('/');
  const project = config.projects.find(p => p.owner === owner && p.repo === repo);
  if (!project) throw new Error(`Project ${owner}/${repo} not found in config`);
  return project;
}

function createApi(project) {
  return new GitCodeAPI({
    gitcode: {
      token: project.gitcodeToken || project.gitcode?.token || process.env.GITCODE_TOKEN,
      baseUrl: project.baseUrl || project.gitcode?.baseUrl || 'https://api.gitcode.com',
      owner: project.owner,
      repo: project.repo
    }
  });
}

function output(result) {
  console.log(JSON.stringify(result));
}

function outputError(error) {
  output({ ok: false, error: error.message || String(error) });
}

async function handleCommand(command, args) {
  const configPathOverride = process.env.GITCODE_BOT_CONFIG_PATH;
  const configManager = new ConfigManager(configPathOverride ? { configPath: configPathOverride } : {});

  switch (command) {
    // ─── Config ────────────────────────────────────────────
    case 'init': {
      const config = await configManager.init({ projects: [], bot: {} });
      output({ ok: true, configPath: configManager.configPath });
      break;
    }
    case 'config': {
      try {
        const config = configManager.load();
        output({ ok: true, projects: config.projects });
      } catch (e) {
        outputError(e);
      }
      break;
    }

    // ─── Status ───────────────────────────────────────────
    case 'status': {
      try {
        const config = configManager.load();
        const stateStore = new StateStore(STATE_DIR);
        const projectStatuses = [];

        for (const proj of config.projects) {
          const state = stateStore.load(proj.owner, proj.repo);
          const api = createApi(proj);
          const issueManager = new IssueManager(api);
          let remoteIssues = [];
          try {
            remoteIssues = await issueManager.listOpenIssues(proj.owner, proj.repo);
          } catch (e) {
            // API may fail, continue with empty list
          }

          projectStatuses.push({
            owner: proj.owner,
            repo: proj.repo,
            findings: state.findings.length,
            botIssues: state.issues.length,
            remoteIssues: remoteIssues.length,
            remoteIssueList: remoteIssues.map(i => ({ number: i.number, title: i.title, state: i.state })),
            fixes: state.fixes.length,
            prs: state.prs.length,
            lastScanAt: state.lastScanAt
          });
        }
        output({ ok: true, projects: projectStatuses });
      } catch (e) {
        outputError(e);
      }
      break;
    }

    // ─── State ─────────────────────────────────────────────
    case 'state-get': {
      const { project } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      const state = stateStore.load(owner, repo);
      output({ ok: true, ...state });
      break;
    }
    case 'state-add-finding': {
      const { project, finding } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      const parsedFinding = JSON.parse(finding);
      if (!parsedFinding.id) {
        const state = stateStore.load(owner, repo);
        parsedFinding.id = `f-auto-${state.findings.length + 1}`;
      }
      stateStore.addFinding(owner, repo, parsedFinding);
      output({ ok: true, id: parsedFinding.id });
      break;
    }
    case 'state-update-finding': {
      const { project, id, status } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.updateFinding(owner, repo, id, { status });
      output({ ok: true });
      break;
    }
    case 'state-add-issue': {
      const { project, issue } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.addIssue(owner, repo, JSON.parse(issue));
      output({ ok: true });
      break;
    }
    case 'state-update-issue': {
      const { project, number, status } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.updateIssue(owner, repo, parseInt(number), { status });
      output({ ok: true });
      break;
    }
    case 'state-set-scan-time': {
      const { project, time } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.setLastScanAt(owner, repo, time);
      output({ ok: true });
      break;
    }
    case 'state-add-fix': {
      const { project, fix } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.addFix(owner, repo, JSON.parse(fix));
      output({ ok: true });
      break;
    }
    case 'state-add-pr': {
      const { project, pr } = args;
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      stateStore.addPR(owner, repo, JSON.parse(pr));
      output({ ok: true });
      break;
    }

    // ─── Dedup ─────────────────────────────────────────────
    case 'dedup': {
      const { findings } = args;
      const deduplicator = new Deduplicator();
      const merged = deduplicator.deduplicate(JSON.parse(findings));
      output({ ok: true, merged });
      break;
    }

    // ─── Issues ────────────────────────────────────────────
    case 'issue-create': {
      const { project, finding, test } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const issueManager = new IssueManager(api);
      const parsedFinding = JSON.parse(finding);
      const parsedTest = test ? JSON.parse(test) : null;
      const result = await issueManager.createIssue(proj.owner, proj.repo, parsedFinding, parsedTest);
      output({ ok: true, issueNumber: result.issueNumber, status: result.status });
      break;
    }
    case 'issue-list': {
      const { project } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const issueManager = new IssueManager(api);
      const issues = await issueManager.listOpenIssues(proj.owner, proj.repo);
      output({ ok: true, issues });
      break;
    }
    case 'issue-close': {
      const { project, number } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const issueManager = new IssueManager(api);
      await issueManager.closeIssue(proj.owner, proj.repo, parseInt(number));
      output({ ok: true });
      break;
    }
    case 'issue-comment': {
      const { project, number, body } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const issueManager = new IssueManager(api);
      await issueManager.commentOnIssue(proj.owner, proj.repo, parseInt(number), body);
      output({ ok: true });
      break;
    }
    case 'issue-check-dup': {
      const { project, finding } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const issueManager = new IssueManager(api);
      const parsedFinding = JSON.parse(finding);
      const duplicate = await issueManager.findDuplicate(proj.owner, proj.repo, parsedFinding);
      output({ ok: true, duplicate: duplicate ? { number: duplicate.number } : null });
      break;
    }

    // ─── Wait ──────────────────────────────────────────────
    case 'wait-check': {
      const { project, number } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const stateStore = new StateStore(STATE_DIR);
      const [owner, repo] = project.split('/');
      const state = stateStore.load(owner, repo);
      const issue = state.issues.find(i => i.issueNumber === parseInt(number));
      const waitStage = new WaitStage();
      const shouldProceed = waitStage.shouldProceed(issue || {}, proj);
      output({ ok: true, shouldProceed });
      break;
    }

    // ─── Tests ─────────────────────────────────────────────
    case 'test-discover': {
      const { 'repo-path': repoPath } = args;
      const testDiscovery = new TestDiscovery();
      const command = await testDiscovery.discover(repoPath);
      output({ ok: true, command });
      break;
    }
    case 'test-run': {
      const { command: testCommand, 'repo-path': repoPath } = args;
      const testRunner = new TestRunner();
      const result = await testRunner.run(testCommand, repoPath);
      output({ ok: true, ...result });
      break;
    }

    // ─── Git ───────────────────────────────────────────────
    case 'git-clone': {
      const { project } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const gitManager = new GitManager({ reposDir: REPOS_DIR });
      const cloneUrl = `https://gitcode.com/${proj.owner}/${proj.repo}.git`;
      const localPath = await gitManager.cloneRepo(cloneUrl, proj.owner, proj.repo);
      output({ ok: true, localPath });
      break;
    }
    case 'git-branch': {
      const { 'repo-path': repoPath, name } = args;
      const gitManager = new GitManager({ reposDir: REPOS_DIR });
      await gitManager.createBranch(repoPath, name);
      output({ ok: true });
      break;
    }
    case 'git-push': {
      const { 'repo-path': repoPath, name } = args;
      const gitManager = new GitManager({ reposDir: REPOS_DIR });
      await gitManager.pushBranch(repoPath, name);
      output({ ok: true });
      break;
    }

    // ─── PR ────────────────────────────────────────────────
    case 'pr-create': {
      const { project, number, branch, title, body } = args;
      const config = configManager.load();
      const proj = resolveProject(config, project);
      const api = createApi(proj);
      const prManager = new PRManager(api);

      const issue = {
        issueNumber: parseInt(number),
        title: title
      };
      const fixResult = { patch: 'applied' };
      const result = await prManager.createPR(issue, fixResult, proj);
      output({ ok: true, prNumber: result.prNumber, status: result.status });
      break;
    }

    default:
      outputError(new Error(`Unknown command: ${command}. Available: init, config, status, state-get, state-add-finding, state-update-finding, state-add-issue, state-update-issue, state-set-scan-time, state-add-fix, state-add-pr, dedup, issue-create, issue-list, issue-close, issue-comment, issue-check-dup, wait-check, test-discover, test-run, git-clone, git-branch, git-push, pr-create`));
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    outputError(new Error('Usage: node cli.js <command> [--key value ...]'));
    process.exit(1);
  }
  const command = argv[0];
  const args = parseArgs(argv.slice(1));

  try {
    await handleCommand(command, args);
  } catch (e) {
    outputError(e);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { handleCommand, parseArgs, output, outputError };

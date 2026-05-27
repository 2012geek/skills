const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CACHE_DIR = path.join(os.tmpdir(), 'weekly-tracker-cache');

async function ensureRepo(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const git = simpleGit();

  if (fs.existsSync(path.join(repoDir, '.git'))) {
    try {
      await git.cwd(repoDir).fetch('origin');
      await git.cwd(repoDir).checkout(project.default_branch || project.defaultBranch || 'main');
      await git.cwd(repoDir).pull('origin', project.default_branch || project.defaultBranch || 'main');
    } catch (err) {
      console.warn(`Pull failed for ${project.name}, using cached data: ${err.message}`);
    }
  } else {
    fs.mkdirSync(repoDir, { recursive: true });
    const cloneUrl = project.clone_url || project.cloneUrl;
    try {
      if (cloneUrl.startsWith('/') || cloneUrl.startsWith('.')) {
        // Local path: use --shared for efficiency
        await git.clone(cloneUrl, repoDir, ['--single-branch', '--branch', project.default_branch || project.defaultBranch || 'main']);
      } else {
        await git.clone(cloneUrl, repoDir, ['--single-branch', '--branch', project.default_branch || project.defaultBranch || 'main']);
      }
    } catch (err) {
      console.error(`Clone failed for ${project.name}: ${err.message}`);
      return false;
    }
  }
  return true;
}

async function collectProjectCommits(project, weekStart, weekEnd, options = {}) {
  const repoDir = path.join(CACHE_DIR, project.name);

  if (!fs.existsSync(path.join(repoDir, '.git'))) {
    const ok = await ensureRepo(project);
    if (!ok) return null;
  }

  const localGit = simpleGit(repoDir);

  const logArgs = ['--no-merges'];
  if (options.shaAfter) {
    logArgs.push(`${options.shaAfter}..HEAD`);
  } else {
    logArgs.push('--after', weekStart);
    logArgs.push('--before', weekEnd);
  }
  const logResult = await localGit.log(logArgs);

  const commits = logResult.all || [];

  if (commits.length === 0) {
    return {
      projectId: null,
      weekStart,
      weekEnd,
      commitCount: 0,
      filesChanged: 0,
      additions: 0,
      deletions: 0,
      topAuthors: [],
      commitMessages: [],
      rawLog: '',
      thisWeekDescription: '',
    };
  }

  const authorMap = {};
  const fileSet = new Set();
  let totalAdditions = 0;
  let totalDeletions = 0;
  const commitMessages = [];

  for (const commit of commits) {
    const author = commit.author_name;
    authorMap[author] = (authorMap[author] || 0) + 1;

    let changedFiles = [];
    try {
      const diff = await localGit.diffSummary([`${commit.hash}~1`, commit.hash]);
      totalAdditions += diff.insertions || 0;
      totalDeletions += diff.deletions || 0;
      for (const f of diff.files || []) {
        if (f.file) {
          fileSet.add(f.file);
          changedFiles.push({ file: f.file, plus: f.insertions || 0, minus: f.deletions || 0 });
        }
      }
    } catch {
      // Skip diff for initial commits or merge commits
    }

    let diff = '';
    try {
      diff = await localGit.show([commit.hash, '--format=']);
      if (diff.length > 3000) diff = diff.substring(0, 3000) + '\n... [truncated]';
    } catch {
      diff = '';
    }

    commitMessages.push({
      hash: commit.hash.substring(0, 7),
      message: commit.message,
      author,
      date: commit.date,
      files: changedFiles,
      diff,
    });
  }

  const topAuthors = Object.entries(authorMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, commits: count }));

  const rawLog = commits.map((c) => `${c.hash.substring(0, 7)} ${c.author_name}: ${c.message}`).join('\n');

  return {
    projectId: null,
    weekStart,
    weekEnd,
    commitCount: commits.length,
    filesChanged: fileSet.size,
    additions: totalAdditions,
    deletions: totalDeletions,
    topAuthors,
    commitMessages,
    rawLog,
    thisWeekDescription: '',
  };
}

async function readKeyFiles(project, filePaths) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const files = {};
  for (const fp of filePaths) {
    const fullPath = path.join(repoDir, fp);
    try {
      if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        files[fp] = content.length > 8000
          ? content.substring(0, 8000) + '\n... [truncated]'
          : content;
      }
    } catch {
      files[fp] = '[unreadable]';
    }
  }
  return files;
}

async function getHeadSha(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  const log = await localGit.log(['-1', '--format=%H']);
  return log.latest?.hash || null;
}

async function getFirstCommitDate(project) {
  const repoDir = path.join(CACHE_DIR, project.name);
  const localGit = simpleGit(repoDir);
  try {
    const rootHash = await localGit.raw(['rev-list', '--max-parents=0', 'HEAD']);
    const hash = rootHash.trim().split('\n')[0];
    if (!hash) return null;
    const log = await localGit.log(['-1', hash]);
    return log.latest?.date || null;
  } catch {
    return null;
  }
}

module.exports = { ensureRepo, collectProjectCommits, readKeyFiles, getHeadSha, getFirstCommitDate };

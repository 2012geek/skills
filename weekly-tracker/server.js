const express = require('express');
const path = require('path');
const { getWeeklyReports, getAllWeekStarts, getTargetForProject, getWeekSummaryStats, getProjectsRangeData, getProjectTimeline } = require('./lib/db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/week/:date', (req, res) => {
  try {
    const weekStart = req.params.date;
    const reports = getWeeklyReports(weekStart);
    const stats = getWeekSummaryStats(weekStart);

    const projects = reports.map((r) => {
      const target = getTargetForProject(r.project_id);
      return {
        name: r.project_name,
        platform: r.platform,
        owner: r.owner,
        repo: r.repo,
        commitCount: r.commit_count,
        filesChanged: r.files_changed,
        additions: r.additions,
        deletions: r.deletions,
        topAuthors: JSON.parse(r.top_authors || '[]'),
        commitMessages: JSON.parse(r.commit_messages || '[]').map(({ diff, files, ...rest }) => rest),
        summary: r.summary,
        thisWeekDescription: r.this_week_description,
        target: target ? {
          goal: target.target,
          description: target.description,
          setAt: target.set_at,
          overallProgress: target.overall_progress,
        } : null,
      };
    });

    res.json({ weekStart, stats, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weeks', (_req, res) => {
  try {
    const weeks = getAllWeekStarts();
    res.json(weeks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weeks/range', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const data = getProjectsRangeData(from, to);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/project/:name/timeline', (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to query params are required' });
    }
    const data = getProjectTimeline(req.params.name, from, to);
    if (!data) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;

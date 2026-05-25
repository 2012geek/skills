const express = require('express');
const path = require('path');
const { getWeeklyReports, getAllWeekStarts, getTargetForProject, getWeekSummaryStats, getCachedAnswer, cacheAnswer } = require('./lib/db');
const { askQuestion } = require('./lib/llm');

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
        commitMessages: JSON.parse(r.commit_messages || '[]'),
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

app.post('/api/ask', async (req, res) => {
  try {
    const { question, weekStart } = req.body;
    if (!question || !weekStart) {
      return res.status(400).json({ error: 'question and weekStart are required' });
    }

    const cached = getCachedAnswer(weekStart, question);
    if (cached) {
      return res.json({ answer: cached.answer, cached: true });
    }

    const reports = getWeeklyReports(weekStart);
    if (reports.length === 0) {
      return res.json({ answer: 'No data available for that week.' });
    }

    const weekData = reports.map((r) => ({
      project: r.project_name,
      commits: r.commit_count,
      authors: JSON.parse(r.top_authors || '[]'),
      commitMessages: JSON.parse(r.commit_messages || '[]').slice(0, 50),
      progressDescription: r.this_week_description,
    }));

    const answer = await askQuestion(question, weekData);
    cacheAnswer(weekStart, question, answer);

    res.json({ answer, cached: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;

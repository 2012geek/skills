---
name: weekly-tracker
description: "Multi-project git timeline tracker. Collect git activity across projects and view project timelines with LLM-powered progress reports."
---

# Weekly Project Tracker

## Overview

Tracks git activity across multiple projects on different platforms (GitHub, AtomicGit, GitLab, etc.). Features a project timeline dashboard with activity charts and LLM-generated progress reports.

## Commands

- `/weekly-tracker collect` — Pull git data and generate timeline reports
- `/weekly-tracker serve` — Start the project timeline dashboard

## Setup

1. Copy `config.example.json` to `config.json` and configure your projects
2. Set platform tokens (e.g., `GITHUB_TOKEN`, `ATOMICGIT_TOKEN`) as env vars
3. Run `npm run collect` to pull your first weekly report
4. Run `npm run serve` to start the dashboard at http://localhost:3456

## Configuration

See `config.example.json` for the full configuration format. Each project needs: name, platform, owner, repo, cloneUrl. Optional: target goal with description and set date.

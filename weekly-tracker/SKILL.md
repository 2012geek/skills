---
name: weekly-tracker
description: "Weekly multi-project git activity tracker. Use when you need to collect weekly git commits across projects, generate LLM-powered progress reports, or start the dashboard server. Supports GitHub, AtomicGit, GitLab, and other git platforms."
---

# Weekly Project Tracker

## Overview

Tracks weekly git activity across multiple projects on different platforms (GitHub, AtomicGit, GitLab, etc.). Features a web dashboard with LLM-generated progress summaries and a Q&A chat powered by Claude API.

## Commands

- `/weekly-tracker collect` — Pull this week's git data and generate reports
- `/weekly-tracker serve` — Start the web dashboard server
- `/weekly-tracker summary` — Print the LLM weekly summary to terminal

## Setup

1. Copy `config.example.json` to `config.json` and configure your projects
2. Set platform tokens (e.g., `GITHUB_TOKEN`, `ATOMICGIT_TOKEN`) as env vars
3. Run `npm run collect` to pull your first weekly report
4. Run `npm run serve` to start the dashboard at http://localhost:3456

## Configuration

See `config.example.json` for the full configuration format. Each project needs: name, platform, owner, repo, cloneUrl. Optional: target goal with description and set date.

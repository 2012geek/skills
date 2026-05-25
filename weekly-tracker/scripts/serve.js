#!/usr/bin/env node

const path = require('path');
const app = require(path.join(__dirname, '..', 'server'));
const { loadConfig } = require(path.join(__dirname, '..', 'lib', 'config'));
const { getDb } = require(path.join(__dirname, '..', 'lib', 'db'));

const config = loadConfig();
const port = config.server?.port || 3456;
const host = config.server?.host || '0.0.0.0';

getDb();

app.listen(port, host, () => {
  console.log(`Weekly Tracker running at http://localhost:${port}`);
  console.log('Press Ctrl+C to stop');
});

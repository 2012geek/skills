#!/usr/bin/env node

/**
 * Development server with live reload
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3000;
const DIST_DIR = path.join(process.cwd(), 'dist');
const INDEX_FILE = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function handler(req, res) {
  let filePath = INDEX_FILE;

  if (req.url !== '/' && req.url !== '/index.html') {
    filePath = path.join(DIST_DIR, req.url);
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('404 Not Found');
      return;
    }

    // Inject live reload script
    if (ext === '.html' || ext === '') {
      const liveReloadScript = `
        <script>
          const ws = new WebSocket('ws://localhost:${PORT + 1}');
          ws.onmessage = () => location.reload();
        </script>
      `;
      data = data.toString().replace('</body>', liveReloadScript + '</body>');
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function watchFiles() {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ port: PORT + 1 });

  console.log('📡 Watching for changes...');

  const chokidar = require('chokidar');
  const watcher = chokidar.watch('slides.md', {
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('change', () => {
    console.log('📝 slides.md changed, rebuilding...');
    const build = spawn('node', [path.join(__dirname, 'build.js'), 'slides.md'], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    build.on('close', (code) => {
      console.log(`✅ Rebuild complete (${code === 0 ? 'success' : 'failed'})`);

      // Notify all connected clients
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send('reload');
        }
      });
    });
  });
}

function start() {
  if (!fs.existsSync(INDEX_FILE)) {
    console.error('❌ dist/index.html not found. Run "npm run build" first.');
    process.exit(1);
  }

  const server = http.createServer(handler);

  server.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📄 Open http://localhost:${PORT} in your browser`);

    // Start watching for changes
    try {
      watchFiles();
    } catch (err) {
      console.log('⚠️  Live reload not available. Install chokidar and ws for auto-reload:');
      console.log('   npm install chokidar ws --save-dev');
    }
  });
}

if (require.main === module) {
  start();
}

module.exports = { start };

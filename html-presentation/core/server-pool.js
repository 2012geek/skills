const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

class SlidevServer {
  constructor(port, entryFile = null) {
    this.port = port;
    this.process = null;
    this.url = `http://localhost:${port}`;
    this.ready = false;
    this.entryFile = entryFile;
  }

  async start() {
    const slidevBin = path.join(__dirname, '../node_modules/.bin/slidev');

    // Use existing slides.md if no entry file provided
    if (!this.entryFile) {
      // Try to use existing .slidev-temp/slides.md
      const existingSlides = path.join(__dirname, '../.slidev-temp/slides.md');
      try {
        await fs.access(existingSlides);
        this.entryFile = existingSlides;
      } catch {
        // Create a default entry file
        this.entryFile = await this.createDefaultEntry();
      }
    }

    // Spawn Slidev server with port and entry file
    // IMPORTANT: Use 'pipe' for stdin to keep the process alive
    // If stdin is 'ignore' or closed, Slidev will exit immediately
    this.process = spawn('node', [
      slidevBin,
      this.entryFile,
      '--port', this.port.toString(),
      '--no-open'
    ], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Handle process errors
    this.process.on('error', (error) => {
      // Log but don't throw - process may still start
      console.error(`[SlidevServer] Process error for port ${this.port}:`, error.message);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      this.ready = false;
      // Code 143 is SIGTERM (128+15), which is expected during cleanup
      if (code !== null && code !== 0 && code !== 143) {
        console.error(`[SlidevServer] Process exited with code ${code}`);
      }
    });

    // Wait for server to be ready
    await this.waitForReady();
    this.ready = true;

    return this;
  }

  async createDefaultEntry() {
    const tempDir = path.join(os.tmpdir(), 'slidev-server-pool');
    await fs.mkdir(tempDir, { recursive: true });

    const entryFile = path.join(tempDir, `entry-${Date.now()}.md`);

    // Use minimal working frontmatter
    const content = `---
theme: seriph
highlighter: shiki
lineNumbers: false
drawings:
  persist: false
editor: false
transition: slide
download: false
---

# Slidev Server

Server is running on port ${this.port}

---

## Slide 2

Content here
`;
    await fs.writeFile(entryFile, content, 'utf-8');
    return entryFile;
  }

  async waitForReady() {
    const maxWait = 15000;
    const start = Date.now();
    let lastError = null;

    while (Date.now() - start < maxWait) {
      try {
        // Use native fetch (Node.js 18+)
        const response = await fetch(this.url, {
          method: 'GET',
          headers: {
            'Accept': 'text/html'
          }
        });

        if (response.ok || response.status === 200) {
          return;
        }
      } catch (e) {
        // Server not ready yet, save last error
        lastError = e;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Slidev server failed to start at ${this.url}: ${lastError?.message || 'Unknown error'}`);
  }

  async stop() {
    if (this.process) {
      try {
        // Close stdin first to allow graceful shutdown
        if (this.process.stdin) {
          this.process.stdin.end();
        }

        // Try graceful shutdown first
        this.process.kill('SIGTERM');

        // Wait for process to exit
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            // If still running after 2 seconds, force kill
            if (this.process.exitCode === null) {
              this.process.kill('SIGKILL');
            }
            resolve();
          }, 2000);

          this.process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      } catch (error) {
        // Ignore cleanup errors
      }

      this.process = null;
      this.ready = false;
    }

    // Only clean up entry files we created (not existing ones)
    if (this.entryFile && this.entryFile.includes('slidev-server-pool')) {
      try {
        await fs.unlink(this.entryFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  isRunning() {
    return this.process !== null && this.process.exitCode === null && this.ready;
  }
}

class ServerPool {
  constructor(options = {}) {
    this.maxServers = options.maxServers || 3;
    this.portStart = options.portStart || 3031;
    this.servers = [];
    this.available = [];
    // Queue to prevent TOCTOU race condition in acquire
    this.acquireQueue = Promise.resolve();
  }

  async acquire() {
    // Queue this acquire operation to prevent race condition
    this.acquireQueue = this.acquireQueue.then(() => this._acquireImpl());
    return this.acquireQueue;
  }

  async _acquireImpl() {
    // Return available server if exists
    if (this.available.length > 0) {
      const server = this.available.pop();
      if (server.isRunning()) {
        return server;
      }
      // Server died, remove from pool
      this.servers = this.servers.filter(s => s !== server);
    }

    // Create new server if under limit
    if (this.servers.length < this.maxServers) {
      const port = this.portStart + this.servers.length;
      const server = new SlidevServer(port);
      await server.start();
      this.servers.push(server);
      return server;
    }

    throw new Error(`No servers available in pool (max: ${this.maxServers}, active: ${this.servers.length})`);
  }

  release(server) {
    if (server && server.isRunning()) {
      this.available.push(server);
    }
  }

  async closeAll() {
    const stopPromises = this.servers.map(async (server) => {
      try {
        await server.stop();
      } catch (error) {
        // Ignore individual stop errors
      }
    });

    await Promise.all(stopPromises);
    this.servers = [];
    this.available = [];
  }

  getStats() {
    return {
      total: this.servers.length,
      available: this.available.length,
      inUse: this.servers.length - this.available.length,
      maxServers: this.maxServers
    };
  }
}

module.exports = { SlidevServer, ServerPool };

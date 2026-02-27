const { SlidevRenderer } = require('../../core/slidev-renderer');
const { ServerPool } = require('../../core/server-pool');

describe('SlidevRenderer Integration', () => {
  let pool;

  test('should start Slidev server and render slide', async () => {
    pool = new ServerPool({ maxServers: 1, portStart: 3100 });
    const renderer = new SlidevRenderer();

    const server = await pool.acquire();
    const result = await renderer.render(server, '# Test Slide');

    expect(result.url).toMatch(/http:\/\/localhost:/);
    expect(server.process).toBeDefined();

    await pool.release(server);
    await pool.closeAll();
  }, 30000);

  afterEach(async () => {
    // Cleanup the test's pool if it exists
    if (pool) {
      await pool.closeAll();
      pool = null;
    }
  });
});

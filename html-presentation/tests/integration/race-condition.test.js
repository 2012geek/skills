const { SlidevRenderer } = require('../../core/slidev-renderer');
const { ServerPool } = require('../../core/server-pool');

describe('ServerPool Race Conditions', () => {
  test('should handle concurrent acquire calls without race condition', async () => {
    const pool = new ServerPool({ maxServers: 2, portStart: 3200 });
    const renderer = new SlidevRenderer();

    // Try to acquire 3 servers concurrently (max is 2)
    const acquirePromises = [
      pool.acquire(),
      pool.acquire(),
      pool.acquire()
    ];

    // First two should succeed, third should fail
    const results = await Promise.allSettled(acquirePromises);

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;

    expect(successCount).toBe(2);
    expect(failCount).toBe(1);

    // Cleanup
    await pool.closeAll();
  }, 30000);

  test('should render multiple slides in parallel', async () => {
    const pool = new ServerPool({ maxServers: 3, portStart: 3210 });
    const renderer = new SlidevRenderer();

    const slides = [
      { markdown: '# Slide 1', options: {} },
      { markdown: '# Slide 2', options: {} },
      { markdown: '# Slide 3', options: {} }
    ];

    const startTime = Date.now();
    const results = await renderer.renderBatch(pool, slides);
    const duration = Date.now() - startTime;

    // All slides should be rendered
    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.url).toMatch(/http:\/\/localhost:/);
    });

    // Parallel rendering should be faster than sequential
    // If sequential, would take ~3x server startup time
    // With 3 servers in parallel, should take ~1x startup time
    expect(duration).toBeLessThan(10000); // Should complete in under 10s

    await pool.closeAll();
  }, 45000);

  afterEach(async () => {
    // Cleanup any lingering servers
    // Note: This is a safety net, tests should clean up their own pools
  });
});

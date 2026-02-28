/**
 * Tests for VerifyFixLoop and AttemptHistory
 */

const { AttemptHistory } = require('../../core/attempt-history');

// Mock ES module dependencies
jest.mock('../../core/slidev-renderer', () => ({
  SlidevRenderer: jest.fn().mockImplementation(() => ({
    render: jest.fn().mockResolvedValue({
      url: 'http://localhost:3030'
    })
  }))
}));

jest.mock('../../core/puppeteer-capturer', () => ({
  PuppeteerCapturer: jest.fn().mockImplementation(() => ({
    capture: jest.fn().mockResolvedValue({
      buffer: Buffer.from('fake'),
      path: '/tmp/screenshot.png'
    }),
    close: jest.fn()
  }))
}));

jest.mock('../../core/llm-judge', () => ({
  LLMJudge: jest.fn().mockImplementation(() => ({
    judge: jest.fn().mockResolvedValue({
      approach: 'centered',
      layout: 85,
      hierarchy: 85,
      whitespace: 85,
      readability: 85,
      overall: 85,
      needsFix: false,
      issues: []
    }),
    evaluate: jest.fn().mockResolvedValue({
      approach: 'centered',
      layout: 85,
      hierarchy: 85,
      whitespace: 85,
      readability: 85,
      overall: 85,
      needsFix: false,
      issues: []
    }),
    close: jest.fn()
  }))
}));

jest.mock('../../core/llm-fixer', () => ({
  LLMFixer: jest.fn().mockImplementation(() => ({
    fix: jest.fn().mockResolvedValue('# Fixed Slide')
  }))
}));

jest.mock('../../core/server-pool', () => ({
  ServerPool: jest.fn().mockImplementation(() => ({
    acquire: jest.fn().mockResolvedValue({
      port: 3030,
      close: jest.fn()
    }),
    release: jest.fn(),
    closeAll: jest.fn()
  }))
}));

const { VerifyFixLoop } = require('../../core/verify-fix-loop');

describe('VerifyFixLoop', () => {
  describe('AttemptHistory', () => {
    let history;

    beforeEach(() => {
      history = new AttemptHistory();
    });

    test('should record attempts', () => {
      const attempt = {
        markdown: '# Test',
        iteration: 1,
        score: 75
      };

      const result = history.record('slide-1', attempt);

      expect(result).toHaveLength(1);
      expect(result[0].markdown).toBe('# Test');
      expect(result[0].timestamp).toBeDefined();
      expect(result[0].markdownHash).toBeDefined();
    });

    test('should get attempts for slide', () => {
      const attempt = { markdown: '# Test', iteration: 1 };
      history.record('slide-1', attempt);

      const result = history.get('slide-1');

      expect(result).toHaveLength(1);
      expect(result[0].markdown).toBe('# Test');
    });

    test('should return empty array for non-existent slide', () => {
      const result = history.get('non-existent');

      expect(result).toEqual([]);
    });

    test('should generate consistent hash for same markdown', () => {
      const hash1 = history.hash('# Test');
      const hash2 = history.hash('# Test');

      expect(hash1).toBe(hash2);
    });

    test('should detect loops', () => {
      const attempt = { markdown: '# Test', iteration: 1 };
      history.record('slide-1', attempt);

      const hasLoop = history.hasLoop('slide-1', '# Test');

      expect(hasLoop).toBe(true);
    });

    test('should not detect loop for different markdown', () => {
      const attempt = { markdown: '# Test', iteration: 1 };
      history.record('slide-1', attempt);

      const hasLoop = history.hasLoop('slide-1', '# Different');

      expect(hasLoop).toBe(false);
    });

    test('should clear specific slide', () => {
      history.record('slide-1', { markdown: '# Test' });
      history.clear('slide-1');

      expect(history.get('slide-1')).toEqual([]);
    });

    test('should clear all slides', () => {
      history.record('slide-1', { markdown: '# Test 1' });
      history.record('slide-2', { markdown: '# Test 2' });
      history.clearAll();

      expect(history.get('slide-1')).toEqual([]);
      expect(history.get('slide-2')).toEqual([]);
    });

    test('should get all history as object', () => {
      history.record('slide-1', { markdown: '# Test 1' });
      history.record('slide-2', { markdown: '# Test 2' });

      const all = history.getAll();

      expect(all).toHaveProperty('slide-1');
      expect(all).toHaveProperty('slide-2');
      expect(all['slide-1']).toHaveLength(1);
    });
  });

  describe('VerifyFixLoop', () => {
    let loop;

    beforeEach(() => {
      loop = new VerifyFixLoop({
        threshold: 80,
        maxIterations: 3,
        capturer: { headless: true },
        judge: { apiKey: 'test-key' },
        fixer: { apiKey: 'test-key' }
      });
    });

    afterEach(async () => {
      if (loop) {
        await loop.close();
      }
    });

    test('should initialize with default options', () => {
      const defaultLoop = new VerifyFixLoop();

      expect(defaultLoop.threshold).toBe(80);
      expect(defaultLoop.maxIterations).toBe(3);
    });

    test('should initialize with custom options', () => {
      expect(loop.threshold).toBe(80);
      expect(loop.maxIterations).toBe(3);
    });

    test('should have history instance', () => {
      expect(loop.history).toBeInstanceOf(AttemptHistory);
    });

    test('should have required components', () => {
      expect(loop.serverPool).toBeDefined();
      expect(loop.renderer).toBeDefined();
      expect(loop.capturer).toBeDefined();
      expect(loop.judge).toBeDefined();
      expect(loop.fixer).toBeDefined();
    });
  });
});

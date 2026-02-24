const { generateReport } = require('../report-generator');

describe('Report Generator', () => {
  describe('Basic report generation', () => {
    test('should generate report with summary', () => {
      const summary = {
        totalSlides: 3,
        slidesWithLayouts: 2,
        slidesFixed: 1
      };

      const changes = [
        { slideIndex: 0, type: 'layout', layout: 'center' }
      ];

      const result = generateReport(summary, changes);

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('timestamp');
    });

    test('should include timestamp in report', () => {
      const summary = { totalSlides: 1 };
      const changes = [];

      const result = generateReport(summary, changes);

      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('should preserve summary in report', () => {
      const summary = {
        totalSlides: 5,
        slidesWithLayouts: 3,
        slidesFixed: 2,
        customField: 'custom value'
      };

      const changes = [];

      const result = generateReport(summary, changes);

      expect(result.summary).toEqual(summary);
      expect(result.summary.totalSlides).toBe(5);
      expect(result.summary.customField).toBe('custom value');
    });

    test('should preserve changes array', () => {
      const summary = { totalSlides: 2 };
      const changes = [
        { slideIndex: 0, type: 'layout', layout: 'center' },
        { slideIndex: 1, type: 'css', cssInjected: true }
      ];

      const result = generateReport(summary, changes);

      expect(result.changes).toEqual(changes);
      expect(result.changes).toHaveLength(2);
    });
  });

  describe('Summary merging', () => {
    test('should merge summary into top level', () => {
      const summary = {
        totalSlides: 10,
        analyzed: 10,
        fixed: 5
      };

      const result = generateReport(summary, []);

      expect(result.totalSlides).toBe(10);
      expect(result.analyzed).toBe(10);
      expect(result.fixed).toBe(5);
    });

    test('should not modify original summary object', () => {
      const summary = { totalSlides: 3 };
      const originalKeyCount = Object.keys(summary).length;

      generateReport(summary, []);

      expect(Object.keys(summary).length).toBe(originalKeyCount);
    });

    test('should handle nested summary properties', () => {
      const summary = {
        totalSlides: 5,
        metrics: {
          imageHeavy: 2,
          codeHeavy: 1
        }
      };

      const result = generateReport(summary, []);

      expect(result.totalSlides).toBe(5);
      expect(result.metrics).toEqual({ imageHeavy: 2, codeHeavy: 1 });
    });
  });

  describe('Changes tracking', () => {
    test('should track layout changes', () => {
      const summary = { totalSlides: 1 };
      const changes = [
        { slideIndex: 0, type: 'layout', from: null, to: 'center' }
      ];

      const result = generateReport(summary, changes);

      expect(result.changes[0].type).toBe('layout');
      expect(result.changes[0].to).toBe('center');
    });

    test('should track CSS injection changes', () => {
      const summary = { totalSlides: 1 };
      const changes = [
        { slideIndex: 0, type: 'css', cssInjected: true, size: 1234 }
      ];

      const result = generateReport(summary, changes);

      expect(result.changes[0].type).toBe('css');
      expect(result.changes[0].cssInjected).toBe(true);
      expect(result.changes[0].size).toBe(1234);
    });

    test('should track multiple changes per slide', () => {
      const summary = { totalSlides: 2 };
      const changes = [
        { slideIndex: 0, type: 'layout', to: 'center' },
        { slideIndex: 0, type: 'css', cssInjected: true },
        { slideIndex: 1, type: 'layout', to: 'two-col' }
      ];

      const result = generateReport(summary, changes);

      expect(result.changes).toHaveLength(3);
      expect(result.changes.filter(c => c.slideIndex === 0)).toHaveLength(2);
      expect(result.changes.filter(c => c.slideIndex === 1)).toHaveLength(1);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty summary', () => {
      const result = generateReport({}, []);

      expect(result).toHaveProperty('summary', {});
      expect(result).toHaveProperty('changes', []);
      expect(result).toHaveProperty('timestamp');
    });

    test('should handle empty changes', () => {
      const summary = { totalSlides: 0 };
      const result = generateReport(summary, []);

      expect(result.changes).toEqual([]);
      expect(result.summary).toEqual(summary);
    });

    test('should handle null summary', () => {
      const result = generateReport(null, []);

      expect(result.summary).toBeNull();
      expect(result.changes).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });

    test('should handle null changes', () => {
      const summary = { totalSlides: 1 };
      const result = generateReport(summary, null);

      expect(result.changes).toBeNull();
      expect(result.summary).toEqual(summary);
    });

    test('should handle undefined summary', () => {
      const result = generateReport(undefined, []);

      expect(result.summary).toEqual({});
      expect(result.changes).toEqual([]);
    });

    test('should handle undefined changes', () => {
      const summary = { totalSlides: 1 };
      const result = generateReport(summary, undefined);

      expect(result.changes).toEqual([]);
      expect(result.summary).toEqual(summary);
    });
  });

  describe('Report structure', () => {
    test('should create valid JSON structure', () => {
      const summary = { totalSlides: 1 };
      const changes = [];

      const result = generateReport(summary, changes);

      // Should be serializable to JSON
      expect(() => JSON.stringify(result)).not.toThrow();
      const json = JSON.stringify(result);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('changes');
      expect(parsed).toHaveProperty('timestamp');
    });

    test('should maintain data types', () => {
      const summary = {
        totalSlides: 5,
        successRate: 0.85,
        title: 'Test Report',
        complete: true
      };
      const changes = [];

      const result = generateReport(summary, changes);

      expect(typeof result.totalSlides).toBe('number');
      expect(typeof result.successRate).toBe('number');
      expect(typeof result.title).toBe('string');
      expect(typeof result.complete).toBe('boolean');
    });
  });

  describe('Change metadata', () => {
    test('should preserve custom change properties', () => {
      const summary = { totalSlides: 1 };
      const changes = [
        {
          slideIndex: 0,
          type: 'custom',
          customField: 'value',
          nested: { a: 1, b: 2 }
        }
      ];

      const result = generateReport(summary, changes);

      expect(result.changes[0].customField).toBe('value');
      expect(result.changes[0].nested).toEqual({ a: 1, b: 2 });
    });

    test('should handle changes with arrays', () => {
      const summary = { totalSlides: 1 };
      const changes = [
        {
          slideIndex: 0,
          type: 'multi',
          items: ['a', 'b', 'c']
        }
      ];

      const result = generateReport(summary, changes);

      expect(Array.isArray(result.changes[0].items)).toBe(true);
      expect(result.changes[0].items).toHaveLength(3);
    });
  });

  describe('Timestamp format', () => {
    test('should generate ISO 8601 timestamp', () => {
      const summary = { totalSlides: 1 };
      const changes = [];

      const result = generateReport(summary, changes);

      // Should be parseable as Date
      const date = new Date(result.timestamp);
      expect(date instanceof Date).toBe(true);
      expect(!isNaN(date.getTime())).toBe(true);
    });

    test('should generate unique timestamps', async () => {
      const summary = { totalSlides: 1 };

      const result1 = generateReport(summary, []);

      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));

      const result2 = generateReport(summary, []);

      expect(result1.timestamp).not.toBe(result2.timestamp);
    });
  });

  describe('Real-world scenarios', () => {
    test('should generate complete fix report', () => {
      const summary = {
        totalSlides: 5,
        slidesAnalyzed: 5,
        slidesFixed: 3,
        cssInjected: true,
        layoutsApplied: ['center', 'two-col', 'default']
      };

      const changes = [
        { slideIndex: 0, type: 'analysis', detected: 'title', layout: 'center' },
        { slideIndex: 0, type: 'css', injected: true, rules: 42 },
        { slideIndex: 1, type: 'analysis', detected: 'content', layout: 'default' },
        { slideIndex: 2, type: 'analysis', detected: 'two-col', layout: 'two-col' },
        { slideIndex: 2, type: 'css', injected: true, rules: 38 }
      ];

      const result = generateReport(summary, changes);

      expect(result.summary.totalSlides).toBe(5);
      expect(result.summary.slidesFixed).toBe(3);
      expect(result.changes).toHaveLength(5);
      expect(result.changes.filter(c => c.type === 'css')).toHaveLength(2);
      expect(result.changes.filter(c => c.type === 'analysis')).toHaveLength(3);
    });

    test('should handle no-changes scenario', () => {
      const summary = {
        totalSlides: 2,
        slidesAnalyzed: 2,
        slidesFixed: 0
      };

      const result = generateReport(summary, []);

      expect(result.summary.slidesFixed).toBe(0);
      expect(result.changes).toEqual([]);
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('Data integrity', () => {
    test('should not mutate input summary', () => {
      const summary = { totalSlides: 3, fixed: 1 };
      const summaryCopy = { ...summary };

      generateReport(summary, []);

      expect(summary).toEqual(summaryCopy);
    });

    test('should not mutate input changes', () => {
      const changes = [
        { slideIndex: 0, type: 'test' },
        { slideIndex: 1, type: 'test' }
      ];
      const changesCopy = [...changes];

      generateReport({}, changes);

      expect(changes).toEqual(changesCopy);
    });
  });
});

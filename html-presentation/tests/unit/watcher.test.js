const { FileWatcher } = require('../../preview/watcher');
const fs = require('fs');
const path = require('path');

describe('FileWatcher', () => {
  let watcher;
  let testFile;

  beforeEach(() => {
    watcher = new FileWatcher();
    testFile = path.join(__dirname, '../fixtures/test-watch.md');
  });

  afterEach((done) => {
    if (watcher.isWatching()) {
      watcher.stop();
    }
    setTimeout(done, 100);
  });

  describe('watch', () => {
    test('should start watching file', async () => {
      await watcher.watch(testFile);
      expect(watcher.isWatching()).toBe(true);
    });

    test('should detect file changes', (done) => {
      watcher.watch(testFile);

      watcher.on('change', (filepath) => {
        expect(filepath).toBe(testFile);
        watcher.stop();
        done();
      });

      setTimeout(() => {
        fs.appendFileSync(testFile, '\nNew content');
      }, 200);
    }, 10000);

    test('should detect multiple changes', (done) => {
      let changeCount = 0;

      watcher.watch(testFile, { debounce: 50 }); // Shorter debounce for this test

      watcher.on('change', (filepath) => {
        changeCount++;
        if (changeCount === 2) {
          expect(changeCount).toBe(2);
          watcher.stop();
          done();
        }
      });

      setTimeout(() => {
        fs.appendFileSync(testFile, '\nChange 1');
        setTimeout(() => {
          fs.appendFileSync(testFile, '\nChange 2');
        }, 300); // Even longer gap to ensure debounce fires twice
      }, 300);
    }, 15000); // Increased timeout to 15 seconds
  });

  describe('stop', () => {
    test('should stop watching file', async () => {
      await watcher.watch(testFile);
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    test('should handle stop when not watching', async () => {
      const result = await watcher.stop();
      expect(result).toBe(false);
    });
  });

  describe('debounce', () => {
    test('should debounce rapid changes', (done) => {
      let callCount = 0;

      watcher.watch(testFile, { debounce: 100 });

      watcher.on('change', () => {
        callCount++;
      });

      setTimeout(() => {
        // Make 3 rapid changes
        fs.appendFileSync(testFile, '\n1');
        fs.appendFileSync(testFile, '\n2');
        fs.appendFileSync(testFile, '\n3');

        // Should only trigger once after debounce
        // Wait for debounce timer (100ms) + some buffer
        setTimeout(() => {
          expect(callCount).toBe(1);
          watcher.stop();
          done();
        }, 400);
      }, 200);
    }, 10000);
  });
});

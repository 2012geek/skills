const {
  PreviewManager,
  FileWatcher,
  ExportManager
} = require('../../../preview/index');

describe('Preview Index', () => {
  test('should export all preview modules', () => {
    expect(PreviewManager).toBeDefined();
    expect(FileWatcher).toBeDefined();
    expect(ExportManager).toBeDefined();
  });

  test('should be able to instantiate exported classes', () => {
    expect(new PreviewManager()).toBeInstanceOf(PreviewManager);
    expect(new FileWatcher()).toBeInstanceOf(FileWatcher);
    expect(new ExportManager()).toBeInstanceOf(ExportManager);
  });
});

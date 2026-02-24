const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { createBackup, restoreBackup } = require('../backup-manager');

describe('Backup Manager', () => {
  let tempDir;
  let testFilePath;
  let testContent;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = path.join(os.tmpdir(), `backup-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create test file
    testFilePath = path.join(tempDir, 'test.md');
    testContent = '# Test Slide\n\nOriginal content';
    await fs.writeFile(testFilePath, testContent, 'utf8');
  });

  afterEach(async () => {
    // Cleanup temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('createBackup', () => {
    test('should create a timestamped backup file', async () => {
      const backupPath = await createBackup(testFilePath);

      expect(backupPath).toBeDefined();
      expect(typeof backupPath).toBe('string');

      // Check backup file exists
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);

      // Check backup content matches original
      const backupContent = await fs.readFile(backupPath, 'utf8');
      expect(backupContent).toBe(testContent);
    });

    test('should use .backup extension with timestamp', async () => {
      const backupPath = await createBackup(testFilePath);

      expect(backupPath).toMatch(/\.backup-\d{14}$/);
      expect(backupPath).toContain('test.md.backup-');
    });

    test('should create backup in same directory as original', async () => {
      const backupPath = await createBackup(testFilePath);
      const backupDir = path.dirname(backupPath);

      expect(backupDir).toBe(tempDir);
    });

    test('should throw error if file does not exist', async () => {
      const nonExistentFile = path.join(tempDir, 'nonexistent.md');

      await expect(createBackup(nonExistentFile)).rejects.toThrow();
    });

    test('should preserve exact file content', async () => {
      // Test with special characters
      const specialContent = `---
layout: center
---

# Special Characters

> Quotes: "double" and 'single'
> Code: \`backticks\`
> Chinese: 你好世界
> Emoji: 🎉

\`\`\`javascript
const test = "special";
\`\`\`
`;

      await fs.writeFile(testFilePath, specialContent, 'utf8');
      const backupPath = await createBackup(testFilePath);
      const backupContent = await fs.readFile(backupPath, 'utf8');

      expect(backupContent).toBe(specialContent);
    });

    test('should handle multiple backups of same file', async () => {
      const backupPath1 = await createBackup(testFilePath);
      // Wait at least 1 second to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1100));
      const backupPath2 = await createBackup(testFilePath);

      expect(backupPath1).not.toBe(backupPath2);

      // Both should exist
      const backup1Exists = await fs.access(backupPath1).then(() => true).catch(() => false);
      const backup2Exists = await fs.access(backupPath2).then(() => true).catch(() => false);

      expect(backup1Exists).toBe(true);
      expect(backup2Exists).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    test('should restore content from backup to original file', async () => {
      const backupPath = await createBackup(testFilePath);

      // Modify original file
      const modifiedContent = '# Modified\n\nThis is modified';
      await fs.writeFile(testFilePath, modifiedContent, 'utf8');

      // Restore from backup
      await restoreBackup(backupPath, testFilePath);

      // Verify original file has backup content
      const restoredContent = await fs.readFile(testFilePath, 'utf8');
      expect(restoredContent).toBe(testContent);
    });

    test('should throw error if backup file does not exist', async () => {
      const nonExistentBackup = path.join(tempDir, 'nonexistent.md.backup-12345678901234');

      await expect(restoreBackup(nonExistentBackup, testFilePath)).rejects.toThrow();
    });

    test('should restore to different target path', async () => {
      const backupPath = await createBackup(testFilePath);
      const targetPath = path.join(tempDir, 'restored.md');

      await restoreBackup(backupPath, targetPath);

      const restoredContent = await fs.readFile(targetPath, 'utf8');
      expect(restoredContent).toBe(testContent);
    });

    test('should overwrite existing target file', async () => {
      const backupPath = await createBackup(testFilePath);

      // Create target file with different content
      const targetPath = path.join(tempDir, 'target.md');
      await fs.writeFile(targetPath, 'Old content', 'utf8');

      await restoreBackup(backupPath, targetPath);

      const restoredContent = await fs.readFile(targetPath, 'utf8');
      expect(restoredContent).toBe(testContent);
    });

    test('should preserve exact backup content during restore', async () => {
      const specialContent = `---
layout: center
---

# Test

\`\`\`js
console.log("test");
\`\`\`
`;

      await fs.writeFile(testFilePath, specialContent, 'utf8');
      const backupPath = await createBackup(testFilePath);

      // Modify original
      await fs.writeFile(testFilePath, 'Modified', 'utf8');

      await restoreBackup(backupPath, testFilePath);

      const restoredContent = await fs.readFile(testFilePath, 'utf8');
      expect(restoredContent).toBe(specialContent);
    });
  });

  describe('Integration: backup and restore cycle', () => {
    test('should successfully backup, modify, and restore', async () => {
      // Original state
      const originalContent = await fs.readFile(testFilePath, 'utf8');

      // Create backup
      const backupPath = await createBackup(testFilePath);

      // Modify original
      const modifiedContent = '# Modified\n\nChanges here';
      await fs.writeFile(testFilePath, modifiedContent, 'utf8');

      // Verify modification
      let currentContent = await fs.readFile(testFilePath, 'utf8');
      expect(currentContent).toBe(modifiedContent);

      // Restore from backup
      await restoreBackup(backupPath, testFilePath);

      // Verify restoration
      currentContent = await fs.readFile(testFilePath, 'utf8');
      expect(currentContent).toBe(originalContent);
    });
  });
});

const fs = require('fs').promises;
const path = require('path');

/**
 * Create a timestamped backup of a file
 *
 * @param {string} filePath - Path to the file to backup
 * @returns {Promise<string>} Path to the created backup file
 * @throws {Error} If file does not exist or cannot be read
 */
async function createBackup(filePath) {
  // Validate input
  if (!filePath || typeof filePath !== 'string') {
    throw new TypeError('filePath must be a non-empty string');
  }

  const absolutePath = path.resolve(filePath);

  // Check if file exists
  try {
    await fs.access(absolutePath);
  } catch (error) {
    throw new Error(`File not found: ${absolutePath}`);
  }

  // Read original file content
  const content = await fs.readFile(absolutePath, 'utf8');

  // Generate timestamp for backup filename
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.]/g, '')
    .slice(0, 14); // Format: YYYYMMDDHHmmss

  // Create backup filename
  const backupPath = `${absolutePath}.backup-${timestamp}`;

  // Write backup file
  await fs.writeFile(backupPath, content, 'utf8');

  return backupPath;
}

/**
 * Restore a file from a backup
 *
 * @param {string} backupPath - Path to the backup file
 * @param {string} targetPath - Path where to restore the file (optional, defaults to original)
 * @returns {Promise<void>}
 * @throws {Error} If backup file does not exist or cannot be read
 */
async function restoreBackup(backupPath, targetPath) {
  // Validate inputs
  if (!backupPath || typeof backupPath !== 'string') {
    throw new TypeError('backupPath must be a non-empty string');
  }

  if (!targetPath || typeof targetPath !== 'string') {
    throw new TypeError('targetPath must be a non-empty string');
  }

  const absoluteBackupPath = path.resolve(backupPath);
  const absoluteTargetPath = path.resolve(targetPath);

  // Check if backup exists
  try {
    await fs.access(absoluteBackupPath);
  } catch (error) {
    throw new Error(`Backup file not found: ${absoluteBackupPath}`);
  }

  // Read backup content
  const content = await fs.readFile(absoluteBackupPath, 'utf8');

  // Write to target file (will overwrite if exists)
  await fs.writeFile(absoluteTargetPath, content, 'utf8');
}

module.exports = { createBackup, restoreBackup };

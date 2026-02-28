/**
 * Metadata 工具模块
 * 用于管理同步元数据
 */

import { promises as fs } from 'fs';

/**
 * 加载元数据
 * @param {string} metaFile - 元数据文件路径
 * @returns {Promise<object|null>} 元数据对象或 null
 */
export async function loadMetadata(metaFile) {
  try {
    const data = await fs.readFile(metaFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * 保存元数据
 * @param {string} metaFile - 元数据文件路径
 * @param {object} metadata - 元数据对象
 */
export async function saveMetadata(metaFile, metadata) {
  await fs.writeFile(metaFile, JSON.stringify(metadata, null, 2));
}

/**
 * 创建新的元数据对象
 * @param {object} stats - 统计信息
 * @param {Set} remoteDocs - 远程文档集合
 * @returns {object} 元数据对象
 */
export function createMetadata(stats, remoteDocs) {
  return {
    lastSync: new Date().toISOString(),
    stats: {
      scanned: stats.scanned,
      unchanged: stats.unchanged,
      changed: stats.changed,
      added: stats.added,
      updated: stats.updated,
      deleted: stats.deleted,
      failed: stats.failed,
      totalFolders: stats.totalFolders
    },
    remoteDocs: Array.from(remoteDocs)
  };
}

/**
 * 获取上次同步时间
 * @param {object} metadata - 元数据对象
 * @returns {string} 格式化的时间字符串
 */
export function getLastSyncTime(metadata) {
  if (!metadata || !metadata.lastSync) {
    return '从未同步';
  }
  return new Date(metadata.lastSync).toLocaleString('zh-CN');
}

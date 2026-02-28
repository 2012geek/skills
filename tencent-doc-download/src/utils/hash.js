/**
 * Hash 工具模块
 * 用于生成内容哈希，支持忽略特定字段
 */

import crypto from 'crypto';

/**
 * 生成内容哈希（忽略 synced_at 时间戳）
 * @param {string} content - 文档内容
 * @param {object} options - 配置选项
 * @param {string[]} options.ignorePatterns - 要忽略的正则模式列表
 * @returns {string} MD5 哈希值
 */
export function generateHash(content, options = {}) {
  const { ignorePatterns = [/synced_at: .+\n/g] } = options;

  let processedContent = content;

  // 移除忽略的模式
  for (const pattern of ignorePatterns) {
    processedContent = processedContent.replace(pattern, '');
  }

  return crypto.createHash('md5').update(processedContent).digest('hex');
}

/**
 * 对比两个内容的哈希是否相同
 * @param {string} content1 - 内容1
 * @param {string} content2 - 内容2
 * @returns {boolean} 是否相同
 */
export function compareContent(content1, content2) {
  return generateHash(content1) === generateHash(content2);
}

/**
 * 计算文件的哈希
 * @param {string} filePath - 文件路径
 * @returns {Promise<string>} MD5 哈希值
 */
export async function hashFile(filePath, fs) {
  const content = await fs.readFile(filePath, 'utf8');
  return generateHash(content);
}

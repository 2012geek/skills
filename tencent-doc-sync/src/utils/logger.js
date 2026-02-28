/**
 * Logger 工具模块
 * 提供统一的日志输出功能
 */

/**
 * 日志级别
 */
export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

let currentLevel = LogLevel.INFO;

/**
 * 设置日志级别
 * @param {number} level - 日志级别
 */
export function setLogLevel(level) {
  currentLevel = level;
}

/**
 * 格式化时间戳
 * @returns {string} 格式化的时间
 */
function getTimestamp() {
  return new Date().toLocaleTimeString('zh-CN');
}

/**
 * 调试日志
 * @param {string} message - 消息
 */
export function debug(message) {
  if (currentLevel <= LogLevel.DEBUG) {
    console.log(`[${getTimestamp()}] 🔍 ${message}`);
  }
}

/**
 * 信息日志
 * @param {string} message - 消息
 */
export function info(message) {
  if (currentLevel <= LogLevel.INFO) {
    console.log(message);
  }
}

/**
 * 警告日志
 * @param {string} message - 消息
 */
export function warn(message) {
  if (currentLevel <= LogLevel.WARN) {
    console.log(`⚠️  ${message}`);
  }
}

/**
 * 错误日志
 * @param {string} message - 消息
 */
export function error(message) {
  if (currentLevel <= LogLevel.ERROR) {
    console.error(`❌ ${message}`);
  }
}

/**
 * 成功日志
 * @param {string} message - 消息
 */
export function success(message) {
  console.log(`✅ ${message}`);
}

/**
 * 分隔线
 * @param {string} char - 分隔字符
 * @param {number} length - 长度
 */
export function separator(char = '=', length = 60) {
  console.log(char.repeat(length));
}

/**
 * 显示统计信息
 * @param {object} stats - 统计对象
 */
export function displayStats(stats) {
  separator();
  console.log('📊 同步统计');
  separator();

  console.log('\n📋 扫描结果:');
  console.log(`  • 总扫描文档: ${stats.scanned} 个`);
  console.log(`  • 无变化文档: ${stats.unchanged} 个`);
  console.log(`  • 需更新文档: ${stats.changed} 个`);

  console.log('\n🔧 执行操作:');
  console.log(`  • 新增: ${stats.added} 个`);
  console.log(`  • 更新: ${stats.updated} 个`);
  console.log(`  • 删除: ${stats.deleted} 个`);
  console.log(`  • 失败: ${stats.failed} 个`);

  console.log('\n📁 文件夹统计:');
  console.log(`  • 总文件夹数: ${stats.totalFolders} 个`);

  console.log('\n✅ 同步完成！');
  separator();
}

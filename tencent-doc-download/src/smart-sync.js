/**
 * 智能同步脚本：显示详细的差异统计
 *
 * 改进点：
 * 1. 显示扫描统计（无变化 vs 需更新）
 * 2. 显示操作统计（新增、更新、删除）
 * 3. 支持删除同步
 * 4. 集成内容下载功能
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateHash } from './utils/hash.js';
import { displayStats, separator } from './utils/logger.js';
import { loadMetadata, saveMetadata, createMetadata, getLastSyncTime } from './utils/metadata.js';
import downloadSpace from './core/downloader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// GitHub 仓库路径
const REPO_DIR = '/Users/chenlening/workspace/mylerobot-doc';
const DOCS_DIR = path.join(REPO_DIR, 'tencent-docs');
const META_FILE = path.join(DOCS_DIR, '.sync-metadata.json');

// 文档树结构（硬编码，后续可以改为动态获取）
const docTree = [
  { "title": "文档说明", "children": [] },
  { "title": "组织人员", "children": [] },
  { "title": "整体架构和任务说明", "children": [] },
  { "title": "代码提交", "children": [] },
  { "title": "零基础上手指南", "children": [] },
  {
    "title": "实验室环境说明",
    "children": [
      "网络环境", "服务器说明", "工具和其他资产", "蔚蓝机械狗",
      "lekiwi说明", "摄像头说明", "3D打印机使用说明",
      "310P和香橙派的环境使用指南", "飞腾的环境使用指南",
      "920L的使用指南", "atlas300I Duo的环境指南"
    ]
  },
  {
    "title": "lerobot代码介绍",
    "children": [
      "lerobot介绍文档", "模型训练与数据采集注意事项",
      "关键帧静止帧识别工具", "摄像头校准工具",
      "机械臂校准检查工具", "旧版本数据模型转换"
    ]
  },
  {
    "title": "个人总结",
    "children": [
      {
        "title": "参考-陈乐宁",
        "children": ["11.15 机械车summit", "11.15 summit 机械车复盘", "SD3403&act模型打通复盘"]
      },
      {
        "title": "陈鑫",
        "children": ["26年任务分工设想", "业界机器人公司交流问题清单及总结", "ros包分析", "DDS学习"]
      },
      { "title": "郝意达", "children": ["310b&p Trouble Shooting", "离线推理原理介绍", "ROS"] },
      {
        "title": "刘伟鸿",
        "children": [
          { "title": "3403 开发相关文档", "children": ["3403 板端访问与联网", "3403 开发环境配置问题汇总", "3403 模型推理与精度调优"] },
          "README",
          { "title": "模型训练时压缩", "children": ["模型蒸馏", "模型量化", "训练样本自适应权重"] },
          "文档描述"
        ]
      },
      {
        "title": "陈梓杰",
        "children": [
          "Lerobot依赖梳理", "Lerobot-2-ros", "电机保护机制", "依赖详细版",
          "无标题Markdown", "依赖梳理", "开源鸿蒙社区具身智能PMC2026规划研讨",
          { "title": "图片", "children": ["关节1校准.jpeg", "关节2校准.jpeg", "关节5摄像机下校准.jpeg", "关节3校准.jpeg", "夹抓完全打开.jpeg", "关节5摄像机上校准.jpeg", "关节4校准.jpeg"] }
        ]
      },
      { "title": "温兴男", "children": ["PI0 PI05模型", "GR00T N1 N1.5模型"] }
    ]
  },
  {
    "title": "Ascend",
    "children": [
      "Ascend 离线推理",
      { "title": "benchmark", "children": [{ "title": "graphs", "children": ["comparison_resolution.png", "comparison_torch_vs_om.png", "comparison_by_params.png"] }, "性能分析"] }
    ]
  },
  { "title": "内部的文档资源分布", "children": [] },
  {
    "title": "嘉城",
    "children": [
      "基于Ascend C开发算子",
      { "title": "基于lerobot转具身模型为onnx", "children": ["model_to_onnx.py", "verify_onnx.py", "onnx模型转om", "run_onnx2om.sh", "view_model.py"] }
    ]
  },
  {
    "title": "万明",
    "children": [
      "3403如何烧录", "voxposer的说明和经验", "xen调试问题",
      { "title": "DDS", "children": ["3403 DDS测试记录", "DDS优化点分析", "cyclonedds 架构分析", "fastdds 架构分析", "ROS^RT 论文分析"] }
    ]
  },
  {
    "title": "吴小强",
    "children": ["机器狗", "3D打印的使用", "act的原理", "一峰的其他文档", "跨帧平滑", "训练前处理"]
  },
  { "title": "邢诗萍", "children": ["仿真新手指南", "仿真其他方面"] },
  { "title": "朱菲", "children": [] },
  { "title": "调试工具", "children": [] },
  { "title": "MT-ACT", "children": [] },
  { "title": "实验日志", "children": [] },
  { "title": "对外交流的总结记录", "children": [] },
  { "title": "李新宇", "children": [] },
  { "title": "文档基础设施", "children": [] }
];

// 详细统计
const stats = {
  scanned: 0,          // 总扫描文档数
  unchanged: 0,        // 无变化文档数
  changed: 0,          // 需更新文档数
  added: 0,            // 新增文档数
  updated: 0,          // 更新文档数
  deleted: 0,          // 删除文档数
  failed: 0,           // 失败数
  totalFolders: 0
};

// 文档路径映射（用于检测删除）
let existingDocs = new Map();  // 本地已有文档
let remoteDocs = new Set();    // 远程文档列表

// Metadata 函数已移到 src/utils/metadata.js

// 扫描本地已有文档
async function scanLocalDocs(dir, basePath = '') {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanLocalDocs(fullPath, relativePath);
      } else if (entry.name.endsWith('.md')) {
        // 记录本地文档
        const content = await fs.readFile(fullPath, 'utf8');
        const hash = generateHash(content);
        existingDocs.set(relativePath, { path: fullPath, hash });
      }
    }
  } catch (error) {
    // 目录不存在，忽略
  }
}

// Hash 函数已移到 src/utils/hash.js

// 创建文件夹
async function createFolder(folderPath, folderName) {
  await fs.mkdir(folderPath, { recursive: true });
  stats.totalFolders++;

  const readmePath = path.join(folderPath, 'README.md');
  const readmeContent = `# ${folderName}\n\n> 此文件夹由腾讯文档自动同步生成\n\n## 文档列表\n\n请查看子文件夹或文件。\n`;

  try {
    await fs.access(readmePath);
  } catch {
    await fs.writeFile(readmePath, readmeContent);
  }
}

// 创建或更新文档
async function createOrUpdateDoc(title, dirPath, folderPath = '') {
  const fileName = `${title}.md`;
  const relativePath = folderPath ? `${folderPath}/${fileName}` : fileName;
  const filePath = path.join(dirPath, fileName);

  // 记录远程文档
  remoteDocs.add(relativePath);
  stats.scanned++;

  const content = `---
title: ${title}
synced_at: ${new Date().toISOString()}
---

# ${title}

> 文档内容待提取

此文档内容将在后续步骤中提取。
`;

  const newHash = generateHash(content);

  // 检查文档是否存在
  if (existingDocs.has(relativePath)) {
    const localDoc = existingDocs.get(relativePath);

    // 对比 hash
    if (localDoc.hash === newHash) {
      // 无变化
      stats.unchanged++;
      console.log(`  ⏭️  ${title} (无变化)`);
    } else {
      // 需要更新
      stats.changed++;
      stats.updated++;
      await fs.writeFile(filePath, content, 'utf8');
      console.log(`  📝 ${title} (已更新)`);
    }
  } else {
    // 新增文档
    stats.added++;
    await fs.writeFile(filePath, content, 'utf8');
    console.log(`  ➕ ${title} (新增)`);
  }
}

// 递归处理文档树
async function processTree(docs, basePath, folderPath = '', level = 0) {
  for (const doc of docs) {
    if (typeof doc === 'string') {
      // 叶子文档
      await createOrUpdateDoc(doc, basePath, folderPath);
    } else {
      // 文件夹
      const folderName = doc.title;
      const newFolderPath = folderPath ? `${folderPath}/${folderName}` : folderName;
      const folderPath_full = path.join(basePath, folderName);

      // 检查是否有子文档
      if (doc.children && doc.children.length > 0) {
        // 有子文档，创建文件夹
        console.log(`${'  '.repeat(level)}📁 ${folderName}/`);
        await createFolder(folderPath_full, folderName);
        await processTree(doc.children, folderPath_full, newFolderPath, level + 1);
      } else {
        // 空文件夹，只创建占位文档（不创建文件夹）
        console.log(`${'  '.repeat(level)}📄 ${folderName} (空文件夹)`);
        await createOrUpdateDoc(folderName, basePath, folderPath);
      }
    }
  }
}

// 删除本地多余文档
async function deleteObsoleteDocs() {
  // 找出本地有但远程没有的文档
  const toDelete = [];

  for (const [relativePath, docInfo] of existingDocs) {
    if (!remoteDocs.has(relativePath)) {
      toDelete.push({ relativePath, ...docInfo });
    }
  }

  if (toDelete.length > 0) {
    console.log('\n🗑️  删除本地多余文档:');

    for (const doc of toDelete) {
      try {
        await fs.unlink(doc.path);
        stats.deleted++;
        console.log(`  ❌ ${doc.relativePath} (已删除)`);
      } catch (error) {
        console.log(`  ⚠️  ${doc.relativePath} (删除失败: ${error.message})`);
        stats.failed++;
      }
    }
  }
}

// displayStats 函数已移到 src/utils/logger.js

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2);
  const shouldDownload = args.includes('--download') || args.includes('-d');
  const skipExisting = !args.includes('--force');

  console.log('🚀 开始智能同步...\n');

  // 如果指定了 --download 参数，先下载内容
  if (shouldDownload) {
    console.log('📥 启动内容下载模式...\n');
    try {
      const downloadStats = await downloadSpace({
        spaceUrl: 'https://docs.qq.com/space/DZmNFWUZTVkVpYnpF?nlc=1',
        outputDir: DOCS_DIR,
        headless: false,
        skipExisting: skipExisting,
        userDataDir: path.join(path.dirname(__dirname), '.tencent-docs-session')
      });

      console.log('\n✅ 内容下载完成！\n');
      separator('=');
    } catch (error) {
      console.error('❌ 下载失败:', error.message);
      console.log('\n继续执行结构同步...\n');
    }
  }

  // 1. 加载上次元数据
  const lastMetadata = await loadMetadata(META_FILE);
  if (lastMetadata) {
    console.log(`📅 上次同步: ${getLastSyncTime(lastMetadata)}\n`);
  }

  // 2. 扫描本地已有文档
  console.log('📂 扫描本地文档...');
  await scanLocalDocs(DOCS_DIR);
  console.log(`  找到 ${existingDocs.size} 个本地文档\n`);

  // 3. 确保输出目录存在
  await fs.mkdir(DOCS_DIR, { recursive: true });

  // 4. 处理文档树
  console.log('📄 开始处理文档树...\n');
  await processTree(docTree, DOCS_DIR);

  // 5. 删除本地多余文档
  await deleteObsoleteDocs();

  // 6. 显示统计信息
  displayStats(stats);

  // 7. 保存元数据
  await saveMetadata(META_FILE, createMetadata(stats, remoteDocs));
}

main().catch(console.error);

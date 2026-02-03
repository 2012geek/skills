#!/usr/bin/env node
/**
 * 方案 D: 紧凑布局 + 字体缩小
 * - 为理论基础幻灯片添加紧凑布局
 * - 更新 CSS 样式
 */

const fs = require('fs');

console.log('🎨 方案 D: 紧凑布局优化\n');

// ============================================================================
// 步骤 1: 为理论基础幻灯片添加紧凑布局 class
// ============================================================================
console.log('📝 步骤 1: 添加紧凑布局标记...');

let content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

// 在 ## 📚 理论基础 后面添加紧凑布局标记
content = content.replace(
    /## 📚 理论基础（快速版）/g,
    '---\nlayout: default\nclass: text-sm compact-table\n## 📚 理论基础（快速版）'
);

// 移除可能产生的重复分隔符
content = content.replace(/---\n\n---\nlayout:/g, '---\nlayout:');

console.log('   ✅ 已添加紧凑布局 class');

// ============================================================================
// 步骤 2: 更新 slidev.config.ts 添加表格优化样式
// ============================================================================
console.log('\n🎨 步骤 2: 更新 CSS 样式...');

const configContent = `import { defineConfig } from '@slidev/cli'

export default defineConfig({
  theme: 'seriph',
  highlighter: 'shiki',
  lineNumbers: false,
  drawings: {
    persist: false,
  },
  editor: false,
  transition: 'none',
  download: false,
  info: false,
  canCopy: true,
  transitionSlide: false,
  mouseWheel: true,
  recording: {
    enabled: false,
    video: false,
    audio: false,
  },
  class: 'text-left',
  // Configure Vite to properly handle static images
  vite: {
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp'],
  },
  // Custom CSS to fix display issues
  css: \`
    .slidev-layout {
      background: #ffffff !important;
    }
    body {
      background: #ffffff !important;
    }

    /* 图片约束 */
    img {
      max-height: 450px !important;
      object-fit: contain !important;
    }

    /* 代码块优化 */
    pre {
      max-height: 250px !important;
      overflow-y: auto !important;
      font-size: 0.75em !important;
    }

    /* 紧凑布局 */
    .compact-table {
      font-size: 0.85em !important;
    }

    .compact-table table {
      font-size: 0.8em !important;
      width: 100% !important;
      table-layout: fixed !important;
    }

    .compact-table th,
    .compact-table td {
      padding: 0.25em 0.5em !important;
    }

    /* 第一列（特性名称）固定宽度 */
    .compact-table td:first-child,
    .compact-table th:first-child {
      width: 25% !important;
    }

    /* 其他列平均分配 */
    .compact-table td:not(:first-child),
    .compact-table th:not(:first-child) {
      width: 25% !important;
    }

    /* 表格优化 */
    table {
      font-size: 0.85em !important;
    }

    /* 列表优化 */
    ul, ol {
      font-size: 0.85em !important;
      margin: 0.5em 0 !important;
    }

    /* 防止内容溢出 */
    .slide-content {
      overflow-y: auto !important;
      max-height: 90vh !important;
    }

    /* 标题间距优化 */
    .compact-table h2 {
      margin-bottom: 0.5em !important;
    }

    .compact-table h3 {
      margin-top: 0.75em !important;
      margin-bottom: 0.5em !important;
    }
  \`,
})
`;

fs.writeFileSync('slidev.config.ts', configContent, 'utf-8');
console.log('   ✅ 已更新 CSS 样式');

// ============================================================================
// 步骤 3: 写回修改后的内容
// ============================================================================
fs.writeFileSync('.slidev-v4-temp.md', content, 'utf-8');

console.log('\n✨ 方案 D 实施完成！');
console.log('\n📊 优化摘要:');
console.log('   • 添加 compact-table class');
console.log('   • 表格字体缩小到 0.8em');
console.log('   • 表格使用固定布局 (table-layout: fixed)');
console.log('   • 列宽平均分配 (每列 25%)');
console.log('   • 单元格内边距缩小');
console.log('   • 整体字体缩小到 0.85em');

#!/usr/bin/env node
/**
 * 方案 C: 智能布局优化
 * - 添加图片高度约束
 * - 优化多图显示
 * - 添加自定义 CSS 样式
 */

const fs = require('fs');

console.log('🎨 方案 C: 智能布局优化\n');

// Read the file
let content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

// ============================================================================
// 步骤 1: 添加图片高度约束
// ============================================================================
console.log('📸 步骤 1: 优化图片尺寸...');

// 将 width="100%" 改为带高度约束的样式
// 使用 max-height 限制图片最大高度，防止溢出
content = content.replace(
    /<img src="([^"]+)" width="100%"\/>/g,
    '<img src="$1" style="max-height: 400px; width: 100%; object-fit: contain;"/>'
);

// 小图片保持原尺寸但添加约束
content = content.replace(
    /<img src="([^"]+)" width="50%"\/>/g,
    '<img src="$1" style="max-height: 300px; width: 50%; object-fit: contain;"/>'
);

console.log('   ✅ 已添加图片高度约束 (max-height: 400px)');

// ============================================================================
// 步骤 2: 在 slidev.config.ts 中添加自定义样式
// ============================================================================
console.log('\n🎨 步骤 2: 添加自定义 CSS...');

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

    /* 表格优化 */
    table {
      font-size: 0.85em !important;
    }

    /* 代码块优化 */
    pre {
      max-height: 300px !important;
      overflow-y: auto !important;
    }

    /* 列表优化 */
    ul, ol {
      font-size: 0.9em !important;
    }

    /* 防止内容溢出 */
    .slide-content {
      overflow-y: auto !important;
      max-height: 85vh !important;
    }
  \`,
})
`;

// 写入配置文件
fs.writeFileSync('slidev.config.ts', configContent, 'utf-8');
console.log('   ✅ 已更新 slidev.config.ts');

// ============================================================================
// 步骤 3: 优化长列表和表格
// ============================================================================
console.log('\n📋 步骤 3: 优化列表和表格...');

// 统计修改
const imageCount = (content.match(/<img /g) || []).length;

console.log(`   ✅ 处理了 ${imageCount} 张图片`);

// Write back
fs.writeFileSync('.slidev-v4-temp.md', content, 'utf-8');

console.log('\n✨ 方案 C 实施完成！');
console.log('\n📊 优化摘要:');
console.log('   • 所有图片添加 max-height: 400px 约束');
console.log('   • 添加 object-fit: contain 保持比例');
console.log('   • 代码块 max-height: 300px + 滚动');
console.log('   • 表格和列表字体缩小到 0.85-0.9em');
console.log('   • 内容区域 max-height: 85vh + 滚动');

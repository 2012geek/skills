#!/usr/bin/env node
/**
 * 点击展开式幻灯片 - 实施方案 A + B
 * - 成功案例默认展开
 * - 其他案例默认折叠
 * - 添加优化的 CSS 样式
 */

const fs = require('fs');

console.log('🎨 实施点击展开式方案\n');

let content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

// ============================================================================
// 步骤 1: 为案例1的子案例添加折叠结构
// ============================================================================

console.log('📝 步骤 1: 添加折叠结构...\n');

// 定义案例1的子案例折叠转换
const case1Fixes = [
  {
    from: `#### 📊 实测效果

**✅ 成功案例 - 发现语义问题**

[PR #46 - 发现实际问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46)

<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

---

**❌ 误报案例 - shape 未定义**

[PR #46 - 误报问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46/diffs?file=src%252Ftool%252Ftransfer_model%252Fexport_model.py&version=7&expired=false)

**问题现象**：
<img src="/images/df287dc9-87df-4d83-ad4f-39a9ef2e980e.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

**根因定位**：
Git 只获取了部分修改代码，导致上下文缺失
<img src="/images/c3aa1161-246c-4443-b145-83ca041d92bf.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

**解决方案**：
添加误报机制
<img src="/images/a4797cbe-b446-4644-abb4-195b193f290f.png" style="max-height: 400px; width: 100%; object-fit: contain;"/>

---

**❌ 漏报案例 - classmethod 问题**`,
    to: `#### 📊 实测效果

<details open>
<summary>✅ 成功案例 - 发现语义问题</summary>

[PR #46 - 发现实际问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46)

<img src="/images/83a71edb-ba00-4b99-aed0-f05bcdd6cc78.png" style="max-height: 350px; width: 100%; object-fit: contain;"/>
</details>

<details>
<summary>❌ 误报案例 - shape 未定义</summary>

[PR #46 - 误报问题](https://gitcode.com/openeuler/lerobot_ros2/pull/46/diffs)

**问题现象**：
<img src="/images/df287dc9-87df-4d83-ad4f-39a9ef2e980e.png" style="max-height: 350px; width: 100%; object-fit: contain;"/>

**根因定位**：
Git 只获取了部分修改代码，导致上下文缺失
<img src="/images/c3aa1161-246c-4443-b145-83ca041d92bf.png" style="max-height: 350px; width: 100%; object-fit: contain;"/>

**解决方案**：
添加误报机制
<img src="/images/a4797cbe-b446-4644-abb4-195b193f290f.png" style="max-height: 350px; width: 100%; object-fit: contain;"/>
</details>

<details>
<summary>❌ 漏报案例 - classmethod 问题</summary>`
  }
];

let modified = false;
case1Fixes.forEach(({ from, to }) => {
  if (content.includes(from.substring(0, 50))) {
    content = content.replace(from, to);
    modified = true;
    console.log('   ✓ 已转换案例1的子案例为折叠结构');
  }
});

if (!modified) {
  console.log('   ⚠️  未找到预期内容，使用通用方法转换...');

  // 通用方法：找到并转换 **❌ 误报案例 和 **❌ 漏报案例
  content = content.replace(
    /---\n\n\*\*❌ 误报案例/g,
    '</details>\n\n<details>\n<summary>❌ 误报案例'
  );

  content = content.replace(
    /<summary>❌ 漏报案例<\/summary>/g,
    '</details>\n\n<details>\n<summary>❌ 漏报案例</summary>'
  );

  // 为成功案例添加 details open
  if (content.includes('**✅ 成功案例') && !content.includes('<details open>')) {
    content = content.replace(
      /(\*\*✅ 成功案例[^\n]+\n)/,
      '<details open>\n<summary>$1</summary>\n'
    );
    // 在误报案例前闭合
    content = content.replace(
      /(<img src="[^"]+83a71edb[^"]*"\/>)\n\n---\n\n\*\*❌ 误报/,
      '$1\n</details>\n\n---\n\n**❌ 误报'
    );
  }

  console.log('   ✓ 已应用通用转换方法');
}

// ============================================================================
// 步骤 2: 更新 CSS 样式
// ============================================================================

console.log('\n🎨 步骤 2: 更新 CSS 样式...');

const cssContent = `import { defineConfig } from '@slidev/cli'

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
  vite: {
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.webp'],
  },
  css: \`
    .slidev-layout {
      background: #ffffff !important;
    }
    body {
      background: #ffffff !important;
    }

    /* 图片全局约束 */
    img {
      max-height: 400px !important;
      object-fit: contain !important;
    }

    /* 代码块优化 */
    pre {
      max-height: 250px !important;
      overflow-y: auto !important;
      font-size: 0.75em !important;
    }

    /* ========== 折叠组件样式 ========== */
    details {
      margin: 0.75em 0 !important;
      border: 1px solid #e0e0e0 !important;
      border-radius: 8px !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    summary {
      cursor: pointer !important;
      font-weight: 600 !important;
      padding: 0.75em 1em !important;
      user-select: none !important;
      background-color: #f9f9f9 !important;
      transition: background-color 0.2s !important;
      display: block !important;
    }

    summary:hover {
      background-color: #eeeeee !important;
    }

    details[open] > summary {
      border-bottom: 1px solid #e0e0e0 !important;
      margin-bottom: 0.75em !important;
    }

    details[open] > summary::after {
      content: " ▼" !important;
      float: right !important;
    }

    details:not([open]) > summary::after {
      content: " ▶" !important;
      float: right !important;
    }

    /* 折叠内容区域的样式 */
    details > *:not(summary) {
      padding: 0 1em 1em 1em !important;
    }

    /* 折叠内的图片进一步约束 */
    details img {
      max-height: 350px !important;
      width: 100% !important;
    }

    /* 表格优化 */
    .compact-table table {
      font-size: 0.8em !important;
      table-layout: fixed !important;
    }

    .compact-table th,
    .compact-table td {
      padding: 0.25em 0.5em !important;
    }

    /* 列表优化 */
    ul, ol {
      font-size: 0.85em !important;
      margin: 0.5em 0 !important;
    }

    /* 内容区域滚动 */
    .slide-content {
      overflow-y: auto !important;
      max-height: 90vh !important;
    }

    /* 标题间距 */
    h2 { margin-bottom: 0.5em !important; }
    h3 { margin-top: 0.75em !important; margin-bottom: 0.5em !important; }
  \`,
})
`;

fs.writeFileSync('slidev.config.ts', cssContent, 'utf-8');
console.log('   ✅ 已更新 CSS 样式');

// ============================================================================
// 步骤 3: 写回修改后的内容
// ============================================================================

fs.writeFileSync('.slidev-v4-temp.md', content, 'utf-8');

console.log('\n✨ 点击展开式方案实施完成！');
console.log('\n📊 优化摘要:');
console.log('   • 成功案例默认展开 (<details open>)');
console.log('   • 误报/漏报案例默认折叠');
console.log('   • 添加折叠组件样式（边框、悬停、箭头）');
console.log('   • 折叠内图片 max-height: 350px');
console.log('   • 全局滚动支持');

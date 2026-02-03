#!/usr/bin/env node
/**
 * 修复幻灯片分割和图片尺寸问题
 * - 在每个案例标题前添加 --- 分隔符
 * - 将固定图片宽度改为自适应
 */

const fs = require('fs');

// Read the file
const content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

console.log('🔧 修复幻灯片分割和图片尺寸...\n');

// Step 1: 在每个案例标题前添加分隔符
// 查找所有 "### 案例X:" 开头的行
const lines = content.split('\n');
let newLines = [];
let inCaseSection = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // 检测是否是案例标题
  if (line.match(/^### 案例\d+：/)) {
    // 在案例标题前添加分隔符（如果前面没有）
    if (newLines.length > 0 && newLines[newLines.length - 1] !== '---') {
      newLines.push('---');
    }
    newLines.push(line);
    inCaseSection = true;
  } else {
    newLines.push(line);
  }
}

let fixedContent = newLines.join('\n');

// Step 2: 修复图片尺寸
console.log('📸 修复图片尺寸...');

// 将 width="800" 改为 width="100%"
fixedContent = fixedContent.replace(/width="800"/g, 'width="100%"');
// 将 width="1000" 改为 width="100%"
fixedContent = fixedContent.replace(/width="1000"/g, 'width="100%"');
// 将 width="400" 改为 width="50%"
fixedContent = fixedContent.replace(/width="400"/g, 'width="50%"');

// 统计修改
const slideCount = (fixedContent.match(/\n---\n### 案例\d+：/g) || []).length;
const imageFixes = (fixedContent.match(/width="100%"/g) || []).length;

console.log(`✅ 添加了 ${slideCount} 个案例分隔符`);
console.log(`✅ 修复了 ${imageFixes} 张图片的尺寸`);

// Write back
fs.writeFileSync('.slidev-v4-temp.md', fixedContent, 'utf-8');

console.log('\n✨ 修复完成！');

// 显示预览
console.log('\n📋 修复后的案例分割：');
const matches = fixedContent.match(/\n---\n### 案例[^:]+：[^\\n]+/g);
if (matches) {
  matches.forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.replace(/\n---\n### /, '').replace(/：.*/, '：')}`);
  });
}

#!/usr/bin/env node
/**
 * 清理连续的 --- 分隔符
 * 将多个连续的 --- 合并为一个
 */

const fs = require('fs');

console.log('🔧 清理连续的幻灯片分隔符...\n');

// Read the file
const content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

// 统计修复前的连续分隔符
const beforeCount = (content.match(/\n---\n\n---\n/g) || []).length +
                   (content.match(/\n---\n\n---\n\n---\n/g) || []).length;

console.log(`📊 发现 ${beforeCount} 处连续的分隔符`);

// 清理策略：
// 1. 将 \n---\n\n---\n\n---\n (3个) 替换为 \n---\n
// 2. 将 \n---\n\n---\n (2个) 替换为 \n---\n
// 3. 将 \n---\n---\n (2个紧挨) 替换为 \n---\n

let fixedContent = content;

// 清理三个连续的
fixedContent = fixedContent.replace(/\n---\n\n---\n\n---\n/g, '\n---\n');

// 清理两个连续的（有空白行）
fixedContent = fixedContent.replace(/\n---\n\n---\n/g, '\n---\n');

// 清理两个连续的（无空白行）
fixedContent = fixedContent.replace(/\n---\n---\n/g, '\n---\n');

// Write back
fs.writeFileSync('.slidev-v4-temp.md', fixedContent, 'utf-8');

console.log('✅ 已清理所有连续的分隔符\n');

// 验证
const afterContent = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');
const afterCount = (afterContent.match(/\n---\n\n---\n/g) || []).length +
                  (afterContent.match(/\n---\n\n---\n\n---\n/g) || []).length;

console.log(`✅ 验证: 修复后剩余 ${afterCount} 处连续分隔符`);

// 统计幻灯片数量
const slideCount = (afterContent.match(/\n---\n/g) || []).length + 1;
console.log(`✅ 当前幻灯片总数: ${slideCount}`);

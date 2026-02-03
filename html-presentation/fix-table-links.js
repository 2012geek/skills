#!/usr/bin/env node
/**
 * 方案 A: 简化表格中的链接文字
 * - 将完整的 GitHub URL 替换为简短的"查看 →"文字
 * - 保持链接功能完整
 */

const fs = require('fs');

console.log('🔧 方案 A: 简化表格链接文字\n');

// Read the file
let content = fs.readFileSync('.slidev-v4-temp.md', 'utf-8');

// ============================================================================
// 替换表格中的长链接为简短文字
// ============================================================================

console.log('📝 处理表格链接...\n');

const replacements = [
  // 案例1
  {
    from: '| [🔍 案例1：代码检视](#案例1代码检视-skill) | 自动审查 PR 代码质量 | code-review agent + Hooks | [gitcode-code-review](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-code-review) |',
    to: '| [🔍 案例1：代码检视](#案例1代码检视-skill) | 自动审查 PR 代码质量 | code-review agent + Hooks | [查看 →](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-code-review) |'
  },
  // 案例2
  {
    from: '| [🚀 案例2：自动提 PR](#案例2自动提-pr-skill) | 自动生成 PR 描述和测试用例 | Templates + Agents | [gitcode-pr](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-pr) |',
    to: '| [🚀 案例2：自动提 PR](#案例2自动提-pr-skill) | 自动生成 PR 描述和测试用例 | Templates + Agents | [查看 →](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-pr) |'
  },
  // 案例3
  {
    from: '| [🔧 案例3：门禁自动修复](#案例3门禁问题自动修复-skill) | CI/CD 门禁失败自动修复 | Page Analysis + Retry | [gitcode-ci-repair](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-ci-repair) |',
    to: '| [🔧 案例3：门禁自动修复](#案例3门禁问题自动修复-skill) | CI/CD 门禁失败自动修复 | Page Analysis + Retry | [查看 →](https://github.com/2012geek/mylerobot-doc/tree/main/skills/gitcode-ci-repair) |'
  },
  // 案例4 - 保持原样（链接到外部 PR）
  {
    from: '| [✅ 案例4：UT 自动添加](#案例4ut-自动添加) | 自动生成单元测试 | API Analysis + Mock Generation | - |',
    to: '| [✅ 案例4：UT 自动添加](#案例4ut-自动添加) | 自动生成单元测试 | API Analysis + Mock Generation | 原生能力 |'
  },
  // 案例5 - 保持原样（链接到外部 PR）
  {
    from: '| [🏗️ 案例5：AI 功能开发](#案例5ai-代码功能开发) | 重构视频转换代码 | Refactoring + Debugging | - |',
    to: '| [🏗️ 案例5：AI 功能开发](#案例5ai-代码功能开发) | 重构视频转换代码 | Refactoring + Debugging | 原生能力 |'
  },
];

let count = 0;
replacements.forEach(({ from, to }) => {
  if (content.includes(from)) {
    content = content.replace(from, to);
    count++;
    console.log(`   ✓ ${to.split('|')[1].trim()}`);
  }
});

// Write back
fs.writeFileSync('.slidev-v4-temp.md', content, 'utf-8');

console.log(`\n✅ 已简化 ${count} 个表格链接`);

// 验证修改
console.log('\n📊 修改后的表格预览:');
console.log('-' * 80);
const tableStart = content.indexOf('| [🔍 案例1');
const tableEnd = content.indexOf('\n---', tableStart);
if (tableStart > 0 && tableEnd > 0) {
  const table = content.substring(tableStart, tableEnd);
  const lines = table.split('\n');
  lines.slice(0, 8).forEach((line, i) => {
    if (line.trim()) console.log(line);
  });
}

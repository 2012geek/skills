#!/usr/bin/env node

/**
 * Initialize a new presentation project
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_TEMPLATE = `# 演示文稿标题

**由 Claude Code 创建**

---

## 第一张幻灯片

- 要点 1
- 要点 2
- 要点 3

---

## 代码示例

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

---

# 双栏布局

<div class="container">

<div class="column">

**左侧**

- 内容 A
- 内容 B

</div>

<div class="column">

**右侧**

- 内容 X
- 内容 Y

</div>

</div>

---

# 感谢观看

`;

const PACKAGE_JSON = {
  name: '',
  version: '1.0.0',
  description: 'HTML Presentation',
  scripts: {
    build: 'node ../../skills/html-presentation/scripts/build.js slides.md',
    dev: 'node ../../skills/html-presentation/scripts/serve.js'
  },
  dependencies: {
    marked: '^11.0.0'
  }
};

function init(name) {
  const dir = path.join(process.cwd(), name);

  if (fs.existsSync(dir)) {
    console.error(`❌ Directory "${name}" already exists`);
    process.exit(1);
  }

  // Create directory structure
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });

  // Write files
  PACKAGE_JSON.name = name;
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(PACKAGE_JSON, null, 2));
  fs.writeFileSync(path.join(dir, 'slides.md'), DEFAULT_TEMPLATE);
  fs.writeFileSync(path.join(dir, 'dist', '.gitkeep'), '');

  console.log(`✅ Created presentation: ${name}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${name}`);
  console.log(`  npm install`);
  console.log(`  # Edit slides.md`);
  console.log(`  npm run build`);
}

if (require.main === module) {
  const name = process.argv[2] || 'my-presentation';
  init(name);
}

module.exports = { init };

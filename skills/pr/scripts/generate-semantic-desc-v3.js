#!/usr/bin/env node

/**
 * LLM 驱动的语义化 PR 描述生成工具
 *
 * 使用 LLM API 分析文件修改内容，生成准确的 PR 描述
 *
 * 用法：
 *   node generate-semantic-desc-v3.js <prNumber>
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * 根据文件扩展名返回适合 markdown 代码块的语言标识
 */
function detectCodeLanguage(filename) {
  const ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  const map = {
    py: 'python',
    js: 'javascript',
    ts: 'typescript',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    toml: 'toml',
    md: 'markdown',
    rst: 'rst',
    html: 'html',
    css: 'css',
    scss: 'scss',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    c: 'c',
    h: 'c',
    cpp: 'cpp',
    hpp: 'cpp',
    cc: 'cpp',
    cs: 'csharp',
    rb: 'ruby',
    php: 'php',
    sql: 'sql',
    dockerfile: 'dockerfile',
  };
  const basename = filename.substring(filename.lastIndexOf('/') + 1).toLowerCase();
  if (basename === 'dockerfile' || basename.endsWith('.dockerfile')) return 'dockerfile';
  return map[ext] || '';
}

// 读取配置文件
function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在: ${configPath}\n请创建 config.json 文件并配置 GitCode token`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!config.gitcode || !config.gitcode.token) {
    throw new Error('配置文件中缺少 gitcode.token');
  }

  return config;
}

/**
 * 从 GitCode API 获取文件内容
 */
function fetchFileContent(owner, repo, filePath, ref, token) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.gitcode.com',
      port: 443,
      path: `/api/v5/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${ref}`,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'User-Agent': 'PR-Generator/3.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.content) {
            resolve(Buffer.from(json.content, 'base64').toString('utf-8'));
          } else {
            resolve('');
          }
        } catch (e) {
          resolve('');
        }
      });
    });

    req.on('error', () => resolve(''));
    req.setTimeout(5000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

/**
 * 调用 LLM API 分析文件修改
 * @param {string} prompt - 发送给 LLM 的提示
 * @returns {Promise<string>} LLM 的响应
 */
function callLLM(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    let protocol = 'https:';
    let baseUrl = 'api.anthropic.com';
    let basePort = 443;
    let basePath = '/v1/messages';
    let token = apiKey;

    try {
      const settingsPath = process.env.HOME + '/.claude/settings.json';
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.env && settings.env.ANTHROPIC_BASE_URL) {
          const customUrl = new URL(settings.env.ANTHROPIC_BASE_URL);
          protocol = customUrl.protocol;
          baseUrl = customUrl.hostname;
          basePort = customUrl.port ? parseInt(customUrl.port) : (protocol === 'https:' ? 443 : 80);
          const customPath = customUrl.pathname.replace(/\/$/, '');
          basePath = customPath + '/v1/messages';
          console.log('  [使用自定义 API 端点: ' + protocol + '//' + baseUrl + ':' + basePort + ']');
        }
      }
    } catch (e) {
      // 忽略配置读取错误，使用默认值
    }

    const transport = protocol === 'https:' ? https : http;

    const data = JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: '你是一个代码分析专家，擅长总结代码修改的功能点。请用简洁、准确的中文回答。',
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const options = {
      hostname: baseUrl,
      port: basePort,
      path: basePath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      }
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode !== 200) {
            reject(new Error('Claude API 返回错误: ' + res.statusCode + ' - ' + JSON.stringify(response)));
          } else if (response.content && response.content[0]) {
            resolve(response.content[0].text.trim());
          } else {
            console.warn('  [Claude API 响应格式异常: ' + JSON.stringify(response).substring(0, 200) + ']');
            resolve('');
          }
        } catch (e) {
          reject(new Error('Claude API 解析失败: ' + e.message + ' - 响应: ' + data.substring(0, 200)));
        }
      });
    });

    req.on('error', (err) => {
      console.warn('  [Claude API 请求失败: ' + err.message + ']');
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

/**
 * 使用 LLM 分析文件的修改内容
 * @param {string} filename - 文件名
 * @param {string} content - 文件内容
 * @param {string} apiKey - LLM API 密钥
 * @param {string} status - 文件状态 (added/modified/renamed)
 * @returns {Promise<string>} 文件修改的功能描述
 */
async function analyzeFileWithLLM(filename, content, apiKey, status) {
  if (!content || !apiKey) {
    return '';
  }

  // 只分析代码文件，限制内容长度
  const maxContentLength = 3000;
  const truncatedContent = content.length > maxContentLength
    ? content.substring(0, maxContentLength) + '\n... (内容已截断)'
    : content;

  // 根据文件状态调整提示词
  let statusHint = '';
  if (status === 'renamed') {
    statusHint = '注意：这个文件是重命名的，主要变化是路径或名称改变。';
  } else if (status === 'modified') {
    statusHint = '注意：这个文件是修改的，请总结主要修改内容。';
  } else if (status === 'added') {
    statusHint = '注意：这个文件是新添加的。';
  }

  const codeLang = detectCodeLanguage(filename);

  const prompt = `请分析以下文件的修改内容，总结其主要功能点：

文件名: ${filename}
文件状态: ${status || 'unknown'}
${statusHint}

文件内容:
\`\`\`${codeLang}
${truncatedContent}
\`\`\`

请用简洁的中文回答以下问题：
1. 这个文件的主要功能是什么？（不超过50字）
2. 如果是修改/重命名，主要变化是什么？
3. 如果添加了新参数或功能，请说明。

格式：
- 如果是新文件：直接返回功能描述
- 如果是修改/重命名：说明主要变化
- 不要有其他说明文字。`;

  try {
    const response = await callLLM(prompt, apiKey);
    return response;
  } catch (error) {
    console.warn('  [LLM 分析失败，使用备用方法]: ' + error.message);
    return '';
  }
}

/**
 * 使用 LLM 生成测试命令
 * @param {Array} files - 修改的文件列表
 * @param {string} commits - commit 信息
 * @param {string} apiKey - LLM API 密钥
 * @returns {Promise<string>} 测试说明
 */
async function generateTestInstructions(files, commits, apiKey) {
  if (!apiKey) {
    return generateFallbackTestInstructions(files);
  }

  // 收集关键文件信息
  const addedPythonFiles = files.filter(f =>
    f.status === 'added' && f.filename.endsWith('.py') && !f.filename.includes('__init__')
  ).map(f => f.filename);

  const modifiedPythonFiles = files.filter(f =>
    (f.status === 'modified' || f.status === 'added' || f.status === 'renamed') &&
    f.filename.endsWith('.py') && !f.filename.includes('__init__')
  ).map(f => ({
    filename: f.filename,
    status: f.status
  }));

  if (modifiedPythonFiles.length === 0) {
    return generateFallbackTestInstructions(files);
  }

  const prompt = `根据以下代码变更，生成简洁的测试命令。

修改的 Python 文件:
${modifiedPythonFiles.slice(0, 5).map(f => `- ${f.status}: ${f.filename}`).join('\n')}

Commit 信息:
${commits.map(c => `- ${c.title}`).join('\n')}

请生成：
1. 简洁的测试命令（1-3 行 bash 命令）
2. 命令必须可以直接运行，不要使用占位符
3. 每行一个命令，不要包含"测试命令："等前缀文字

示例格式：
pytest tests/test_foo.py -v
pytest tests/

只返回命令，每行一个，不要有其他说明文字。`;

  try {
    const response = await callLLM(prompt, apiKey);
    if (response && response.trim()) {
      // 清理 LLM 返回的内容：移除"测试命令："等前缀，只保留实际命令
      const cleanedResponse = response
        .replace(/^测试命令[：:]\s*/g, '')
        .replace(/^\d+[\.\)]\s*/g, '')  // 移除编号
        .trim();

      const commands = cleanedResponse.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('测试命令'));

      if (commands.length > 0) {
        let result = '**测试命令**\n\n```bash\n';
        commands.forEach(cmd => {
          result += cmd + '\n';
        });
        result += '```';
        return result;
      }
    }
  } catch (error) {
    console.warn('  [LLM 生成测试命令失败，使用备用方法]: ' + error.message);
  }

  return generateFallbackTestInstructions(files);
}

/**
 * 使用 LLM 生成中文 PR 标题
 * @param {Array} changes - 变更列表
 * @param {Array} commits - commit 信息
 * @param {string} apiKey - LLM API 密钥
 * @returns {Promise<string>} 中文标题
 */
async function generateTitleWithLLM(changes, commits, apiKey) {
  if (!apiKey || changes.length === 0) {
    return null;
  }

  // 过滤掉测试相关的变更，聚焦主要功能
  const mainChanges = changes.filter(c => !c.isTest);

  // 获取 commit 类型统计 - 添加安全检查
  const commitTypes = commits.map(c => {
    if (!c || !c.title) return '更新';
    const msg = (c.title || '').toLowerCase();
    if (msg.includes('feat') || msg.includes('add')) return '新增';
    if (msg.includes('fix') || msg.includes('bug')) return '修复';
    if (msg.includes('refactor') || msg.includes('improve')) return '优化';
    if (msg.includes('docs')) return '文档';
    return '更新';
  });

  // 主要变更类型
  const primaryType = commitTypes[0] || '更新';

  // 构建提示词 - 添加安全检查和更详细的文件信息
  const changesList = mainChanges.slice(0, 5).map(c => {
    let desc = `- ${c.type}: ${c.name}`;
    // 如果有特征描述，添加关键信息
    if (c.features && c.features.length > 0) {
      const feature = c.features[0];
      if (feature && feature.length > 10) {
        desc += ' — ' + feature.substring(0, 30) + '...';
      }
    }
    return desc;
  }).join('\n');
  const commitsList = commits.slice(0, 3).map(c => `- ${(c && c.title) ? c.title : 'unknown'}`).join('\n');

  const prompt = `请基于以下 Pull Request 的变更内容，生成一个简洁、准确的中文标题。

变更统计:
- 主要变更数量: ${mainChanges.length}
- 变更类型: ${primaryType}

主要功能变更（包含文件级详细信息）:
${changesList}

Commit 信息:
${commitsList}

要求:
1. 使用中文
2. 简洁明了（10-50字）
3. 准确反映主要变更内容，优先参考"功能变更"中的详细描述
4. 格式：[动作] [具体功能描述]，不要使用泛泛的词汇
   - 正确示例：新增视频预处理工具，支持多进程解码
   - 正确示例：修复视频解码内存泄漏问题
   - 正确示例：优化模型导出流程，支持 ONNX 格式
   - 错误示例：更新代码结构
   - 错误示例：优化功能

只返回标题，不要有其他说明文字。`;

  try {
    console.log('  [正在使用 LLM 生成中文标题...]');
    const response = await callLLM(prompt, apiKey);
    if (response && response.trim()) {
      const title = response.trim();
      // 验证长度
      if (title.length > 50) {
        console.log('  [LLM 生成的标题过长，截断到50字]');
        return title.substring(0, 50);
      }
      console.log('  [生成的标题: ' + title + ']');
      return title;
    }
  } catch (error) {
    console.warn('  [LLM 生成标题失败: ' + error.message + ']');
  }

  return null;
}

/**
 * 备用测试指令生成（基于实际文件结构）
 */
function generateFallbackTestInstructions(files) {
  const instructions = [];

  const testFiles = files.filter(f =>
    f.filename.startsWith('tests/') &&
    f.filename.endsWith('.py') &&
    !f.filename.includes('conftest')
  );

  if (testFiles.length > 0) {
    const testGroups = {};
    testFiles.forEach(f => {
      const parts = f.filename.split('/');
      if (parts.length > 2) {
        const dir = parts.slice(0, parts.indexOf('tests') + 2).join('/');
        if (!testGroups[dir]) testGroups[dir] = [];
        testGroups[dir].push(f.filename);
      }
    });

    Object.keys(testGroups).sort().forEach(dir => {
      const testFilesInDir = testGroups[dir].map(f => f.split('/').pop());
      instructions.push(`**测试目录: \`${dir}\`**`);
      instructions.push('');
      instructions.push('测试文件:');
      testFilesInDir.forEach(f => {
        instructions.push(`- \`${f}\``);
      });
      instructions.push('');
      instructions.push('运行命令:');
      instructions.push('```bash');
      instructions.push(`pytest ${dir}/ -v`);
      instructions.push('```');
      instructions.push('');
    });
  }

  const pyFiles = files.filter(f => f.filename.endsWith('.py') && f.status !== 'deleted');
  if (pyFiles.length > 0 && testFiles.length === 0) {
    instructions.push('**Python 语法检查**');
    instructions.push('');
    instructions.push('```bash');
    instructions.push('python -m py_compile \\');
    pyFiles.slice(0, 10).forEach((f, i) => {
      const sep = i === pyFiles.length - 1 || i === 9 ? '' : ' \\';
      instructions.push('  ' + f.filename + sep);
    });
    instructions.push('```');
    instructions.push('');
  }

  const hasYaml = files.some(f => f.filename.endsWith('.yaml') || f.filename.endsWith('.yml'));
  if (hasYaml) {
    instructions.push('**配置文件验证**');
    instructions.push('');
    instructions.push('```bash');
    instructions.push('python -c "import yaml; yaml.safe_load(open(\'<file>.yaml\'))" && echo OK');
    instructions.push('```');
    instructions.push('');
  }

  const hasJson = files.some(f => f.filename.endsWith('.json'));
  if (hasJson) {
    instructions.push('**JSON 语法验证**');
    instructions.push('');
    instructions.push('```bash');
    instructions.push('python -c "import json; json.load(open(\'<file>.json\'))" && echo OK');
    instructions.push('```');
    instructions.push('');
  }

  if (instructions.length === 0) {
    instructions.push('- 本 PR 仅修改文档/配置类文件，建议人工审阅改动内容');
  }

  return instructions.join('\n');
}

/**
 * 判断是否为测试文件
 */
function isTestFile(filename) {
  return filename.startsWith('tests/') || filename.includes('/tests/') ||
         filename.includes('test_') || filename.includes('conftest');
}

/**
 * 判断是否为 __init__.py 或配置文件
 */
function isInitOrConfigFile(filename) {
  const basename = filename.substring(filename.lastIndexOf('/') + 1);
  return basename === '__init__.py' ||
         basename === 'config.py' ||
         basename === 'settings.py' ||
         basename.endsWith('.json') ||
         basename.endsWith('.yaml') ||
         basename.endsWith('.yml');
}

/**
 * 获取文件的变更类型
 * 注意：GitCode API 可能返回 undefined 状态，这种情况下应该视为"修改"而非"新增"
 * 真正的"新增"只有 added 状态
 */
function getChangeType(status) {
  if (status === 'added') return '新增';
  if (status === 'renamed') return '移动';
  if (status === 'modified') return '修改';
  if (status === 'deleted') return '删除';
  // undefined 或其他状态默认为"修改"（文件已存在，只是有变更）
  return '修改';
}

/**
 * 生成默认特征描述（当 LLM 结果无法提取时使用）
 */
function generateDefaultFeatureDescription(change) {
  const filename = change.mainFile || change.path || '';
  const type = change.type || '修改';

  // 仅基于文件扩展名给出非常粗粒度的描述，避免对未知项目做错误的特化假设
  if (filename.endsWith('.md')) {
    return type + '文档内容';
  }
  if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
    return type + 'YAML 配置文件';
  }
  if (filename.endsWith('.json')) {
    return type + 'JSON 配置文件';
  }
  if (filename.endsWith('.sh')) {
    return type + 'shell 脚本';
  }
  if (filename.endsWith('.py')) {
    return type + 'Python 模块';
  }

  return null;
}

/**
 * 生成语义化的变更描述
 */
async function generateSemanticChanges(files, commits, owner, repo, branch, token, llmApiKey) {
  const changes = [];
  const sourceChanges = [];
  const testChanges = [];

  // 按目录分组文件（包括所有状态的文件）
  const changedFiles = files.filter(f => f.status !== 'deleted');

  // 过滤掉非代码文件
  const nonCodeFiles = ['.gitignore', '.gitattributes', '.dockerignore', 'license', 'license.md', 'readme.md'];
  const filteredFiles = changedFiles.filter(f => {
    const basename = f.filename.substring(f.filename.lastIndexOf('/') + 1).toLowerCase();
    return !nonCodeFiles.includes(basename);
  });

  if (filteredFiles.length === 0) {
    return changes;
  }

  // 按目录分组
  const grouped = {};
  filteredFiles.forEach(f => {
    const dir = f.filename.substring(0, f.filename.lastIndexOf('/'));
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  });

  // 分析每个目录
  for (const dir of Object.keys(grouped).sort()) {
    const filesInDir = grouped[dir];

    // 判断是否为测试目录
    const isTestDir = dir.startsWith('tests/') || dir.includes('/tests/') ||
                     filesInDir.some(f => f.filename.includes('test_') || f.filename.includes('conftest'));

    if (isTestDir) {
      // 测试目录：聚合描述
      const allFeatures = [];

      for (const file of filesInDir) {
        if (file.filename.endsWith('.py') && !file.filename.includes('__init__')) {
          const content = await fetchFileContent(owner, repo, file.filename, branch, token);

          // 使用 LLM 分析或使用规则（传递文件状态）
          let features = [];
          if (llmApiKey && content) {
            const llmResult = await analyzeFileWithLLM(file.filename, content, llmApiKey, file.status);
            if (llmResult) {
              features = [llmResult];
            }
          }

          // 备用规则
          if (features.length === 0) {
            if (file.filename.includes('conftest')) {
              features.push('pytest 配置');
            } else {
              features.push('单元测试');
            }
          }

          allFeatures.push(...features);
        }
      }

      const uniqueFeatures = [...new Set(allFeatures)];

      // 检查目录中是否所有文件都是新增的，还是有修改的
      const hasModified = filesInDir.some(f => f.status === 'modified');
      const hasRenamed = filesInDir.some(f => f.status === 'renamed');
      const allAdded = filesInDir.every(f => f.status === 'added' || !f.status || f.status === 'undefined');

      let testType = '新增';
      if (hasRenamed && !hasModified && !allAdded) {
        testType = '重组';
      } else if (hasModified) {
        testType = '更新';
      }

      testChanges.push({
        type: testType,
        name: '完整的测试套件',
        path: dir,
        mainFile: dir + '/',
        otherFiles: filesInDir.map(f => f.filename),
        features: uniqueFeatures,
        isTest: true
      });

    } else {
      // 源代码目录
      const mainPyFiles = filesInDir.filter(f =>
        f.filename.endsWith('.py') && !f.filename.includes('__init__')
      );

      if (mainPyFiles.length === 0) {
        continue;
      }

      const mainFile = mainPyFiles[0];
      const content = await fetchFileContent(owner, repo, mainFile.filename, branch, token);

      // 获取文件的变更类型
      const changeType = getChangeType(mainFile.status);

      // 使用 LLM 分析文件功能（传递文件状态）
      let features = [];
      let featureName = '';

      if (llmApiKey && content) {
        const llmResult = await analyzeFileWithLLM(mainFile.filename, content, llmApiKey, mainFile.status);
        if (llmResult) {
          features = [llmResult];

          // 从 LLM 结果推断功能名称
          if (llmResult.includes('添加') || llmResult.includes('新增')) {
            featureName = llmResult.replace(/^[新增添加修改]+/, '').replace(/参数.*$/, '').trim();
            if (featureName.length > 10) {
              featureName = featureName.substring(0, 10);
            }
          }

          if (!featureName) {
            const parts = mainFile.filename.split('/');
            const name = parts[parts.length - 1].replace('.py', '').replace(/_/g, ' ');
            featureName = name.charAt(0).toUpperCase() + name.slice(1);
          }
        }
      }

      // 备用：从文件名推断功能名称（不针对具体项目做特化）
      if (!featureName) {
        const parts = mainFile.filename.split('/');
        const name = parts[parts.length - 1].replace('.py', '').replace(/_/g, ' ');
        featureName = name.charAt(0).toUpperCase() + name.slice(1);
      }

      // 备用：从内容推断功能特性（仅给出非常粗粒度的描述）
      if (features.length === 0 && content) {
        // 不做基于具体项目内容的猜测，留给 LLM 或审阅者判断
      }

      const otherFiles = filesInDir.filter(f => f !== mainFile && !isInitOrConfigFile(f.filename));

      sourceChanges.push({
        type: changeType,
        name: featureName,
        path: dir,
        mainFile: mainFile.filename,
        otherFiles: otherFiles.map(f => f.filename),
        features: features,
        isTest: false
      });
    }
  }

  // 合并：源代码在前，测试在后
  changes.push(...sourceChanges, ...testChanges);

  return changes;
}

/**
 * 生成完整的 PR 描述
 */
async function generateSemanticPRDescription(context, useSemantic = true, llmApiKey = null) {
  const { pr, commits, files, owner, repo, token } = context;

  let description = '';

  if (useSemantic) {
    // 语义化描述
    const changes = await generateSemanticChanges(files, commits, owner, repo, pr.sourceBranch, token, llmApiKey);

    if (changes.length > 0) {
      description += '### 主要变更\n\n';

      changes.forEach(change => {
        // 所有变更都使用相同的结构
        const isTestSuite = change.mainFile && change.mainFile.endsWith('/');

        if (isTestSuite) {
          description += '- **' + change.type + change.name + '** (`' + change.path + '/`)\n';
        } else {
          description += '- **' + change.type + change.name + '** (`' + change.mainFile + '`)\n';
        }

        if (change.features && change.features.length > 0) {
          // 方案1: 智能特征提取
          // 合并所有特征文本，按段落分组
          const allText = change.features.join('\n\n');

          // 按段落分割（双换行符）
          const paragraphs = allText.split(/\n\n+/);

          // 从每个段落中提取关键特征点
          const keyFeatures = [];

          for (const para of paragraphs) {
            // 跳过明显的问答格式段落
            if (/^[问1-3\.\s]*|这个文件|主要功能是什么|如果是|新增参数|主要变化/.test(para)) {
              continue;
            }

            // 提取段落中的功能性描述
            // 寻找包含动词或技术关键词的句子
            const lines = para.split('\n');
            for (const line of lines) {
              const cleanLine = line.trim();

              // 跳过过短的行或明显的问题/标题行
              if (cleanLine.length < 10) continue;
              if (/^[0-9]+\.\s+/.test(cleanLine)) continue; // 编号开头
              if (/^(主要功能点|具体功能|功能点|说明|总结|概述)/.test(cleanLine)) continue;
              if (/^[这是|这是一个|该文件|本文件]/.test(cleanLine)) continue;
              if (/^(不适用|无|N\/A)/.test(cleanLine)) continue;

              // 检查是否包含功能性关键词
              const hasFunctionalKeywords = /新增|添加|支持|实现|提供|集成|生成|转换|处理|优化|改进|修复|删除|移除|导出|导入|加载|保存|验证|测试/.test(cleanLine);

              if (hasFunctionalKeywords) {
                // 清理格式
                let feature = cleanLine
                  // 移除编号
                  .replace(/^[0-9]+\.\s*/, '')
                  // 移除项目符号
                  .replace(/^[-\*•]\s*/, '')
                  // 移除多余空白
                  .replace(/\s+/g, ' ')
                  // 移除前缀标签
                  .replace(/^[主具具功][要能点]*[：:]\s*/, '')
                  .trim();

                if (feature && feature.length > 5) {
                  keyFeatures.push(feature);
                  // 限制每个文件最多 3 个特征点
                  if (keyFeatures.length >= 3) break;
                }
              }
            }

            // 如果已找到足够的特征，跳出段落循环
            if (keyFeatures.length >= 3) break;
          }

          // 输出提取的特征
          keyFeatures.forEach(feature => {
            description += '  - ' + feature + '\n';
          });

          // 如果没有提取到任何特征，使用简化的默认描述
          if (keyFeatures.length === 0) {
            const defaultDesc = generateDefaultFeatureDescription(change);
            if (defaultDesc) {
              description += '  - ' + defaultDesc + '\n';
            }
          }
        }

        if (!isTestSuite && change.otherFiles && change.otherFiles.length > 0) {
          const otherList = change.otherFiles.map(f => '  - `' + f + '`').join('\n');
          description += otherList + '\n';
        }

        description += '\n';
      });
    }
  } else {
    // 简单文件列表
    description += '\n\n### 变更文件\n\n';
    files.forEach(f => {
      const emoji = f.status === 'added' ? '➕' :
                    f.status === 'deleted' ? '❌' :
                    f.status === 'renamed' ? '📝' : '📝';
      description += emoji + ' `' + f.filename + '`';
      if (f.additions > 0 || f.deletions > 0) {
        description += ' (+' + f.additions + ', -' + f.deletions + ')';
      }
      description += '\n';
    });
  }

  // 生成测试说明（优先使用 LLM，否则使用基于文件结构的备用方案）
  let testSection = '';

  if (llmApiKey) {
    try {
      console.log('  [正在使用 LLM 生成测试指令...]');
      const testInstructions = await generateTestInstructions(files, commits, llmApiKey);
      testSection = testInstructions;
    } catch (error) {
      console.warn('  [LLM 生成测试说明失败，使用备用方法]: ' + error.message);
    }
  }

  // 使用备用方案
  if (!testSection) {
    testSection = generateFallbackTestInstructions(files);
  }

  description += `

---

## 如何测试

${testSection}`;

  // 添加测试验证报告到 PR body
  if (useSemantic) {
    const changes = await generateSemanticChanges(files, commits, owner, repo, pr.sourceBranch, token, llmApiKey);
    const testReport = generateTestReportSection(changes, files);
    description += testReport;
  }

  description += `

---

**注意**: 社区中的任何人都可以在测试通过后审查 PR。欢迎标记对你这个 PR 感兴趣的成员/贡献者。尽量避免标记超过 3 个人。
`;

  return description;
}

/**
 * 生成测试验证报告章节（用于添加到 PR body 中）
 * 动态生成：基于 PR 实际修改的文件列表。无测试文件时跳过整段，不伪造结论。
 */
function generateTestReportSection(changes, files) {
  const testFiles = files.filter(f =>
    f.filename.startsWith('tests/') &&
    f.filename.endsWith('.py') &&
    !f.filename.includes('conftest')
  );

  const pyFiles = files.filter(f => f.filename.endsWith('.py') && f.status !== 'deleted');

  if (testFiles.length === 0 && pyFiles.length === 0) {
    return '';
  }

  const verifyTime = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  let report = '\n\n## 测试验证报告\n\n';

  if (pyFiles.length > 0) {
    report += '### 语法检查\n\n';
    report += '```bash\n';
    report += '$ python -m py_compile \\\n';
    pyFiles.slice(0, 10).forEach((f, i) => {
      const sep = i === pyFiles.length - 1 || i === 9 ? '' : ' \\';
      report += '  ' + f.filename + sep + '\n';
    });
    report += '```\n\n';
  }

  if (testFiles.length > 0) {
    const testDir = testFiles[0].filename.substring(0, testFiles[0].filename.lastIndexOf('/'));
    report += '### 测试收集\n\n';
    report += '```bash\n';
    report += '$ pytest ' + testDir + '/ --collect-only\n';
    report += '```\n\n';
    report += '**测试文件**:\n';
    testFiles.forEach(f => {
      report += '- `' + f.filename + '`\n';
    });
    report += '\n';
  }

  report += '---\n\n';
  report += '**验证时间**: ' + verifyTime + '\n';
  report += '**验证方式**: 静态分析 PR 文件列表（未实际执行）\n';

  return report;
}

/**
 * 获取 PR 的所有评论
 */
function getPRComments(prNumber, config) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.gitcode.com',
      port: 443,
      path: `/api/v5/repos/${config.gitcode.owner}/${config.gitcode.repo}/pulls/${prNumber}/comments`,
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + config.gitcode.token,
        'User-Agent': 'PR-Generator/3.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const comments = JSON.parse(data);
          resolve(comments || []);
        } catch (e) {
          resolve([]);
        }
      });
    });

    req.on('error', () => resolve([]));
    req.setTimeout(10000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

/**
 * 更新现有评论
 * 使用 PR 专用的评论更新端点
 */
function updateComment(commentId, commentBody, config) {
  return new Promise((resolve, reject) => {
    // GitCode PR 评论更新使用 /pulls/comments/{id} 端点
    const options = {
      hostname: 'api.gitcode.com',
      port: 443,
      path: `/api/v5/repos/${config.gitcode.owner}/${config.gitcode.repo}/pulls/comments/${commentId}`,
      method: 'PATCH',
      headers: {
        'Authorization': 'Bearer ' + config.gitcode.token,
        'Content-Type': 'application/json',
        'User-Agent': 'PR-Generator/3.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          // 成功响应可能为空
          const result = data ? JSON.parse(data) : { id: commentId };
          console.log('✅ 测试验证报告已更新 (评论 ID: ' + commentId + ')');
          resolve(result);
        } else {
          // 如果更新失败，尝试删除后重新创建
          console.warn('  [更新评论失败 HTTP ' + res.statusCode + '，将创建新评论]');
          reject(new Error('HTTP ' + res.statusCode));
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ body: commentBody }));
    req.end();
  });
}

/**
 * 创建或更新第一条综合讨论评论
 * 查找第一条用户评论（跳过 bot），更新该评论；若无用户评论则创建新评论
 */
async function createOrUpdateDiscussionComment(prNumber, changes, files, config) {
  // 先检查是否已有评论
  const existingComments = await getPRComments(prNumber, config);

  // 找到第一条用户评论（跳过 bot 评论）
  const firstUserComment = existingComments.find(c =>
    c.user &&
    !c.user.login.includes('bot') &&
    !c.user.login.includes('ci') &&
    !c.user.login.includes('openeuler-ci-bot')
  );

  const targetCommentId = firstUserComment ? firstUserComment.id : null;

  // 生成评论体
  const commentBody = generateCommentBody(changes, files);

  if (targetCommentId) {
    // 更新第一条用户评论
    console.log('  [检测到用户评论，更新评论 ID: ' + targetCommentId + ']');
    try {
      await updateComment(targetCommentId, commentBody, config);
      return { id: targetCommentId, updated: true };
    } catch (err) {
      // 如果更新失败，创建新评论
      console.log('  [更新失败: ' + err.message + '，创建新评论]');
      return createNewComment(prNumber, commentBody, config);
    }
  } else {
    // 创建新评论
    console.log('  [无用户评论，创建新评论]');
    return createNewComment(prNumber, commentBody, config);
  }
}

/**
 * 生成评论内容
 */
function generateCommentBody(changes, files) {
  const featureList = changes.map(c => {
    const type = c.type || '新增';
    let desc = '- **' + type + (c.name || '模块') + '** (`' + (c.mainFile || c.path) + '`)\n';
    if (c.features && c.features.length > 0) {
      desc += '  ' + c.features.map(f => f).join('\n  ');
    }
    return desc;
  }).join('\n');

  const testReport = generateTestReportSection(changes, files);

  let body = '### 主要变更\n\n' + featureList + '\n';
  if (testReport) {
    body += testReport;
  }
  return body;
}

/**
 * 创建新评论
 */
function createNewComment(prNumber, commentBody, config) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.gitcode.com',
      port: 443,
      path: `/api/v5/repos/${config.gitcode.owner}/${config.gitcode.repo}/pulls/${prNumber}/comments`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + config.gitcode.token,
        'Content-Type': 'application/json',
        'User-Agent': 'PR-Generator/3.0'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 201) {
          const result = JSON.parse(data);
          console.log('✅ 第一条讨论评论创建成功 (ID: ' + result.id + ')');
          resolve(result);
        } else {
          console.warn('  [创建讨论评论失败]: HTTP ' + res.statusCode);
          reject(new Error('Failed to create comment: ' + res.statusCode));
        }
      });
    });

    req.on('error', (err) => {
      console.warn('  [创建讨论评论失败]: ' + err.message);
      reject(err);
    });

    req.write(JSON.stringify({ body: commentBody }));
    req.end();
  });
}


// 主函数
async function main() {
  const { GitCodeAPI } = require('../lib/gitcode-api');

  const args = process.argv.slice(2);
  const prNumber = parseInt(args[0]);
  const useSemantic = !args.includes('--simple');

  // 优先使用环境变量，否则从 Claude settings 读取
  let llmApiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || null;
  if (!llmApiKey) {
    try {
      const fs = require('fs');
      const settingsPath = process.env.HOME + '/.claude/settings.json';
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (settings.env && settings.env.ANTHROPIC_AUTH_TOKEN) {
          llmApiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
        }
      }
    } catch (e) {
      // 忽略配置读取错误
    }
  }

  if (!prNumber || isNaN(prNumber)) {
    console.error('❌ 错误: 请提供有效的 PR 编号');
    console.error('');
    console.error('用法:');
    console.error('  node generate-semantic-desc-v3.js <prNumber> [--simple]');
    console.error('');
    console.error('环境变量:');
    console.error('  ANTHROPIC_API_KEY=your_key  # 使用 Claude API 分析文件（可选）');
    console.error('');
    console.error('示例:');
    console.error('  ANTHROPIC_API_KEY=sk-xxx node generate-semantic-desc-v3.js 50');
    process.exit(1);
  }

  try {
    const config = loadConfig();
    const api = new GitCodeAPI(config);

    console.log('============================================================');
    console.log('🤖 LLM 驱动的语义化 PR 描述生成工具 v3');
    console.log('============================================================');
    console.log('PR 编号: #' + prNumber);
    console.log('仓库: ' + config.gitcode.owner + '/' + config.gitcode.repo);
    console.log('模式: ' + (useSemantic ? '语义化' : '简单'));
    console.log('LLM 分析: ' + (llmApiKey ? '启用' : '禁用'));
    console.log('');

    // 收集上下文
    console.log('正在收集 PR 信息...');
    const pr = await api.getPullRequest(prNumber);
    const commits = await api.getPRCommits(prNumber);
    const files = await api.getPRFiles(prNumber);

    const sourceRepo = pr.head?.repo?.full_name || config.gitcode.owner + '/' + config.gitcode.repo;
    const sourceOwner = sourceRepo.split('/')[0];
    const sourceRepoName = sourceRepo.split('/')[1];

    const context = {
      pr: {
        number: pr.number,
        title: pr.title,
        sourceBranch: pr.head?.ref,
        sourceRepo: sourceRepo,
        targetBranch: pr.base?.ref
      },
      owner: sourceOwner,
      repo: sourceRepoName,
      token: config.gitcode.token,
      commits: commits.map(c => ({
        sha: c.sha.substring(0, 7),
        title: c.commit.message.split('\n')[0],
        message: c.commit.message
      })),
      files: files.map(f => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch
      }))
    };

    console.log('✓ ' + commits.length + ' 个 commits');
    console.log('✓ ' + files.length + ' 个文件变更');
    console.log('');

    // 生成描述
    console.log('正在生成描述...');
    const description = await generateSemanticPRDescription(context, useSemantic, llmApiKey);

    console.log('');
    console.log('============================================================');
    console.log('生成的 PR 描述:');
    console.log('============================================================');
    console.log(description);
    console.log('============================================================');
    console.log('');

    // 保存到文件
    const outputFile = '/tmp/gitcode_pr_' + prNumber + '_description_v3.md';
    fs.writeFileSync(outputFile, description);
    console.log('✓ 描述已保存到: ' + outputFile);

    // 询问是否更新 PR
    if (!llmApiKey) {
      console.log('');
      console.log('💡 提示: 设置 ANTHROPIC_API_KEY 环境变量可使用 Claude API 分析文件功能');
    }

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // 生成中文标题（如果启用了 LLM）
    let chineseTitle = null;
    if (llmApiKey && useSemantic) {
      try {
        // 重新生成变更信息用于标题生成
        const changesForTitle = await generateSemanticChanges(files, commits, sourceOwner, sourceRepoName, pr.sourceBranch, config.gitcode.token, null);
        chineseTitle = await generateTitleWithLLM(changesForTitle, commits, llmApiKey);
      } catch (error) {
        console.warn('  [生成标题失败: ' + error.message + ']');
      }
    }

    // 检查是否为非交互模式（输入被重定向）
    const isNonInteractive = !process.stdin.isTTY;

    async function updatePR() {
      console.log('正在更新 PR...');

      // 构建更新 payload（包含 title 和 body）
      const updatePayload = { body: description };
      if (chineseTitle) {
        updatePayload.title = chineseTitle;
      }

      await api.updatePullRequest(prNumber, updatePayload);

      console.log('');
      console.log('============================================================');
      console.log('✅ PR 描述更新成功');
      if (chineseTitle) {
        console.log('✅ PR 标题已更新为: ' + chineseTitle);
      }
      console.log('============================================================');
      console.log('PR 链接: ' + api.getPRUrl(prNumber));
      console.log('============================================================');

      // 测试验证报告已包含在 PR body 中（无需单独创建评论）
      console.log('');
      console.log('============================================================');
      console.log('💡 测试验证报告已包含在 PR 描述中');
      console.log('============================================================');
    }

    if (isNonInteractive) {
      // 非交互模式：直接更新
      await updatePR();
      rl.close();
    } else {
      // 交互模式：询问用户
      rl.question('是否更新 PR 描述？(y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await updatePR();
        }
        rl.close();
      });
    }

  } catch (error) {
    console.error('');
    console.error('============================================================');
    console.error('❌ 失败');
    console.error('============================================================');
    console.error(error.message);
    process.exit(1);
  }
}

main();

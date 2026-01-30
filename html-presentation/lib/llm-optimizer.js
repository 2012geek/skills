/**
 * LLM Optimizer for Presentation Content
 * 封装 LLM 调用，支持内容分析和优化
 */

const fs = require('fs');
const path = require('path');
const { OptimizationCache, MetricsCollector } = require('./cache');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // 缓存目录
  cacheDir: path.join(process.cwd(), '.pres-optimizer-cache'),

  // 模型配置 - 支持通过环境变量覆盖
  model: process.env.CLAUDE_MODEL || 'GLM-4.7',
  maxTokens: 4096,
  temperature: 0.3,

  // 并发控制
  maxConcurrent: 3,
};

// ============================================================================
// MAIN LLM OPTIMIZER CLASS
// ============================================================================

class LLMOptimizer {
  constructor(options = {}) {
    this.options = { ...CONFIG, ...options };
    this.memoryCache = new Map();
    this.pending = 0;

    // 初始化持久化缓存
    this.cache = new OptimizationCache(this.options.cacheDir);
    this.metrics = options.metrics || new MetricsCollector();
  }

  /**
   * 分析 Markdown 内容
   * @param {string} content - 原始 Markdown 内容
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeContent(content) {
    // 检查缓存
    const cached = this.cache.getContentAnalysis(content);
    if (cached) {
      this.metrics.recordCacheHit();
      console.log('💾 Using cached analysis');
      return cached;
    }

    this.metrics.recordCacheMiss();

    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../prompts/content-analysis.txt'),
      'utf-8'
    );

    const prompt = promptTemplate.replace('{{markdown_content}}', content);

    const result = await this.callLLM(prompt, 'content-analysis');

    // 保存到缓存
    this.cache.setContentAnalysis(content, result);

    return result;
  }

  /**
   * 优化 Markdown 内容
   * @param {string} content - 原始内容
   * @param {Object} analysis - 内容分析结果
   * @returns {Promise<string>} 优化后的内容
   */
  async optimizeContent(content, analysis) {
    // 检查缓存
    const cached = this.cache.getContentOptimization(content, analysis);
    if (cached) {
      this.metrics.recordCacheHit();
      console.log('💾 Using cached optimization');
      return cached;
    }

    this.metrics.recordCacheMiss();

    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../prompts/content-optimization.txt'),
      'utf-8'
    );

    const prompt = promptTemplate
      .replace('{{original_content}}', content)
      .replace('{{content_analysis}}', JSON.stringify(analysis, null, 2));

    const result = await this.callLLM(prompt, 'content-optimization');

    // 保存到缓存
    this.cache.setContentOptimization(content, analysis, result);

    return result;
  }

  /**
   * 处理代码块
   * @param {string} code - 代码内容
   * @param {string} language - 编程语言
   * @param {Object} context - 上下文信息
   * @returns {Promise<Object>} 优化后的代码信息
   */
  async processCode(code, language, context = {}) {
    // 检查缓存
    const cached = this.cache.getCodeProcessing(code, language, context);
    if (cached) {
      this.metrics.recordCacheHit();
      console.log(`💾 Using cached code processing (${language})`);
      return cached;
    }

    this.metrics.recordCacheMiss();

    const promptTemplate = fs.readFileSync(
      path.join(__dirname, '../prompts/code-processing.txt'),
      'utf-8'
    );

    const prompt = promptTemplate
      .replace('{{language}}', language)
      .replace('{{code}}', code)
      .replace('{{location}}', context.location || '')
      .replace('{{purpose}}', context.purpose || '')
      .replace('{{audience}}', context.audience || '技术人员');

    const result = await this.callLLM(prompt, 'code-processing');

    // 保存到缓存
    this.cache.setCodeProcessing(code, language, context, result);

    return result;
  }

  /**
   * 调用 LLM (核心方法)
   * @param {string} prompt - 完整的提示词
   * @param {string} taskType - 任务类型
   * @returns {Promise<any>} LLM 响应
   */
  async callLLM(prompt, taskType) {
    const startTime = Date.now();

    // 等待并发槽位
    await this.acquireSlot();

    try {
      // 调用 Claude API
      const result = await this.invokeClaude(prompt);

      // 记录时间
      const duration = Date.now() - startTime;
      this.metrics.recordTime(duration);

      return result;
    } catch (error) {
      this.metrics.recordError(error);
      throw error;
    } finally {
      this.releaseSlot();
    }
  }

  /**
   * 调用 Claude (通过系统工具或直接调用)
   * @param {string} prompt - 提示词
   * @returns {Promise<any>} 响应结果
   */
  async invokeClaude(prompt) {
    // Check for API key - support both ANTHROPIC_API_KEY and ANTHROPIC_AUTH_TOKEN
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

    if (!apiKey) {
      console.warn('⚠️  ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN not set');
      throw new Error('API_KEY_MISSING');
    }

    // 创建临时的提示文件
    const tmpPromptFile = path.join(this.options.cacheDir, `prompt-${Date.now()}.txt`);
    fs.mkdirSync(this.options.cacheDir, { recursive: true });
    fs.writeFileSync(tmpPromptFile, prompt);

    // 使用 curl 直接调用 API (兼容自定义 endpoint)
    const script = `
import json
import subprocess

# Read prompt
with open("${tmpPromptFile}", "r") as f:
    prompt_content = f.read()

# Prepare request
headers = {
    "x-api-key": "${apiKey}",
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
}

data = {
    "model": "${this.options.model}",
    "max_tokens": ${this.options.maxTokens},
    "temperature": ${this.options.temperature},
    "messages": [{"role": "user", "content": prompt_content}]
}

# Use curl to make the request
curl_cmd = [
    "curl", "-s", "-X", "POST",
    "${baseUrl}/v1/messages",
    "-H", "x-api-key: ${apiKey}",
    "-H", "anthropic-version: 2023-06-01",
    "-H", "content-type: application/json",
    "-d", json.dumps(data)
]

try:
    result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"Error: {result.stderr}", file=__import__('sys').stderr)
        __import__('sys').exit(1)

    response = json.loads(result.stdout)
    print(response.get("content", [{}])[0].get("text", ""))
except Exception as e:
    print(f"Error: {e}", file=__import__('sys').stderr)
    __import__('sys').exit(1)
`;

    const tmpScriptFile = path.join(this.options.cacheDir, `invoke-${Date.now()}.py`);
    fs.writeFileSync(tmpScriptFile, script);

    try {
      const { spawnSync } = require('child_process');
      const result = spawnSync('python3', [tmpScriptFile], {
        encoding: 'utf-8',
        env: { ...process.env }
      });

      if (result.error) {
        throw new Error(`Python 调用失败: ${result.error.message}`);
      }

      if (result.stderr) {
        console.error(`⚠️  警告: ${result.stderr}`);
      }

      // Check if stdout is empty
      if (!result.stdout || result.stdout.trim() === '' || result.stdout.startsWith('Error:')) {
        throw new Error('EMPTY_RESPONSE');
      }

      // 解析响应
      return this.parseResponse(result.stdout);
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(tmpPromptFile);
        fs.unlinkSync(tmpScriptFile);
      } catch (e) {
        // 忽略清理错误
      }
    }
  }

  /**
   * 解析 LLM 响应
   * @param {string} response - 原始响应文本
   * @returns {any} 解析后的对象
   */
  parseResponse(response) {
    // 尝试提取 JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        // JSON 解析失败，返回原始文本
        return { text: response };
      }
    }

    // 尝试直接解析 JSON
    try {
      return JSON.parse(response);
    } catch (e) {
      // 返回原始文本
      return { text: response };
    }
  }

  /**
   * 获取并发槽位
   */
  async acquireSlot() {
    while (this.pending >= this.options.maxConcurrent) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    this.pending++;
  }

  /**
   * 释放并发槽位
   */
  releaseSlot() {
    this.pending--;
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 获取指标报告
   */
  getMetrics() {
    return this.metrics.getReport();
  }

  /**
   * 打印报告
   */
  printReport() {
    this.metrics.printReport();
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 批量处理内容块
   * @param {Array<string>} chunks - 内容块数组
   * @param {Function} processor - 处理函数
   * @returns {Promise<Array>} 处理结果数组
   */
  async batchProcess(chunks, processor) {
    const results = [];
    const batchSize = this.options.maxConcurrent;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(chunk => processor(chunk))
      );
      results.push(...batchResults);

      // 显示进度
      console.log(`📊 进度: ${Math.min(i + batchSize, chunks.length)}/${chunks.length}`);
    }

    return results;
  }
}

// ============================================================================
// SPECIALIZED OPTIMIZERS
// ============================================================================

/**
 * 内容分析器
 */
class ContentAnalyzer extends LLMOptimizer {
  /**
   * 快捷方法：分析内容
   */
  async analyze(content) {
    console.log('🔍 分析内容结构...');
    return super.analyzeContent(content);
  }
}

/**
 * 内容优化器
 */
class ContentOptimizer extends LLMOptimizer {
  /**
   * 快捷方法：优化内容
   */
  async optimize(content, analysis) {
    console.log('✨ 优化内容...');
    return super.optimizeContent(content, analysis);
  }
}

/**
 * 代码处理器
 */
class CodeProcessor extends LLMOptimizer {
  /**
   * 快捷方法：处理代码
   */
  async process(code, language, context) {
    console.log(`💻 处理 ${language} 代码...`);
    return super.processCode(code, language, context);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * 创建优化器实例
 */
function createOptimizer(options) {
  return new LLMOptimizer(options);
}

/**
 * 快捷分析函数
 */
async function analyzeContent(content, options) {
  const analyzer = new ContentAnalyzer(options);
  return analyzer.analyze(content);
}

/**
 * 快捷优化函数
 */
async function optimizeContent(content, analysis, options) {
  const optimizer = new ContentOptimizer(options);
  return optimizer.optimize(content, analysis);
}

/**
 * 快捷代码处理函数
 */
async function processCode(code, language, context, options) {
  const processor = new CodeProcessor(options);
  return processor.process(code, language, context);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  LLMOptimizer,
  ContentAnalyzer,
  ContentOptimizer,
  CodeProcessor,
  createOptimizer,
  analyzeContent,
  optimizeContent,
  processCode,
};

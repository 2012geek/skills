/**
 * 代理运行器
 * 负责加载代理定义并运行代理
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * 代理运行器类
 */
class AgentRunner {
  constructor(config) {
    this.config = config;
    this.agentsDir = path.join(__dirname, '..', 'agents');
  }

  /**
   * 加载代理定义
   */
  async loadAgent(agentName) {
    const agentPath = path.join(this.agentsDir, `${agentName}.md`);

    try {
      const content = await fs.readFile(agentPath, 'utf-8');
      return this.parseAgentDefinition(content);
    } catch (error) {
      throw new Error(`无法加载代理 ${agentName}: ${error.message}`);
    }
  }

  /**
   * 解析代理定义文件
   */
  parseAgentDefinition(content) {
    // 解析 frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('代理定义缺少 frontmatter');
    }

    const frontmatter = frontmatterMatch[1];
    const definition = content.substring(frontmatterMatch[0].length);

    // 解析 YAML frontmatter
    const agent = {
      name: this.extractYamlValue(frontmatter, 'name') || '',
      description: this.extractYamlValue(frontmatter, 'description') || '',
      model: this.extractYamlValue(frontmatter, 'model') || 'inherit',
      color: this.extractYamlValue(frontmatter, 'color') || 'blue',
      definition: definition.trim()
    };

    return agent;
  }

  /**
   * 从 YAML 中提取值
   */
  extractYamlValue(yaml, key) {
    const match = yaml.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  /**
   * 运行代理（返回 prompt 供 Claude 执行）
   * 注意：在实际使用中，这个方法会被 Claude Code 调用
   * 这里只是返回代理的 prompt 和上下文
   */
  async runAgent(agentName, context) {
    const agent = await this.loadAgent(agentName);

    // 构建完整的 prompt
    const prompt = this.buildPrompt(agent, context);

    // 返回 prompt 和相关信息
    return {
      agent: agent.name,
      model: agent.model,
      prompt: prompt,
      // 在实际实现中，这里会调用 Claude API
      // 现在只是返回结构，由主程序处理
      execute: async (claude) => {
        // 这里是实际的执行逻辑
        // 需要传入 claude 实例来执行
        return await this.executeAgent(agent, context, claude);
      }
    };
  }

  /**
   * 构建 prompt
   */
  buildPrompt(agent, context) {
    let prompt = agent.definition;

    // 支持 { context, summary } 格式
    const prContext = context.context || context;
    const summary = context.summary || context.summary;
    const reviewGuide = context.reviewGuide;

    if (reviewGuide && reviewGuide.content) {
      prompt += `\n\n## Project-Specific Review Guide\n\n`;
      prompt += `Source: ${reviewGuide.path || 'inline review guide'}\n\n`;
      prompt += `${reviewGuide.content}\n\n`;
      prompt += `Apply this guide as project-specific review policy. Prioritize concrete correctness, data integrity, deployment, security, and maintainability risks. Do not report style-only issues unless they create one of those risks.\n`;
    }

    // 添加上下文信息
    if (prContext.pr) {
      prompt += `\n\n## PR 信息\n\n`;
      prompt += `- **编号**: #${prContext.pr.number}\n`;
      prompt += `- **标题**: ${prContext.pr.title}\n`;
      prompt += `- **描述**: ${prContext.pr.body || '(无)'}\n`;
    }

    if (prContext.files && prContext.files.length > 0) {
      prompt += `\n## 变更文件\n\n`;
      for (const file of prContext.files) {
        prompt += `### ${file.filename}\n`;
        prompt += `**状态**: ${file.status} | **变更**: +${file.additions}/-${file.deletions}\n\n`;

        if (file.patch) {
          const patch = typeof file.patch === 'string' ? file.patch : (file.patch.diff || '');
          if (patch) {
            // 🔧 方案3: 只显示 diff，限制长度避免行号混淆
            // 文件内容预览会显示错误的行号（预览行号 vs diff行号）
            const maxLines = 500; // 限制最大行数
            const patchLines = patch.split('\n');
            const previewLines = patchLines.slice(0, Math.min(maxLines, patchLines.length));
            prompt += `**Diff**:\n\`\`\`diff\n${previewLines.join('\n')}${patchLines.length > maxLines ? '\n...' : ''}\n\`\`\`\n\n`;
          }
        }

        // ❌ 移除文件内容预览以避免行号混淆
        // 文件内容预览显示的行号与 diff 中的行号不同，会导致 agent 引用错误的行号
      }
    }

    if (summary) {
      prompt += `\n## PR 摘要\n\n${summary.purpose || '代码变更'}\n`;
    }

    if (context.issue) {
      prompt += `\n## 待验证的问题\n\n`;
      prompt += `**文件**: ${context.issue.file}\n`;
      prompt += `**行号**: ${context.issue.line}\n`;
      prompt += `**问题**: ${context.issue.title}\n`;
      prompt += `**描述**: ${context.issue.description}\n`;
    }

    return prompt;
  }

  /**
   * 执行代理（需要 Claude 实例）
   * 这是一个占位方法，实际执行由 Claude Code 处理
   */
  async executeAgent(agent, context, claude) {
    const prompt = this.buildPrompt(agent, context);

    // 这里应该调用 Claude API
    // 由于这是在 Claude Code 环境中运行，实际执行由主程序处理
    return {
      agent: agent.name,
      prompt: prompt
    };
  }

  /**
   * 解析代理输出为 JSON
   */
  parseAgentOutput(output) {
    // 提取 JSON 代码块
    const jsonMatch = output.match(/```json\s*([\s\S]+?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        // JSON 解析失败，尝试其他方式
      }
    }

    // 尝试直接解析整个输出
    try {
      return JSON.parse(output);
    } catch (e) {
      return null;
    }
  }

  /**
   * 获取所有可用代理列表
   */
  async listAgents() {
    const files = await fs.readdir(this.agentsDir);
    const agents = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        try {
          const agent = await this.loadAgent(file.replace('.md', ''));
          agents.push({
            name: agent.name,
            description: agent.description,
            model: agent.model
          });
        } catch (e) {
          // 跳过无法加载的代理
        }
      }
    }

    return agents;
  }
}

module.exports = { AgentRunner };

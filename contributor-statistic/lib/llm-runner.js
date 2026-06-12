'use strict';

const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================================================
// LLM RUNNER
// ============================================================================

class LLMRunner {
  constructor(config) {
    this.config = config;
    this.agentsDir = path.join(__dirname, '..', 'agents');
    this.client = null;

    if (config?.anthropic?.apiKey) {
      this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    }
  }

  loadAgent(agentName) {
    const filePath = path.join(this.agentsDir, `${agentName}.md`);
    const content = fs.readFileSync(filePath, 'utf-8');

    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      throw new Error(`Agent ${agentName} missing frontmatter`);
    }

    const frontmatter = frontmatterMatch[1];
    const definition = content.substring(frontmatterMatch[0].length).trim();

    const modelMatch = frontmatter.match(/^model:\s*(.+)$/m);
    const model = modelMatch ? modelMatch[1].trim() : 'inherit';

    return { definition, model };
  }

  async runAgent(agentName, context) {
    if (!this.client) {
      throw new Error('Anthropic API key not configured');
    }

    const agent = this.loadAgent(agentName);
    const prompt = this.buildPrompt(agent.definition, context);

    const response = await this.client.messages.create({
      model: this.resolveModel(agent.model),
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.content[0].text;
  }

  buildPrompt(definition, context) {
    let prompt = definition;
    for (const [key, value] of Object.entries(context)) {
      prompt += `\n\n## ${key}\n\n${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}`;
    }
    return prompt;
  }

  resolveModel(model) {
    if (model === 'inherit' || model === 'sonnet') {
      return 'claude-sonnet-4-6';
    }
    return model;
  }

  async judgeCommitImportance(contributor, candidateCommits, allCommits) {
    const result = await this.runAgent('commit-importance', {
      '贡献者': `${contributor.name} (${contributor.email})`,
      '候选提交列表': candidateCommits,
      '所有提交列表': allCommits.map(c => ({ hash: c.hash, subject: c.subject })),
      '最大选择数量': this.config?.contributorStatistic?.maxImportantCommits || 5,
    });

    try {
      return JSON.parse(result);
    } catch {
      const jsonMatch = result.match(/\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      throw new Error(`Failed to parse commit importance response: ${result}`);
    }
  }

  async writeContributorSummary(contributor) {
    const result = await this.runAgent('contributor-summary', {
      '贡献者': `${contributor.name} (${contributor.email})`,
      '总提交数': contributor.totalCommits,
      '新增行数': contributor.totalLinesAdded,
      '删除行数': contributor.totalLinesRemoved,
      '涉及文件数': contributor.files?.length || 0,
      '主要贡献领域': contributor.contributionAreas || [],
      '重要提交': contributor.importantCommits || [],
    });

    return result.trim();
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { LLMRunner };
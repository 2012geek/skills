const fs = require('fs').promises;
const path = require('path');

class AgentRunner {
  constructor(agentsDir) {
    this.agentsDir = agentsDir;
  }

  async loadAgent(agentName) {
    const agentPath = path.join(this.agentsDir, `${agentName}.md`);
    const content = await fs.readFile(agentPath, 'utf-8');
    return this.parseAgentDefinition(content);
  }

  parseAgentDefinition(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
    if (!frontmatterMatch) {
      throw new Error('Agent definition missing frontmatter');
    }

    const frontmatter = frontmatterMatch[1];
    const definition = content.substring(frontmatterMatch[0].length);

    return {
      name: this.extractYamlValue(frontmatter, 'name') || '',
      description: this.extractYamlValue(frontmatter, 'description') || '',
      model: this.extractYamlValue(frontmatter, 'model') || 'inherit',
      color: this.extractYamlValue(frontmatter, 'color') || 'blue',
      definition: definition.trim()
    };
  }

  extractYamlValue(yaml, key) {
    const match = yaml.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  buildPrompt(agent, context) {
    let prompt = agent.definition;

    if (context.files && context.files.length > 0) {
      prompt += '\n\n## Changed Files\n\n';
      for (const file of context.files) {
        prompt += `### ${file.filename}\n`;
        prompt += `**Status**: ${file.status} | **Changes**: +${file.additions}/-${file.deletions}\n\n`;
        if (file.patch) {
          const patchContent = typeof file.patch === 'string' ? file.patch : (file.patch.diff || '');
          if (patchContent) {
            const maxLines = 500;
            const patchLines = patchContent.split('\n');
            const preview = patchLines.slice(0, Math.min(maxLines, patchLines.length));
            prompt += `**Diff**:\n\`\`\`diff\n${preview.join('\n')}${patchLines.length > maxLines ? '\n...' : ''}\n\`\`\`\n\n`;
          }
        }
      }
    }

    if (context.recentCommits) {
      prompt += '\n\n## Recent Commits\n\n';
      prompt += context.recentCommits;
    }

    if (context.ciStatus) {
      prompt += '\n\n## CI Status\n\n';
      prompt += context.ciStatus;
    }

    if (context.issueDescription) {
      prompt += '\n\n## Issue Description\n\n';
      prompt += context.issueDescription;
    }

    if (context.reproductionTest) {
      prompt += '\n\n## Reproduction Test\n\n';
      prompt += context.reproductionTest;
    }

    if (context.changedFiles) {
      prompt += '\n\n## Changed Files (for test generation)\n\n';
      prompt += context.changedFiles.join('\n');
    }

    return prompt;
  }

  async runAgent(agentName, context) {
    const agent = await this.loadAgent(agentName);
    const prompt = this.buildPrompt(agent, context);
    return { agent: agent.name, model: agent.model, prompt };
  }

  parseFindings(response) {
    const jsonMatch = response.match(/```json\s*([\s\S]+?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        throw new Error(`Failed to parse findings JSON: ${e.message}`);
      }
    }

    try {
      return JSON.parse(response);
    } catch (e) {
      throw new Error(`Failed to parse findings: response is not valid JSON`);
    }
  }

  parsePatch(response) {
    const diffMatch = response.match(/```diff\s*([\s\S]+?)\s*```/);
    if (diffMatch) {
      return diffMatch[1];
    }
    throw new Error('No unified diff found in response (expected ```diff block)');
  }

  async listAgents() {
    const files = await fs.readdir(this.agentsDir);
    const agents = [];
    for (const file of files) {
      if (file.endsWith('.md')) {
        try {
          const agent = await this.loadAgent(file.replace('.md', ''));
          agents.push({ name: agent.name, description: agent.description, model: agent.model });
        } catch (e) {
          // skip unloadable agents
        }
      }
    }
    return agents;
  }
}

module.exports = { AgentRunner };

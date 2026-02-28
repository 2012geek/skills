/**
 * LLMFixer - Slide markdown fixing using Claude
 */

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';

const FIXER_AGENT = path.join(__dirname, '../agents/slide-fixer.md');

export class LLMFixer {
  constructor(config = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.model = config.model || 'claude-3-5-sonnet-20250214';
    this.maxTokens = config.maxTokens || 8192;
    this.agentPrompt = this.loadAgentPrompt();
  }

  /**
   * Load the slide-fixer agent prompt
   */
  loadAgentPrompt() {
    try {
      return fs.readFileSync(FIXER_AGENT, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load slide-fixer agent: ${error.message}`);
    }
  }

  /**
   * Fix slide markdown based on judgment
   * @param {string} markdown - Original slide markdown
   * @param {Object} judgment - Judgment result from LLMJudge
   * @returns {Promise<string>} Fixed markdown
   */
  async fix(markdown, judgment) {
    // Build prompt
    const prompt = this.buildPrompt(markdown, judgment);

    // Call Claude API
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      // Extract fixed markdown
      return this.extractMarkdown(response.content[0].text);
    } catch (error) {
      throw new Error(`Claude API call failed: ${error.message}`);
    }
  }

  /**
   * Build fix prompt from markdown and judgment
   * @param {string} markdown - Original markdown
   * @param {Object} judgment - Judgment result
   * @returns {string} Prompt
   */
  buildPrompt(markdown, judgment) {
    let prompt = this.agentPrompt;
    prompt += '\n\n## Input\n\n';
    prompt += '### Original Slide Markdown\n\n';
    prompt += '```markdown\n' + markdown + '\n```\n\n';
    prompt += '### Judgment Feedback\n\n';
    prompt += '```json\n' + JSON.stringify(judgment, null, 2) + '\n```\n\n';
    prompt += '## Task\n\nFix the markdown to address the issues identified in the judgment.\n\n';
    prompt += 'Remember:\n';
    prompt += '- Preserve content semantics\n';
    prompt += '- Only adjust layout, styling, or structure\n';
    prompt += '- Prefer standard Slidev layouts\n';
    prompt += '- Return only the fixed markdown string, no explanation\n';

    return prompt;
  }

  /**
   * Extract markdown from response
   * @param {string} content - Response text
   * @returns {string} Extracted markdown
   */
  extractMarkdown(content) {
    // Remove markdown code blocks if present
    const codeBlockMatch = content.match(/```markdown\n?([\s\S]*?)\n?```/) ||
                           content.match(/```\n?([\s\S]*?)\n?```/);

    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Remove any explanatory text before/after
    const lines = content.split('\n');
    let inMarkdown = false;
    let markdownLines = [];

    for (const line of lines) {
      // Skip explanatory lines
      if (line.match(/^(Here is|The fixed|Below is|I've fixed)/i)) {
        continue;
      }

      // Start collecting markdown at first heading or fence
      if (!inMarkdown && (line.startsWith('#') || line.startsWith('---'))) {
        inMarkdown = true;
      }

      if (inMarkdown) {
        markdownLines.push(line);
      }
    }

    const result = markdownLines.join('\n').trim();

    // If we didn't find markdown content, return original content
    if (!result) {
      return content.trim();
    }

    return result;
  }

  /**
   * Fix slide markdown from file
   * @param {string} markdownPath - Path to markdown file
   * @param {Object} judgment - Judgment result
   * @returns {Promise<string>} Fixed markdown
   */
  async fixFile(markdownPath, judgment) {
    if (!fs.existsSync(markdownPath)) {
      throw new Error(`Markdown file not found: ${markdownPath}`);
    }

    const markdown = fs.readFileSync(markdownPath, 'utf-8');
    return this.fix(markdown, judgment);
  }

  /**
   * Fix slide markdown and save to file
   * @param {string} markdownPath - Path to markdown file
   * @param {Object} judgment - Judgment result
   * @returns {Promise<string>} Fixed markdown
   */
  async fixAndSave(markdownPath, judgment) {
    const fixed = await this.fixFile(markdownPath, judgment);

    // Create backup
    const backupPath = markdownPath + '.backup';
    fs.copyFileSync(markdownPath, backupPath);

    // Save fixed version
    fs.writeFileSync(markdownPath, fixed, 'utf-8');

    return fixed;
  }
}

const Anthropic = require('@anthropic-ai/sdk');

class LLMSlideFixer {
  constructor(options = {}) {
    const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for LLMSlideFixer');
    }
    this.client = new Anthropic({ apiKey });
    this.model = options.model || 'claude-3-5-sonnet-20241022';
  }

  async fix(markdownContent, judgment) {
    // Input validation
    if (typeof markdownContent !== 'string' || markdownContent.trim() === '') {
      throw new Error('markdownContent must be a non-empty string');
    }

    if (!judgment || typeof judgment !== 'object') {
      throw new Error('judgment must be an object with issues and suggestions arrays');
    }

    if (!Array.isArray(judgment.issues) || !Array.isArray(judgment.suggestions)) {
      throw new Error('judgment must have issues and suggestions arrays');
    }

    try {
      const prompt = this._buildFixPrompt(markdownContent, judgment);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        timeout: 60000, // 60 seconds
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      return this._extractFixedMarkdown(response);
    } catch (error) {
      if (error.status === 401) {
        throw new Error('Invalid API key - check ANTHROPIC_API_KEY');
      } else if (error.status === 429) {
        throw new Error('Rate limit exceeded - please retry later');
      } else if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
        throw new Error('Network connection failed');
      }
      throw new Error(`LLM fix failed: ${error.message}`);
    }
  }

  _buildFixPrompt(content, judgment) {
    return `Fix this slide markdown to address the following issues:

Issues:
${judgment.issues.map(i => `- ${i}`).join('\n')}

Suggestions:
${judgment.suggestions.map(s => `- ${s}`).join('\n')}

Original Content:
\`\`\`markdown
${content}
\`\`\`

Return ONLY the fixed markdown, no explanation. Keep the same frontmatter structure if present.`;
  }

  _extractFixedMarkdown(response) {
    if (!response.content || response.content.length === 0) {
      throw new Error('Empty response from LLM');
    }

    const text = response.content[0].text;
    if (!text) {
      throw new Error('No text in LLM response');
    }

    // Try multiple patterns in order
    const patterns = [
      /```markdown\s*\n([\s\S]+?)\n```/,  // Standard markdown block
      /```\s*\n([\s\S]+?)\n```/            // Generic code block
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return text.trim();
  }
}

module.exports = LLMSlideFixer;

/**
 * LLMJudge - Slide quality judgment using Claude vision
 */

import fs from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JUDGE_AGENT = path.join(__dirname, '../agents/slide-judge.md');

export class LLMJudge {
  constructor(config = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.model = config.model || 'claude-3-5-sonnet-20250214';
    this.maxTokens = config.maxTokens || 4096;
    this.agentPrompt = this.loadAgentPrompt();
  }

  /**
   * Load the slide-judge agent prompt
   */
  loadAgentPrompt() {
    try {
      return fs.readFileSync(JUDGE_AGENT, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to load slide-judge agent: ${error.message}`);
    }
  }

  /**
   * Judge slide quality from screenshot
   * @param {string} screenshotPath - Path to slide screenshot
   * @returns {Promise<Object>} Judgment result
   */
  async judge(screenshotPath) {
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    // Read and encode image
    const imageBuffer = fs.readFileSync(screenshotPath);
    const base64Image = imageBuffer.toString('base64');
    const mediaType = this.getMediaType(screenshotPath);

    // Build message
    const message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: this.agentPrompt
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Image
          }
        }
      ]
    };

    // Call Claude API
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [message]
      });

      // Extract JSON response
      const content = response.content[0].text;
      return this.parseJudgment(content);
    } catch (error) {
      throw new Error(`Claude API call failed: ${error.message}`);
    }
  }

  /**
   * Parse judgment JSON from response
   * @param {string} content - Response text
   * @returns {Object} Parsed judgment
   */
  parseJudgment(content) {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
                       content.match(/```\n?([\s\S]*?)\n?```/);

      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const judgment = JSON.parse(jsonStr);

      // Validate required fields
      const required = ['layout', 'hierarchy', 'whitespace', 'readability', 'overall', 'needsFix'];
      for (const field of required) {
        if (!(field in judgment)) {
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // Ensure scores are numbers 0-100
      for (const field of ['layout', 'hierarchy', 'whitespace', 'readability', 'overall']) {
        if (typeof judgment[field] !== 'number' || judgment[field] < 0 || judgment[field] > 100) {
          throw new Error(`Invalid score for ${field}: ${judgment[field]}`);
        }
      }

      return judgment;
    } catch (error) {
      throw new Error(`Failed to parse judgment JSON: ${error.message}\nContent: ${content}`);
    }
  }

  /**
   * Get media type from file extension
   * @param {string} filepath - File path
   * @returns {string} Media type
   */
  getMediaType(filepath) {
    const ext = path.extname(filepath).toLowerCase();
    const types = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    };

    const type = types[ext];
    if (!type) {
      throw new Error(`Unsupported image format: ${ext}`);
    }

    return type;
  }

  /**
   * Check if judgment passes (overall >= 80)
   * @param {Object} judgment - Judgment result
   * @returns {boolean} True if passes
   */
  passes(judgment) {
    return judgment.overall >= 80;
  }

  /**
   * Evaluate slide quality from image buffer
   * @param {Buffer} imageBuffer - Image buffer
   * @param {string} mediaType - Media type (e.g., 'image/png')
   * @returns {Promise<Object>} Judgment result
   */
  async evaluate(imageBuffer, mediaType = 'image/png') {
    if (!Buffer.isBuffer(imageBuffer)) {
      throw new Error('Expected imageBuffer to be a Buffer');
    }

    const base64Image = imageBuffer.toString('base64');

    // Build message
    const message = {
      role: 'user',
      content: [
        {
          type: 'text',
          text: this.agentPrompt
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: base64Image
          }
        }
      ]
    };

    // Call Claude API
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [message]
      });

      // Extract JSON response
      const content = response.content[0].text;
      return this.parseJudgment(content);
    } catch (error) {
      throw new Error(`Claude API call failed: ${error.message}`);
    }
  }

  close() {
    // No resources to clean up for now
  }
}

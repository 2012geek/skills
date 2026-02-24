const LLMSlideFixer = require('../scripts/llm-slide-fixer');

describe('LLMSlideFixer', () => {
  let fixer;

  beforeAll(() => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('Skipping tests: ANTHROPIC_API_KEY not set');
    } else {
      fixer = new LLMSlideFixer();
    }
  });

  test('should throw error if API key not provided', () => {
    expect(() => new LLMSlideFixer({ apiKey: null })).toThrow('ANTHROPIC_API_KEY is required');
  });

  test('should throw error for invalid markdownContent', async () => {
    if (!fixer) return;

    await expect(fixer.fix('', { issues: [], suggestions: [] }))
      .rejects.toThrow('markdownContent must be a non-empty string');

    await expect(fixer.fix(null, { issues: [], suggestions: [] }))
      .rejects.toThrow('markdownContent must be a non-empty string');
  });

  test('should throw error for invalid judgment', async () => {
    if (!fixer) return;

    await expect(fixer.fix('# Title', null))
      .rejects.toThrow('judgment must be an object');

    await expect(fixer.fix('# Title', {}))
      .rejects.toThrow('judgment must have issues and suggestions arrays');

    await expect(fixer.fix('# Title', { issues: [], suggestions: null }))
      .rejects.toThrow('judgment must have issues and suggestions arrays');
  });

  test('should fix slide based on LLM feedback', async () => {
    if (!fixer) return;

    const original = '# Title\n\n' + 'Line of content\n'.repeat(20);
    const feedback = {
      issues: ['Vertical overflow - content too long'],
      suggestions: ['Split into multiple slides', 'Use more concise language']
    };

    const fixed = await fixer.fix(original, feedback);
    expect(fixed).not.toEqual(original);
    expect(fixed.length).toBeLessThan(original.length);
  });
});

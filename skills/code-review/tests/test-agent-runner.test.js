const { AgentRunner } = require('../lib');

describe('AgentRunner review guide injection', () => {
  test('injects project-specific review guide into generated prompts', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      {
        definition: 'Base agent instructions.',
      },
      {
        reviewGuide: {
          path: '.claude/skills/gitcode-code-review/references/vla-factory-review-guide.md',
          content: 'Check episode boundary handling and action tensor shapes.'
        },
        context: {
          pr: {
            number: 12,
            title: 'fix dataset sampler',
            body: ''
          },
          files: []
        },
        summary: {
          purpose: '修复问题'
        }
      }
    );

    expect(prompt).toContain('## Project-Specific Review Guide');
    expect(prompt).toContain('vla-factory-review-guide.md');
    expect(prompt).toContain('Check episode boundary handling and action tensor shapes.');
    expect(prompt).toContain('Do not report style-only issues');
    expect(prompt).toContain('## PR 信息');
  });
});

const { AgentRunner } = require('../lib');

describe('AgentRunner review guide injection', () => {
  test('includes changed lines beyond the former 500-line cutoff', () => {
    const runner = new AgentRunner({});
    const patch = Array.from({ length: 600 }, (_, index) => `+changed-line-${index + 1}`).join('\n');
    const prompt = runner.buildPrompt(
      { definition: 'Review all changed lines.' },
      {
        context: {
          pr: { number: 5, title: 'large diff', body: '' },
          files: [{ filename: 'large.js', status: 'modified', additions: 600, deletions: 0, patch }]
        }
      }
    );

    expect(prompt).toContain('+changed-line-1');
    expect(prompt).toContain('+changed-line-600');
  });

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

  test('injects Chinese output-language directive when commentLanguage is zh', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { definition: 'Base agent instructions.' },
      {
        context: { pr: { number: 5, title: 'feat', body: '' }, files: [] },
        commentLanguage: 'zh'
      }
    );

    expect(prompt).toContain('## Output Language');
    expect(prompt).toContain('简体中文');
    expect(prompt).toContain('title');
    expect(prompt).toContain('description');
    expect(prompt).toContain('fix.explanation');
  });

  test('injects English output-language directive when commentLanguage is en', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { definition: 'Base agent instructions.' },
      {
        context: { pr: { number: 5, title: 'feat', body: '' }, files: [] },
        commentLanguage: 'en'
      }
    );

    expect(prompt).toContain('## Output Language');
    expect(prompt).toContain('English');
    expect(prompt).not.toContain('简体中文');
  });

  test('omits output-language directive when commentLanguage is not set', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { definition: 'Base agent instructions.' },
      {
        context: { pr: { number: 5, title: 'feat', body: '' }, files: [] }
      }
    );

    expect(prompt).not.toContain('## Output Language');
  });
});

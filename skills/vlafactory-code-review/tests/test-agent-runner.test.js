const { AgentRunner } = require('../lib');

describe('AgentRunner review guide injection', () => {
  test('includes changed lines beyond the former 500-line cutoff', () => {
    const runner = new AgentRunner({});
    const patch = Array.from({ length: 600 }, (_, index) => `+changed-line-${index + 1}`).join('\n');
    const prompt = runner.buildPrompt(
      { name: 'bug-scanner-diff', definition: 'Review all changed lines.' },
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
        name: 'semantic-analyzer',
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
    expect(prompt).toContain('## PR metadata');
    expect(prompt).toContain('<untrusted_pr_data>');
    expect(prompt).toContain('</untrusted_pr_data>');
  });

  test('injects Chinese output-language directive when commentLanguage is zh', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { name: 'semantic-analyzer', definition: 'Base agent instructions.' },
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
      { name: 'semantic-analyzer', definition: 'Base agent instructions.' },
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
      { name: 'semantic-analyzer', definition: 'Base agent instructions.' },
      {
        context: { pr: { number: 5, title: 'feat', body: '' }, files: [] }
      }
    );

    expect(prompt).not.toContain('## Output Language');
  });

  test('adds line-numbered after-state excerpts for context reviewers', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { name: 'semantic-analyzer', definition: 'Trace contracts.' },
      {
        context: {
          pr: { number: 9, title: 'change return value', body: '' },
          files: [{
            filename: 'src/value.py', status: 'modified', additions: 1, deletions: 1,
            patch: '@@ -2,3 +2,3 @@\n def value():\n-    return 1\n+    return 2\n ',
            fullContent: 'def helper():\n    pass\ndef value():\n    return 2\n'
          }]
        }
      }
    );

    expect(prompt).toContain('## Relevant after-state context');
    expect(prompt).toMatch(/4 \|     return 2/);
  });

  test('uses one shared top-level-array output contract', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { name: 'code-analyzer', definition: 'Review operations.' },
      { context: { pr: { number: 1, title: 'x', body: '' }, files: [] } }
    );

    expect(prompt).toContain('Return only a JSON array');
    expect(prompt).toContain('Return `[]`');
    expect(prompt).toContain('`contextCode`, `fix`, and `references` are optional');
  });

  test('bounds routine reviewer prompts and routes documentation out of code roles', () => {
    const runner = new AgentRunner({});
    const largePatch = label => Array.from(
      { length: 5000 },
      (_, index) => `+${label}-changed-line-${index + 1}`
    ).join('\n');
    const files = [
      {
        filename: 'docs/architecture/large.md', status: 'added', additions: 5000,
        deletions: 0, patch: largePatch('DOC-ONLY')
      },
      {
        filename: 'src/model.py', status: 'modified', additions: 5000,
        deletions: 0, patch: largePatch('MODEL')
      },
      {
        filename: 'scripts/ci/daemon.py', status: 'modified', additions: 5000,
        deletions: 0, patch: largePatch('DAEMON')
      },
      {
        filename: 'test/test_model.py', status: 'modified', additions: 5000,
        deletions: 0, patch: largePatch('TEST')
      },
    ];

    for (const name of ['bug-scanner-diff', 'code-analyzer', 'semantic-analyzer']) {
      const prompt = runner.buildPrompt(
        { name, definition: 'Perform the assigned review.' },
        { context: { pr: { number: 22, title: 'large PR', body: '' }, files } }
      );
      expect(Buffer.byteLength(prompt, 'utf8') < 96 * 1024).toBe(true);
      expect(prompt).toContain('docs/architecture/large.md'); // manifest remains complete
      expect(prompt).not.toContain('DOC-ONLY-changed-line-1');
      expect(prompt).toContain('[middle of this diff omitted by prompt budget]');
      expect(prompt).toContain('do not infer findings from omitted content');
    }
  });

  test('routes documentation content to documentation specialists', () => {
    const runner = new AgentRunner({});
    const prompt = runner.buildPrompt(
      { name: 'en-cn-parity-checker', definition: 'Compare documentation.' },
      {
        context: {
          pr: { number: 2, title: 'docs', body: '' },
          files: [
            {
              filename: 'README.md', status: 'modified', additions: 1,
              deletions: 0, patch: '@@ -1 +1 @@\n+documented-command --new'
            },
            {
              filename: 'src/main.py', status: 'modified', additions: 1,
              deletions: 0, patch: '@@ -1 +1 @@\n+run_new_command()'
            },
          ]
        }
      }
    );

    expect(prompt).toContain('+documented-command --new');
    expect(prompt).not.toContain('+run_new_command()');
  });
});

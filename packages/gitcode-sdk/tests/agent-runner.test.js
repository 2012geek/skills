const { AgentRunner } = require('../src/agent-runner');
const path = require('path');

const agentsDir = path.join(__dirname, '__fixtures__', 'agents');

describe('AgentRunner', () => {
  test('loadAgent() parses YAML frontmatter correctly', async () => {
    const runner = new AgentRunner(agentsDir);
    const agent = await runner.loadAgent('test-agent');
    expect(agent.name).toBe('test-agent');
    expect(agent.model).toBe('sonnet');
    expect(agent.description).toBe('A test agent for unit tests');
  });

  test('buildPrompt() injects context into definition', async () => {
    const runner = new AgentRunner(agentsDir);
    const agent = await runner.loadAgent('test-agent');
    const prompt = runner.buildPrompt(agent, {
      issueDescription: 'File a.js has a null pointer bug at line 10',
      reproductionTest: 'assert(foo !== null)'
    });
    expect(prompt).toContain('Issue Description');
    expect(prompt).toContain('Reproduction Test');
    expect(prompt).toContain('null pointer bug');
  });

  test('parseFindings() extracts JSON array from response', () => {
    const runner = new AgentRunner(agentsDir);
    const response = '```json\n[{"severity":"medium","title":"test bug","file":"a.js","line":10}]\n```';
    const findings = runner.parseFindings(response);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('test bug');
  });

  test('parseFindings() handles raw JSON without code block', () => {
    const runner = new AgentRunner(agentsDir);
    const response = '[{"severity":"low","title":"minor"}]';
    const findings = runner.parseFindings(response);
    expect(findings).toHaveLength(1);
  });

  test('parsePatch() extracts unified diff from response', () => {
    const runner = new AgentRunner(agentsDir);
    const response = 'Here is the fix:\n```diff\n--- a/file.js\n+++ b/file.js\n@@ -10,1 +10,1 @@\n-old line\n+new line\n```';
    const patch = runner.parsePatch(response);
    expect(patch).toContain('--- a/file.js');
    expect(patch).toContain('+new line');
  });

  test('malformed JSON → throws', () => {
    const runner = new AgentRunner(agentsDir);
    expect(() => runner.parseFindings('not json at all')).toThrow();
  });

  test('no diff in response → throws', () => {
    const runner = new AgentRunner(agentsDir);
    expect(() => runner.parsePatch('no diff here')).toThrow();
  });

  test('listAgents() discovers available agents', async () => {
    const runner = new AgentRunner(agentsDir);
    const agents = await runner.listAgents();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].name).toBe('test-agent');
  });
});

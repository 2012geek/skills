const { CommentFormatter } = require('../lib/comment-formatter');

// Mock config
const config = {};

describe('CommentFormatter', () => {
  let formatter;

  beforeEach(() => {
    formatter = new CommentFormatter(config);
  });

  describe('addReferences (agent-supplied only)', () => {
    test('renders issue.references when agent provides them', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'dataclass mutable default',
        description: 'Using mutable default in dataclass',
        contextCode: 'lock: threading.Lock = threading.Lock()',
        references: [
          { title: 'Python dataclasses 官方文档', url: 'https://docs.python.org/3/library/dataclasses.html' },
          { title: 'PEP 557 - Data Classes', url: 'https://peps.python.org/pep-0557/' }
        ]
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addReferences(issue, body);

      expect(result).toContain('**参考资料**:');
      expect(result).toContain('Python dataclasses 官方文档');
      expect(result).toContain('https://docs.python.org/3/library/dataclasses.html');
      expect(result).toContain('PEP 557 - Data Classes');
    });

    test('returns body unchanged when issue has no references field', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'unknown issue',
        description: 'Some random issue'
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addReferences(issue, body);

      expect(result).not.toContain('**参考资料**:');
      expect(result).toBe(body);
    });

    test('returns body unchanged when issue.references is empty array', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'issue with empty references',
        description: 'desc',
        references: []
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addReferences(issue, body);

      expect(result).not.toContain('**参考资料**:');
      expect(result).toBe(body);
    });

    test('does NOT auto-recommend based on keywords (regression: file/path no longer trigger Python os.path)', () => {
      // Historical bug: an issue whose body mentioned "file" and "path" in
      // ordinary English prose (e.g. doc-drift discussing "EN file vs CN
      // file") used to be matched by the keyword fallback and got
      // Python os.path / File I/O references appended — totally irrelevant.
      // After the fallback removal, such an issue with no explicit
      // references field must NOT get any auto-recommendation.
      const issue = {
        file: 'docs/modules/data-module.cn.md',
        line: 457,
        title: "EN/CN terminology drift: CN renamed 契约→标准",
        description: "The PR updates the file to rename section headings; the parallel EN file was NOT touched",
        contextCode: "- ### 4.4 训练侧数据契约\n+ ### 4.4 训练侧数据标准  (CN file vs EN file)"
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addReferences(issue, body);

      expect(result).not.toContain('Python os.path');
      expect(result).not.toContain('File I/O');
      expect(result).not.toContain('**参考资料**:');
      expect(result).not.toContain('**官方参考资料**:');
    });

    test('deduplicates references with the same URL', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'issue with dup refs',
        description: 'desc',
        references: [
          { title: 'Doc 1', url: 'https://example.com/1' },
          { title: 'Doc 1 Duplicate', url: 'https://example.com/1' },
          { title: 'Doc 2', url: 'https://example.com/2' }
        ]
      };

      const body = '';
      const result = formatter.addReferences(issue, body);

      // Count by URL — duplicates collapse
      const matches = result.match(/https:\/\/example\.com\/1/g) || [];
      expect(matches).toHaveLength(1);
      expect(result).toContain('https://example.com/2');
    });
  });

  describe('deduplicateRefs', () => {
    test('should remove duplicate URLs', () => {
      const refs = [
        { title: 'Doc 1', url: 'https://example.com/1' },
        { title: 'Doc 2', url: 'https://example.com/2' },
        { title: 'Doc 1 Duplicate', url: 'https://example.com/1' }
      ];

      const result = formatter.deduplicateRefs(refs);

      expect(result).toHaveLength(2);
      expect(result[0].url).toBe('https://example.com/1');
      expect(result[1].url).toBe('https://example.com/2');
    });

    test('should handle empty array', () => {
      const result = formatter.deduplicateRefs([]);
      expect(result).toHaveLength(0);
    });

    test('should handle single reference', () => {
      const refs = [
        { title: 'Doc 1', url: 'https://example.com/1' }
      ];

      const result = formatter.deduplicateRefs(refs);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe('https://example.com/1');
    });
  });

  describe('commentLanguage', () => {
    test('formats built-in labels in English', () => {
      formatter = new CommentFormatter({ codeReview: { commentLanguage: 'en' } });

      const result = formatter.formatIssue({
        file: 'test.py',
        line: 10,
        title: 'Example issue',
        description: 'Example description',
        contextCode: 'print("bad")',
        fix: { explanation: 'Use a safer implementation.' },
        references: [
          { title: 'Example Doc', url: 'https://example.com/doc' }
        ]
      });

      expect(result.body).toContain('**Context code**:');
      expect(result.body).toContain('**Fix**:');
      expect(result.body).toContain('**References**:');
      // The historical "Official references" label was for auto-recommended
      // refs; now that only agent-supplied refs render, the label is always
      // "References" / "参考资料".
      expect(result.body).not.toContain('**Official references**:');
    });

    test('formats no-issues comment in English', () => {
      formatter = new CommentFormatter({ codeReview: { commentLanguage: 'en' } });

      const result = formatter.formatNoIssues();

      expect(result).toContain('## Code review');
      expect(result).toContain('No issues found.');
    });
  });

  describe('formatIssue position', () => {
    let fmt;
    beforeEach(() => { fmt = new CommentFormatter({}); });

    test('position defaults to issue.line (new file line number)', () => {
      const r = fmt.formatIssue({
        file: 'a.py', line: 282, title: 't', description: 'd'
      });
      expect(r.position).toBe(282);
    });

    test('issue.position explicit override takes priority', () => {
      const r = fmt.formatIssue({
        file: 'a.py', line: 999, position: 42, title: 't', description: 'd'
      });
      expect(r.position).toBe(42);
    });

    test('patchInfo is ignored for position (position is just issue.line)', () => {
      const r = fmt.formatIssue(
        { file: 'a.py', line: 225, title: 't', description: 'd' },
        { patch: 'fake patch content', status: 'modified' }
      );
      expect(r.position).toBe(225);
    });
  });
});

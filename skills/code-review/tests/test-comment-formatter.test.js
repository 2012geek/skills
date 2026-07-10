const { CommentFormatter } = require('../lib/comment-formatter');

// Mock config
const config = {};

describe('CommentFormatter - referenceCategories', () => {
  let formatter;

  beforeEach(() => {
    formatter = new CommentFormatter(config);
  });

  describe('addOfficialReferences with referenceCategories', () => {
    test('should add references for python_dataclass category', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'dataclass mutable default',
        description: 'Using mutable default in dataclass',
        contextCode: 'lock: threading.Lock = threading.Lock()',
        referenceCategories: ['python_dataclass', 'python_mutable_default']
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).toContain('**官方参考资料**:');
      expect(result).toContain('Python dataclasses 官方文档');
      expect(result).toContain('https://docs.python.org/3/library/dataclasses.html');
    });

    test('should fallback to keyword matching when no referenceCategories', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'argparse type=bool error',
        description: 'Using type=bool in argparse',
        contextCode: 'parser.add_argument("--verbose", type=bool)'
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).toContain('**官方参考资料**:');
      expect(result).toContain('argparse');
    });

    test('should not add references when no match', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'unknown issue',
        description: 'Some random issue'
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).not.toContain('**官方参考资料**:');
    });

    test('should prioritize direct references over referenceCategories', () => {
      const issue = {
        file: 'test.py',
        line: 10,
        title: 'test issue',
        description: 'test',
        references: [
          { title: 'Custom Doc', url: 'https://example.com/custom' }
        ],
        referenceCategories: ['python_dataclass']
      };

      const body = '**Test Title**\n\nTest description';
      const result = formatter.addOfficialReferences(issue, body);

      expect(result).toContain('**官方参考资料**:');
      expect(result).toContain('Custom Doc');
      expect(result).toContain('https://example.com/custom');
      expect(result).not.toContain('Python dataclasses 官方文档');
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
      expect(result.body).toContain('**Official references**:');
      expect(result.body).toContain('**References**:');
    });

    test('formats no-issues comment in English', () => {
      formatter = new CommentFormatter({ codeReview: { commentLanguage: 'en' } });

      const result = formatter.formatNoIssues();

      expect(result).toContain('## Code review');
      expect(result).toContain('No issues found.');
    });
  });
});

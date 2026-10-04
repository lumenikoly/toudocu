import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { searchDocumentation, formatSearchText } from './search.js';

test('search ranks stable IDs and complete words, preserves Unicode and validates limits', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const entries = [
    ['index.md', '# Search\n\nЁж authentication.'],
    [
      'modules/MOD-AUTH.md',
      '<!-- toudocu\nid: MOD-AUTH\n-->\n# MOD-AUTH: Authentication\n\nA module.',
    ],
    ['guides/auth.md', '# Authentication guide\n\n## Details\n\nAuthentication explained.'],
  ];
  const project = compileProject(
    entries.map(([sourcePath = '', content = '']) => ({ sourcePath, content, modifiedAt: now })),
    {
      now,
      staleDays: 0,
      links: { documentRoot: '/repo/docs', repositoryRoot: '/repo' },
      repository: { exists: () => false, matches: () => [] },
      projectChangelog: {
        sourcePath: 'CHANGELOG.md',
        content: '# Releases\n\nAuthentication release notes.',
        modifiedAt: now,
      },
    },
  );
  expect(searchDocumentation(project, 'MOD-AUTH', 20, 'test').results[0]?.id).toBe('MOD-AUTH');
  expect(searchDocumentation(project, 'еж', 20, 'test').results[0]?.path).toBe('index.md');
  expect(searchDocumentation(project, 'authentic', 20, 'test').total).toBe(0);
  const report = searchDocumentation(project, 'authentication', 1, 'test');
  expect(report.total).toBe(3);
  expect(report.results).toHaveLength(1);
  expect(formatSearchText(report)).toContain('Found: 3\n');
  expect(searchDocumentation(project, 'release', 20, 'test').total).toBe(0);
  expect(() => searchDocumentation(project, '---', 20, 'test')).toThrow(
    'search query cannot be empty',
  );
  expect(() => searchDocumentation(project, 'auth', 101, 'test')).toThrow(
    '--limit must be a number from 1 to 100',
  );
});

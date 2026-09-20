import { expect, test } from 'vitest';
import { buildDocumentIndex, naturalCompare } from './project.js';

test('natural sorting, stable routes, output collisions and global structure match legacy rules', () => {
  expect(['10', '02', '2', '1'].sort(naturalCompare)).toEqual(['1', '2', '02', '10']);
  const now = new Date('2026-09-19T00:00:00Z');
  const entries = [
    ['use-cases/z.md', '<!-- toudocu\nid: UC-LOGIN\n-->\n# Ёж'],
    ['index.md', '# Project\n\nDescription.'],
    ['use-cases/a.md', '<!-- toudocu\nid: UC-LOGIN\n-->\n# Еж'],
    ['health.md', '# Health'],
    ['architecture/overview.md', '# Architecture\n\nDescription.'],
  ];
  const project = buildDocumentIndex(
    entries.map(([sourcePath = '', content = '']) => ({ sourcePath, content, modifiedAt: now })),
    { now, staleDays: 0 },
  );
  expect(project.documents[0]?.sourcePath).toBe('index.md');
  expect(project.byPath.get('use-cases/a.md')?.outputPath).toBe('use-cases/UC-LOGIN.html');
  expect(project.byPath.get('use-cases/z.md')?.outputPath).toBe('use-cases/UC-LOGIN-2.html');
  expect(project.issues.filter((issue) => issue.code === 'duplicate-title')).toHaveLength(2);
  expect(project.issues.filter((issue) => issue.code === 'output-path-collision')).toHaveLength(1);
  expect(project.issues.some((issue) => issue.code.startsWith('missing-architecture'))).toBe(false);
  expect(project.healthOutputPath).toBe('documentation-health.html');
  expect(project.collections.get('use-case')).toHaveLength(2);
  expect(project.directories.has('use-cases')).toBe(true);
});

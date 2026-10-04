import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { buildReaderSummary } from './summary.js';

test('reader search labels use the selected locale without mutating compiler documents', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const project = compileProject(
    [{ sourcePath: 'index.md', content: '# Project', modifiedAt: now }],
    {
      now,
      staleDays: 0,
      repository: { exists: () => false, matches: () => [] },
      links: { documentRoot: '/repo/docs', repositoryRoot: '/repo' },
    },
  );
  expect(buildReaderSummary(project, { locale: 'ru_RU' }).searchIndex[0]?.typeLabel).toBe(
    'Обзор проекта',
  );
  expect(buildReaderSummary(project, { locale: 'fr' }).searchIndex[0]?.typeLabel).toBe(
    'Project overview',
  );
  expect(project.index.documents[0]?.typeLabel).toBe('Project overview');
});

import { expect, test } from 'vitest';
import { buildDocumentIndex } from '../documents/project.js';
import { resolveLinks } from '../documents/links.js';
import { validateRelationships } from './relationships.js';

test('architecture listing and Mermaid ownership use resolved semantic relationships', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const entries = [
    ['index.md', '# Project'],
    ['architecture/overview.md', '# Architecture\n\n[Listed](listed.md)'],
    [
      'architecture/listed.md',
      '<!-- toudocu\narchitectureQuestion: How does it work?\n-->\n# Details',
    ],
    ['architecture/unlisted.md', '# Unlisted'],
    ['notes.md', '# Notes\n\n```mermaid\n%%{init: {}}%%\nflowchart TD\nA --> B\n```'],
    [
      'flows/a.md',
      '<!-- toudocu\nid: FLOW-A\nuseCase: UC-MISSING\nmodule: MOD-MISSING\n-->\n# Flow',
    ],
    [
      'guides/diagram.md',
      '# Guide\n\n[Architecture](../architecture/overview.md)\n\n```mermaid\nflowchart TD\nA --> B\n```',
    ],
  ];
  const index = buildDocumentIndex(
    entries.map(([sourcePath = '', content = '']) => ({ sourcePath, content, modifiedAt: now })),
    { now, staleDays: 0 },
  );
  const links = resolveLinks(index, { repositoryRoot: '/repo', documentRoot: '/repo/docs' });
  const issues = validateRelationships(index, links.linksByPath);
  expect(
    issues
      .filter((issue) => issue.documentPath === 'architecture/unlisted.md')
      .map((issue) => issue.code),
  ).toEqual(['missing-architecture-question', 'unlisted-architecture-document']);
  expect(
    issues.filter((issue) => issue.documentPath === 'notes.md').map((issue) => issue.code),
  ).toEqual(['forbidden-mermaid-configuration', 'unlinked-mermaid-diagram']);
  expect(
    issues.filter((issue) => issue.documentPath === 'flows/a.md').map((issue) => issue.code),
  ).toEqual(['dangling-use-case-reference', 'dangling-module-reference', 'missing-flow-diagram']);
  expect(
    issues.some(
      (issue) =>
        issue.documentPath === 'architecture/listed.md' ||
        issue.documentPath === 'guides/diagram.md',
    ),
  ).toBe(false);
});

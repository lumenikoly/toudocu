import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { buildProjectReport } from './report.js';

test('report projection preserves public keys, omits optional empties and deduplicates backlinks', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const project = compileProject(
    [
      {
        sourcePath: 'index.md',
        content:
          '# Project\n\n[Architecture](architecture/overview.md)\n\n[Again](architecture/overview.md)',
        modifiedAt: now,
      },
      {
        sourcePath: 'architecture/overview.md',
        content: '# Architecture\n\nHow it works.',
        modifiedAt: now,
      },
      {
        sourcePath: 'modules/core.md',
        content: '<!-- toudocu\nid: MOD-CORE\n-->\n# Core',
        modifiedAt: now,
      },
      {
        sourcePath: 'work/TASK-CORE-001.md',
        content:
          '<!-- toudocu\nid: TASK-CORE-001\nstatus: draft\ntaskType: maintenance\n-->\n# Task',
        modifiedAt: now,
      },
    ],
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => false, matches: () => [] },
      openAPI: [
        {
          sourcePath: 'contracts/api.openapi.yml',
          content: 'openapi: 3.0.3\ninfo: {title: API, version: "1"}\npaths: {}',
        },
      ],
      projectChangelog: {
        sourcePath: 'CHANGELOG.md',
        content: '# Releases\n\n- Authentication release.\n',
        modifiedAt: now,
      },
    },
  );
  const report = buildProjectReport(project, {
    version: 'test',
    generatedAt: now,
    sourceDirectory: '/repo/docs',
    staleDays: 0,
  });
  expect(report.sourceDirectory).toBe('docs');
  expect(report.generatedAt).toBe('2026-09-19T00:00:00Z');
  expect(report.documents[0]?.updatedAt).toBe('2026-09-19T00:00:00Z');
  expect(
    report.documents.find((document) => document.sourcePath === 'index.md')?.relatedDocuments,
  ).toEqual(['architecture/overview.md']);
  expect(
    report.documents.find((document) => document.sourcePath === 'architecture/overview.md')
      ?.backlinks,
  ).toEqual(['index.md']);
  expect(report.knowledge.workItems?.[0]).toHaveProperty('verificationMatrix');
  expect(report.knowledge.workItems?.[0]).not.toHaveProperty('verification');
  expect(report.knowledge.workItems?.[0]).not.toHaveProperty('moduleId');
  expect(report.documents[0]).not.toHaveProperty('markdown');
  expect(report.documents.some((document) => document.sourcePath === 'CHANGELOG.md')).toBe(false);
  expect(report).not.toHaveProperty('openAPIDiagnostics');
  expect(report.stats.errors).toBe(
    report.issues.filter((issue) => issue.severity === 'error').length,
  );
});

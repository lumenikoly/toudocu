import { expect, test } from 'vitest';
import { compileProject } from './compile.js';

test('project compiler connects independent passes and preserves source diagnostics', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const entries = [
    ['index.md', '# Project\n\nA project.'],
    ['architecture/overview.md', '# Architecture\n\nArchitecture description.'],
    [
      'modules/auth.md',
      '<!-- toudocu\nid: MOD-AUTH\n-->\n# Authentication\n\nAuthentication module.',
    ],
    [
      'use-cases/login.md',
      '<!-- toudocu\nid: UC-LOGIN\nmodule: MOD-AUTH\nstatus: done\n-->\n# Login\n\nUser login.\n\n<!-- toudocu:section acceptance-criteria -->\n## Acceptance\n\n- [x] Authenticate',
    ],
    [
      'roadmap.md',
      '# Roadmap\n\n<!-- toudocu:section roadmap-stage -->\n## Delivery\n\n- [ ] UC-LOGIN',
    ],
  ];
  const project = compileProject(
    entries.map(([sourcePath = '', content = '']) => ({ sourcePath, content, modifiedAt: now })),
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => false, matches: () => [] },
      openAPI: [
        {
          sourcePath: 'contracts/auth.openapi.yml',
          content: 'openapi: 3.0.3\ninfo:\n  title: Auth\n  version: 1.0.0\npaths: {}',
        },
      ],
      sourceIssues: [{ severity: 'warning', code: 'source-warning', message: 'Source diagnostic' }],
    },
  );
  expect(project.knowledge.modules[0]?.useCaseIds).toEqual(['UC-LOGIN']);
  expect(project.roadmapStages[0]?.items[0]?.effectiveCompleted).toBe(true);
  expect(project.issues.map((issue) => issue.code)).toContain('roadmap-item-completion-mismatch');
  expect(project.issues.map((issue) => issue.code)).toContain('source-warning');
  expect(project.openAPI[0]?.title).toBe('Auth');
});

test('keeps only valid OpenAPI contracts and sorts their paths naturally', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const validContract = `openapi: 3.0.3
info:
  title: API
  version: 1.0.0
paths: {}`;
  const project = compileProject([], {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: { exists: () => false, matches: () => [] },
    openAPI: [
      { sourcePath: 'contracts/api10.openapi.yml', content: validContract },
      {
        sourcePath: 'contracts/invalid.openapi.yml',
        content: 'openapi: 3.1.invalid\n',
      },
      { sourcePath: 'contracts/api2.openapi.yml', content: validContract },
    ],
  });

  expect(project.openAPI.map((contract) => contract.path)).toEqual([
    'contracts/api2.openapi.yml',
    'contracts/api10.openapi.yml',
  ]);
  expect(project.issues).toContainEqual(
    expect.objectContaining({
      code: 'openapi-invalid-version',
      documentPath: 'contracts/invalid.openapi.yml',
    }),
  );
  expect(project.openAPI).not.toContainEqual(
    expect.objectContaining({ path: 'contracts/invalid.openapi.yml' }),
  );
});

test('keeps the repository changelog separate from ordinary documents', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const project = compileProject(
    [
      { sourcePath: 'index.md', content: '# Project', modifiedAt: now },
      { sourcePath: 'architecture/overview.md', content: '# Architecture', modifiedAt: now },
      { sourcePath: 'changelog.md', content: '# Local notes', modifiedAt: now },
    ],
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo' },
      repository: { exists: () => false, matches: () => [] },
      projectChangelog: {
        sourcePath: 'CHANGELOG.md',
        content:
          '<!-- toudocu\nid: WRONG-ID\nstatus: done\nupdated: 2026-09-18\n-->\n# Root release notes\n\n- Added a release.\n',
        modifiedAt: now,
      },
      projectChangelogTitle: 'Project changelog',
    },
  );

  expect(project.projectChangelog).toMatchObject({
    id: 'CHANGELOG.md',
    sourcePath: 'CHANGELOG.md',
    outputPath: 'project-changelog.html',
    type: 'changelog',
    title: 'Root release notes',
    status: { kind: 'neutral', label: '' },
  });
  expect(project.index.byPath.get('changelog.md')?.title).toBe('Local notes');
  expect(project.index.byPath.has('CHANGELOG.md')).toBe(false);
});

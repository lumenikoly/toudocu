import { expect, test } from 'vitest';
import { compileProject } from './compile.js';
import { buildProjectSummary } from './summary.js';

const now = new Date('2026-09-19T00:00:00Z');

function projectFrom(entries: readonly [string, string][]) {
  return compileProject(
    entries.map(([sourcePath, content]) => ({ sourcePath, content, modifiedAt: now })),
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => false, matches: () => [] },
    },
  );
}

test('builds project info, current status, null-safe stats, and search index', () => {
  const project = projectFrom([
    [
      'index.md',
      '<!-- toudocu\nstatus: active\nstage: beta\nupdated: 2026-09-01\n-->\n# Toudocu\n\nProject description.',
    ],
    [
      'status.md',
      '<!-- toudocu\nstatus: active\n-->\n# Status\n\nStatus description.\n\n<!-- toudocu:section summary -->\n## Summary\n\nEverything is moving.',
    ],
    [
      'roadmap.md',
      '# Roadmap\n\n<!-- toudocu:section roadmap-stage -->\n## Beta\n\n- [ ] DLV-BETA-01 Ship the beta',
    ],
    [
      'work/TASK-AUTH-100.md',
      '<!-- toudocu\nid: TASK-AUTH-100\nstatus: blocked\ntaskType: maintenance\n-->\n# TASK-AUTH-100: Fix auth\n\nAuth blocker.\n\n<!-- toudocu:section result -->\n## Result\n\nAuth is fixed.\n\n<!-- toudocu:section blocker -->\n## Blocker\n\nWaiting for credentials.',
    ],
  ]);
  const summary = buildProjectSummary(project, {
    requestedTitle: 'Custom title',
    root: '/repo/docs',
  });
  expect(summary.projectInfo).toMatchObject({
    title: 'Custom title',
    description: 'Project description.',
    stage: 'beta',
    updated: '2026-09-01',
    summary: 'Everything is moving.',
  });
  expect(summary.currentStatus.activeWork[0]).toMatchObject({ id: 'TASK-AUTH-100', moduleId: '' });
  expect(summary.currentStatus.blockers[0]).toMatchObject({
    taskId: 'TASK-AUTH-100',
    text: 'Waiting for credentials.',
  });
  expect(summary.currentStatus.nextResult?.id).toBe('DLV-BETA-01');
  expect(summary.stats.taskProgress).toBe(0);
  expect(summary.stats.remainingTasks).toBe(1);
  expect(summary.stats.documentsWithoutTasks).toBe(3);
  expect(summary.stats.errors).toBeGreaterThanOrEqual(0);
  expect(summary.searchIndex).toHaveLength(4);
  expect(summary.searchIndex.find((item) => item.path === 'work/TASK-AUTH-100.md')).toMatchObject({
    type: 'work',
    status: 'blocked',
    text: expect.stringContaining('task auth 100'),
  });
});

test('uses overview title/root fallback and preserves empty aggregate semantics', () => {
  const project = projectFrom([
    ['architecture/overview.md', '# Architecture\n\nArchitecture description.'],
  ]);
  const summary = buildProjectSummary(project, { root: '/tmp/example-docs' });
  expect(summary.projectInfo.title).toBe('example-docs');
  expect(summary.projectInfo.status).toMatchObject({
    kind: 'neutral',
    recognized: true,
    label: '',
  });
  expect(summary.projectInfo.updated).toBe('');
  expect(summary.stats).toMatchObject({
    documents: 1,
    totalTasks: 0,
    completedTasks: 0,
    remainingTasks: 0,
    taskProgress: null,
    modules: 0,
    useCases: 0,
    screens: 0,
    risks: 0,
  });
  expect(summary.currentStatus).toEqual({ activeWork: [], blockers: [] });
});

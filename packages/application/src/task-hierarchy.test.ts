import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { buildTaskHierarchy } from './task-workspace.js';

const now = new Date('2026-09-19T00:00:00Z');
const options = {
  version: 'test',
  strict: false,
  pathStatus: () => 'found' as const,
};

function task(id: string, status: string, title: string, extra = '', blocker = ''): string {
  return `<!-- toudocu
id: ${id}
status: ${status}
taskType: maintenance
module: MOD-CORE
${extra}-->
# ${id}: ${title}
${
  blocker
    ? `
<!-- toudocu:section blocker -->
## Blocker

${blocker}
`
    : ''
}`;
}

function project(contents: readonly [string, string][]) {
  return compileProject(
    [
      { sourcePath: 'index.md', content: '# Project', modifiedAt: now },
      {
        sourcePath: 'modules/core.md',
        content: `<!-- toudocu
id: MOD-CORE
status: active
-->
# Core
`,
        modifiedAt: now,
      },
      ...contents.map(([sourcePath, content]) => ({ sourcePath, content, modifiedAt: now })),
    ],
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => true, matches: () => [] },
    },
  );
}

test('builds parent, root-first ancestors, direct children, and descendants', () => {
  const compiled = project([
    ['work/TASK-HIER-001.md', task('TASK-HIER-001', 'done', 'Root')],
    [
      'work/TASK-HIER-002.md',
      task(
        'TASK-HIER-002',
        'blocked',
        'Middle',
        'parentTask: TASK-HIER-001\n',
        'Waiting on review.',
      ),
    ],
    [
      'work/TASK-HIER-003.md',
      task('TASK-HIER-003', 'in-progress', 'Target', 'parentTask: TASK-HIER-002\n'),
    ],
    [
      'work/TASK-HIER-004.md',
      task('TASK-HIER-004', 'done', 'Child', 'parentTask: TASK-HIER-003\n'),
    ],
  ]);
  const item = compiled.knowledge.workItems.find((candidate) => candidate.id === 'TASK-HIER-003')!;
  expect(buildTaskHierarchy(compiled, item, options)).toEqual({
    parent: {
      id: 'TASK-HIER-002',
      title: 'Middle',
      status: 'blocked',
      workState: 'blocked',
      hasBlocker: true,
    },
    ancestors: [
      { id: 'TASK-HIER-001', title: 'Root', status: 'done', workState: 'done', hasBlocker: false },
      {
        id: 'TASK-HIER-002',
        title: 'Middle',
        status: 'blocked',
        workState: 'blocked',
        hasBlocker: true,
      },
    ],
    children: [
      { id: 'TASK-HIER-004', title: 'Child', status: 'done', workState: 'done', hasBlocker: false },
    ],
    descendants: {
      total: 1,
      counts: {
        draft: 0,
        readyCandidate: 0,
        ready: 0,
        waiting: 0,
        needsAttention: 0,
        inProgress: 0,
        blocked: 0,
        done: 1,
        cancelled: 0,
      },
      started: true,
      complete: true,
    },
  });
});

test('guards cyclic ancestors and returns a null parent when absent', () => {
  const compiled = project([
    [
      'work/TASK-CYCLE-001.md',
      task('TASK-CYCLE-001', 'in-progress', 'A', 'parentTask: TASK-CYCLE-002\n'),
    ],
    [
      'work/TASK-CYCLE-002.md',
      task('TASK-CYCLE-002', 'in-progress', 'B', 'parentTask: TASK-CYCLE-001\n'),
    ],
    ['work/TASK-ROOT-001.md', task('TASK-ROOT-001', 'in-progress', 'Root')],
  ]);
  const cycle = compiled.knowledge.workItems.find((item) => item.id === 'TASK-CYCLE-001')!;
  expect(buildTaskHierarchy(compiled, cycle, options).ancestors.map((item) => item.id)).toEqual([
    'TASK-CYCLE-001',
    'TASK-CYCLE-002',
  ]);
  const root = compiled.knowledge.workItems.find((item) => item.id === 'TASK-ROOT-001')!;
  expect(buildTaskHierarchy(compiled, root, options)).toMatchObject({
    parent: null,
    ancestors: [],
  });
});

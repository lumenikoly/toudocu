import { compileProject } from '@toudocu/core';
import { ToudocuError } from '@toudocu/contracts';
import { expect, test } from 'vitest';
import { moveTask, planTaskMove } from './task-archive.js';

const now = new Date('2031-04-05T00:00:00.000Z');

function taskSource(status: string, outgoingLink = ''): string {
  const completed = status.toLowerCase() === 'done' ? 'x' : ' ';
  return `<!-- toudocu
id: TASK-AUTH-021
status: ${status.toLowerCase()}
taskType: feature
module: MOD-AUTH
useCase: UC-AUTH-01
-->

# TASK-AUTH-021: Add verification workflow

<!-- toudocu:section result -->
## Result

The requested behavior is implemented.

${outgoingLink}

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The workflow is unavailable.

<!-- toudocu:section after -->
### After

The workflow is available and verified.

<!-- toudocu:section scope -->
## Scope

- \`new.go\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Unrelated commands.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [${completed}] \`AC-01\` The workflow succeeds.

<!-- toudocu:section plan -->
## Plan

1. Implement the workflow.
2. Verify the result.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`go version\`
- \`ALL\` -> \`go version\`
- \`DOCS\` -> \`go version\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/index.md\`.
`;
}

function project(status = 'Done', indexContent = '# Docs\n', outgoingLink = '') {
  const sources = [
    {
      sourcePath: 'index.md',
      content: indexContent,
      modifiedAt: now,
    },
    {
      sourcePath: 'modules/MOD-AUTH.md',
      content: '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth\n',
      modifiedAt: now,
    },
    {
      sourcePath: 'use-cases/UC-AUTH-01.md',
      content: '<!-- toudocu\nid: UC-AUTH-01\nstatus: done\n-->\n# Auth workflow\n',
      modifiedAt: now,
    },
    {
      sourcePath: 'work/TASK-AUTH-021.md',
      content: taskSource(status, outgoingLink),
      modifiedAt: now,
    },
  ];
  return compileProject(sources, {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: {
      exists: () => true,
      matches: () => [],
    },
  });
}

const links = { repositoryRoot: '/repo', documentRoot: '/repo/docs' };

test('plans and executes a terminal archive with the exact destination', async () => {
  const compiled = project();
  const plan = planTaskMove(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
  });

  expect(plan.report.status).toBe('blocked');
  expect(plan.report.destinationPath).toBe('work/archive/2031/TASK-AUTH-021.md');
  expect(plan.report.issues).toEqual([]);

  const moved: string[] = [];
  const report = await moveTask(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
    validateMove: async () => {},
    moveFile: async (source, destination) => {
      moved.push(`${source} -> ${destination}`);
    },
  });

  expect(report.status).toBe('archived');
  expect(moved).toEqual(['work/TASK-AUTH-021.md -> work/archive/2031/TASK-AUTH-021.md']);
});

test('blocks an active task before filesystem mutation', async () => {
  const compiled = project('Ready');
  let moved = false;
  const report = await moveTask(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
    validateMove: async () => {
      throw new Error('preflight must not run');
    },
    moveFile: async () => {
      moved = true;
    },
  });

  expect(report.status).toBe('blocked');
  expect(report.issues.map((item) => item.code)).toContain('task-not-terminal');
  expect(moved).toBe(false);
});

test('blocks an incoming link before moving the task', async () => {
  const compiled = project('Done', '[Task](work/TASK-AUTH-021.md)\n');
  const report = await moveTask(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
    validateMove: async () => {},
    moveFile: async () => {
      throw new Error('move must be blocked');
    },
  });

  expect(report.status).toBe('blocked');
  expect(report.issues.map((item) => item.code)).toContain('task-move-incoming-link');
});

test('blocks an outgoing link whose relative target changes', async () => {
  const compiled = project('Done', '# Docs\n', '[Module](../modules/MOD-AUTH.md)');
  const report = await moveTask(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
    validateMove: async () => {},
    moveFile: async () => {
      throw new Error('move must be blocked');
    },
  });

  expect(report.status).toBe('blocked');
  expect(report.issues.map((item) => item.code)).toContain('task-move-outgoing-link');
});

test('runs destination preflight before link gates', async () => {
  const compiled = project('Done', '[Task](work/TASK-AUTH-021.md)\n');
  const report = await moveTask(compiled, 'TASK-AUTH-021', 'archive', {
    version: 'test',
    now,
    links,
    validateMove: async () => {
      throw new ToudocuError('unsafe-task-move', 'destination file already exists');
    },
    moveFile: async () => {
      throw new Error('move must be blocked');
    },
  });

  expect(report.issues.map((item) => item.code)).toEqual(['unsafe-task-move']);
});

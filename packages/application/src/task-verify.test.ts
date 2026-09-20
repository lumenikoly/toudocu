import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { executeTaskVerification, planTaskCommands } from './task-verify.js';

const now = new Date('2026-09-19T00:00:00Z');

function taskDocument(checks: string): string {
  return `<!-- toudocu
id: TASK-VERIFY-001
status: ready
taskType: maintenance
module: MOD-CORE
updated: 2026-09-01
-->
# TASK-VERIFY-001: Verify commands

<!-- toudocu:section result -->
## Result

The result exists.

<!-- toudocu:section use-case-omission-reason -->
## Use case omission reason

This maintenance task has no user-facing behavior.

<!-- toudocu:section scope -->
## Scope

- \`src/app.ts\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Unrelated changes.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] \`AC-01\` The command is planned.

<!-- toudocu:section plan -->
## Plan

Run the checks.

<!-- toudocu:section verification -->
## Verification

${checks}

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/guide.md\`.
`;
}

function project(
  checks: string,
  status = 'ready',
  sourceIssues: readonly {
    severity: 'warning' | 'error' | 'info';
    code: string;
    message: string;
    documentPath?: string;
  }[] = [],
) {
  const content = taskDocument(checks).replace('status: ready', `status: ${status}`);
  return compileProject(
    [
      { sourcePath: 'index.md', content: '# Project', modifiedAt: now },
      {
        sourcePath: 'modules/core.md',
        content: '<!-- toudocu\nid: MOD-CORE\nstatus: active\n-->\n# Core',
        modifiedAt: now,
      },
      { sourcePath: 'docs/guide.md', content: '# Guide', modifiedAt: now },
      { sourcePath: 'work/TASK-VERIFY-001.md', content, modifiedAt: now },
    ],
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: {
        exists: (path: string) => path === '.' || path === 'src/app.ts' || path === 'docs/guide.md',
        matches: () => [],
      },
      sourceIssues,
    },
  );
}

const options = {
  version: 'test',
  strict: true,
  pathStatus: () => 'found' as const,
  repositoryRoot: '/repo',
};

test('deduplicates trimmed commands and preserves target order', () => {
  const item = project(
    '- `AC-01` -> ` echo first `\n- `ALL` -> `echo first`\n- `DOCS` -> `echo second`',
  ).knowledge.workItems[0]!;
  expect(planTaskCommands(item)).toEqual([
    { command: 'echo first', targets: ['AC-01', 'ALL'] },
    { command: 'echo second', targets: ['DOCS'] },
  ]);
});

test('dry-run never invokes the runner and uses zero command times', async () => {
  let invoked = false;
  const report = await executeTaskVerification(
    project('- `AC-01` -> `echo first`\n- `ALL` -> `echo first`\n- `DOCS` -> `echo first`'),
    'TASK-VERIFY-001',
    { ...options, mode: 'dry-run' },
    async () => {
      invoked = true;
      throw new Error('must not execute');
    },
  );
  expect(invoked).toBe(false);
  expect(report.validationIssues).toEqual([]);
  expect(report.status).toBe('planned');
  expect(report.commands[0]?.startedAt).toBe('0001-01-01T00:00:00Z');
  expect(report.commands[0]?.targets).toEqual(['AC-01', 'ALL', 'DOCS']);
});

test('run continues after failures and aggregates command and target status', async () => {
  const commands: string[] = [];
  const report = await executeTaskVerification(
    project('- `AC-01` -> `first`\n- `ALL` -> `first`\n- `DOCS` -> `second`'),
    'TASK-VERIFY-001',
    { ...options, mode: 'run' },
    async (command) => {
      commands.push(command);
      return {
        status: command === 'first' ? 'failed' : 'passed',
        exitCode: command === 'first' ? 2 : 0,
        startedAt: '2026-09-19T00:00:00Z',
        finishedAt: '2026-09-19T00:00:00Z',
        durationMillis: 0,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    },
  );
  expect(commands).toEqual(['first', 'second']);
  expect(report.status).toBe('failed');
  expect(report.summary.failedCommands).toBe(1);
  expect(report.targets).toEqual([
    { target: 'AC-01', status: 'failed' },
    { target: 'ALL', status: 'failed' },
    { target: 'DOCS', status: 'passed' },
  ]);
});

test('warnings from readiness do not block verification', async () => {
  const report = await executeTaskVerification(
    project(
      '- `AC-01` -> `echo first`\n- `ALL` -> `echo first`\n- `DOCS` -> `echo first`',
      'ready',
      [
        {
          severity: 'warning',
          code: 'stale-task-warning',
          message: 'warning only',
          documentPath: 'work/TASK-VERIFY-001.md',
        },
      ],
    ),
    'TASK-VERIFY-001',
    { ...options, mode: 'dry-run' },
  );
  expect(report.validationIssues).toEqual([]);
  expect(report.issues.some((issue) => issue.code === 'stale-task-warning')).toBe(true);
});

test('run rejects task states outside the legacy allow-list', async () => {
  const report = await executeTaskVerification(
    project(
      '- `AC-01` -> `echo first`\n- `ALL` -> `echo first`\n- `DOCS` -> `echo first`',
      'draft',
    ),
    'TASK-VERIFY-001',
    { ...options, mode: 'run' },
    async () => {
      throw new Error('must not execute');
    },
  );
  expect(report.status).toBe('blocked');
  expect(report.validationIssues.map((issue) => issue.code)).toContain('invalid-task-verify-state');
});

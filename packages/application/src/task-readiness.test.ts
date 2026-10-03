import { expect, test } from 'vitest';
import { compileProject, type DocumentationPathStatus } from '@toudocu/core';
import { buildTaskReady } from './task-ready.js';
import { buildTaskCandidates, buildTaskTree } from './task-workspace.js';

const now = new Date('2026-09-19T00:00:00Z');

type TaskOptions = {
  status?: string;
  type?: string;
  module?: string;
  useCase?: string;
  extra?: string;
  sections?: string;
};

function task(id: string, title: string, options: TaskOptions = {}): string {
  const status = options.status ?? 'ready';
  const type = options.type ?? 'feature';
  const module = options.module === undefined ? 'MOD-CORE' : options.module;
  const useCase = options.useCase === undefined ? 'UC-CORE' : options.useCase;
  const feature =
    type === 'feature'
      ? `
<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The old behavior.

<!-- toudocu:section after -->
### After

The new behavior.
`
      : '';
  const sections =
    options.sections ??
    `
<!-- toudocu:section result -->
## Result

The result exists.
${feature}
<!-- toudocu:section scope -->
## Scope

- \`src/app.ts\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Unrelated changes.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] \`AC-01\` The result is observable.

<!-- toudocu:section plan -->
## Plan

1. Implement the change.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`go test ./...\`
- \`ALL\` -> \`go test ./...\`
- \`DOCS\` -> \`go test ./...\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/guide.md\`.
`;
  const useCaseLine = useCase ? `useCase: ${useCase}\n` : '';
  return `<!-- toudocu
id: ${id}
status: ${status}
taskType: ${type}
module: ${module}
${useCaseLine}updated: 2026-09-01
${options.extra ?? ''}-->
# ${id}: ${title}
${sections}`;
}

function repository(paths: readonly string[] = ['src/app.ts', 'docs/guide.md']) {
  const available = new Set(paths);
  return {
    exists: (path: string) => path === '.' || available.has(path),
    matches: (pattern: string) => (available.has(pattern) ? [pattern] : []),
  };
}

function project(
  tasks: readonly [string, string][],
  options: {
    sourceIssues?: readonly {
      severity: 'warning' | 'error' | 'info';
      code: string;
      message: string;
      documentPath?: string;
    }[];
    paths?: string[];
  } = {},
) {
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

The core module.

<!-- toudocu:section code-location -->
## Code location

The source is under src.

<!-- toudocu:section boundaries -->
## Boundaries

The module owns task readiness.

<!-- toudocu:section business-rules -->
## Business rules

Readiness follows the task contract.

<!-- toudocu:section invariants -->
## Invariants

Reports are schema-valid.

<!-- toudocu:section stable-interfaces -->
## Stable interfaces

The application functions are pure.

<!-- toudocu:section related-use-cases -->
## Related use cases

UC-CORE.
`,
        modifiedAt: now,
      },
      {
        sourcePath: 'use-cases/core.md',
        content: `<!-- toudocu
id: UC-CORE
module: MOD-CORE
status: active
-->
# Core use case

The core readiness use case.

<!-- toudocu:section main-scenario -->
## Main scenario

Evaluate a task.

<!-- toudocu:section postconditions -->
## Postconditions

The report explains readiness.

<!-- toudocu:section business-rules -->
## Business rules

The contract is complete.

<!-- toudocu:section implementation -->
## Implementation

The application projects the core result.
`,
        modifiedAt: now,
      },
      ...tasks.map(([sourcePath, content]) => ({ sourcePath, content, modifiedAt: now })),
    ],
    {
      now,
      staleDays: 0,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: repository(options.paths),
      ...(options.sourceIssues ? { sourceIssues: options.sourceIssues } : {}),
    },
  );
}

const readyOptions = (strict = false, pathStatus: DocumentationPathStatus = () => 'found') => ({
  version: 'test',
  strict,
  pathStatus,
});

test('a Draft is contract-ready only when the full Ready contract is present', () => {
  const draft = task('TASK-DRAFT-001', 'Draft contract', {
    status: 'draft',
    type: 'maintenance',
    useCase: '',
    sections: `
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

- [ ] \`AC-01\` The result is observable.

<!-- toudocu:section plan -->
## Plan

1. Implement the change.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`go test ./...\`
- \`ALL\` -> \`go test ./...\`
- \`DOCS\` -> \`go test ./...\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/guide.md\`.
`,
  });
  const report = buildTaskReady(
    project([['work/TASK-DRAFT-001.md', draft]]),
    'TASK-DRAFT-001',
    readyOptions(),
  );
  expect(report.status).toBe('contract_ready');
  expect(report.contractComplete).toBe(true);
  expect(report.readyForWork).toBe(false);
  expect(report.issues).toEqual([]);
});

test('a valid Ready task is executable, while an incomplete Ready task is not', () => {
  const validProject = project([['work/TASK-READY-001.md', task('TASK-READY-001', 'Ready')]]);
  const valid = buildTaskReady(validProject, 'TASK-READY-001', readyOptions());
  expect(valid.status).toBe('ready');
  expect(valid.contractComplete).toBe(true);
  expect(valid.readyForWork).toBe(true);

  const incompleteProject = project([
    [
      'work/TASK-READY-002.md',
      task('TASK-READY-002', 'Incomplete', {
        sections: task('TASK-READY-002', 'Incomplete').slice(
          task('TASK-READY-002', 'Incomplete').indexOf('<!-- toudocu:section behavior-change -->'),
        ),
      }),
    ],
  ]);
  const incomplete = buildTaskReady(incompleteProject, 'TASK-READY-002', readyOptions());
  expect(incomplete.status).toBe('contract_incomplete');
  expect(incomplete.contractComplete).toBe(false);
  expect(incomplete.readyForWork).toBe(false);
  expect(incomplete.issues.map((issue) => issue.code)).toContain('missing-task-result');
});

test('task ready ignores dependency completion, but candidates expose pending dependencies', () => {
  const child = task('TASK-DEP-002', 'Child', {
    extra: 'dependsOn: TASK-DEP-001\n',
  });
  const pendingProject = project([
    ['work/TASK-DEP-001.md', task('TASK-DEP-001', 'Dependency')],
    ['work/TASK-DEP-002.md', child],
  ]);
  const ready = buildTaskReady(pendingProject, 'TASK-DEP-002', readyOptions());
  expect(ready.readyForWork).toBe(true);
  const pending = buildTaskCandidates(pendingProject, '', readyOptions()).candidates.find(
    (candidate) => candidate.id === 'TASK-DEP-002',
  );
  expect(pending).toMatchObject({ dependenciesSatisfied: false, readyForWork: false });
  expect(pending?.blockedBy).toEqual([{ id: 'TASK-DEP-001', status: 'ready' }]);

  const doneProject = project([
    ['work/TASK-DEP-001.md', task('TASK-DEP-001', 'Dependency', { status: 'done' })],
    ['work/TASK-DEP-002.md', child],
  ]);
  const done = buildTaskCandidates(doneProject, '', readyOptions()).candidates.find(
    (candidate) => candidate.id === 'TASK-DEP-002',
  );
  expect(done).toMatchObject({ dependenciesSatisfied: true, readyForWork: true, blockedBy: null });
});

test('strict mode makes task-scoped warnings blocking', () => {
  const sourceIssues = [
    {
      severity: 'warning' as const,
      code: 'task-warning',
      message: 'A warning attached to this task.',
      documentPath: 'work/TASK-WARN-001.md',
    },
  ];
  const compiled = project([['work/TASK-WARN-001.md', task('TASK-WARN-001', 'Warning')]], {
    sourceIssues,
  });
  const relaxed = buildTaskReady(compiled, 'TASK-WARN-001', readyOptions(false));
  expect(relaxed.status).toBe('ready');
  expect(relaxed.contractComplete).toBe(true);
  const strict = buildTaskReady(compiled, 'TASK-WARN-001', readyOptions(true));
  expect(strict.status).toBe('contract_incomplete');
  expect(strict.contractComplete).toBe(false);
  expect(strict.issues.map((issue) => issue.code)).toContain('task-warning');
});

test('task readiness excludes task-scoped informational issues', () => {
  const compiled = project(
    [['work/TASK-READY-003.md', task('TASK-READY-003', 'Informational issue')]],
    {
      sourceIssues: [
        {
          severity: 'info',
          code: 'task-info',
          message: 'An informational note attached to this task.',
          documentPath: 'work/TASK-READY-003.md',
        },
      ],
    },
  );
  const report = buildTaskReady(compiled, 'TASK-READY-003', readyOptions(true));

  expect(report.status).toBe('ready');
  expect(report.issues.map((issue) => issue.code)).not.toContain('task-info');
});

test('reports missing and ambiguous task selection', () => {
  const missing = buildTaskReady(project([]), 'TASK-MISSING-001', readyOptions());
  expect(missing.status).toBe('contract_incomplete');
  expect(missing.issues[0]).toMatchObject({ code: 'task-selection-failed' });

  const duplicate = project([
    ['work/TASK-DUP-001-a.md', task('TASK-DUP-001', 'One')],
    ['work/TASK-DUP-001-b.md', task('TASK-DUP-001', 'Two')],
  ]);
  const ambiguous = buildTaskReady(duplicate, 'TASK-DUP-001', readyOptions());
  expect(ambiguous.issues[0]).toMatchObject({ code: 'task-selection-failed' });
  expect(ambiguous.issues[0]?.message).toContain('ambiguous');
});

test('preserves unknown task types and their missing omission-reason diagnostic', () => {
  const compiled = project([
    [
      'work/TASK-TYPE-001.md',
      task('TASK-TYPE-001', 'Unknown type', { type: 'unknown', useCase: '' }),
    ],
  ]);
  const report = buildTaskReady(compiled, 'TASK-TYPE-001', readyOptions());
  expect(report.task.type).toBe('unknown');
  expect(report.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['invalid-task-type', 'missing-use-case-omission-reason']),
  );
});

test('limits parent candidates to descendants and terminates cyclic task trees', () => {
  const compiled = project([
    ['work/TASK-TREE-001.md', task('TASK-TREE-001', 'Root')],
    [
      'work/TASK-TREE-002.md',
      task('TASK-TREE-002', 'Child', { extra: 'parentTask: TASK-TREE-001\n' }),
    ],
    ['work/TASK-TREE-003.md', task('TASK-TREE-003', 'Unrelated')],
  ]);
  const candidates = buildTaskCandidates(compiled, 'TASK-TREE-001', readyOptions());
  expect(candidates.candidates.map((candidate) => candidate.id)).toEqual(['TASK-TREE-002']);
  const cyclic = project([
    [
      'work/TASK-CYCLE-001.md',
      task('TASK-CYCLE-001', 'A', { extra: 'parentTask: TASK-CYCLE-002\n' }),
    ],
    [
      'work/TASK-CYCLE-002.md',
      task('TASK-CYCLE-002', 'B', { extra: 'parentTask: TASK-CYCLE-001\n' }),
    ],
  ]);
  const tree = buildTaskTree(cyclic, 'TASK-CYCLE-001', readyOptions());
  expect(tree.tree.id).toBe('TASK-CYCLE-001');
  expect(tree.tree.children[0]?.id).toBe('TASK-CYCLE-002');
  expect(tree.tree.children[0]?.children[0]?.id).toBe('TASK-CYCLE-001');
  expect(tree.tree.children[0]?.children[0]?.children).toEqual([]);
});

test('validates every declared documentation-impact path through pathStatus', () => {
  const calls: [string, string][] = [];
  const report = buildTaskReady(
    project([['work/TASK-PATH-001.md', task('TASK-PATH-001', 'Path')]]),
    'TASK-PATH-001',
    readyOptions(false, (value, document) => {
      calls.push([value, document]);
      return value === 'docs/guide.md' ? 'missing' : 'found';
    }),
  );
  expect(calls).toContainEqual(['docs/guide.md', 'work/TASK-PATH-001.md']);
  expect(report.issues.map((issue) => issue.code)).toContain('missing-documentation-impact-path');
});

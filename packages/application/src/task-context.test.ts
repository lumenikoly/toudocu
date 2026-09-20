import { expect, test } from 'vitest';
import {
  compileProject,
  createDocument,
  type Document,
  type DocumentationPathStatus,
} from '@toudocu/core';
import { buildTaskContext } from './task-context.js';

const now = new Date('2026-09-19T00:00:00Z');

function task(
  id: string,
  title: string,
  options: { status?: string; parent?: string; dependsOn?: string } = {},
): string {
  return `<!-- toudocu
id: ${id}
status: ${options.status ?? 'ready'}
taskType: feature
module: MOD-CORE
useCase: UC-CORE
flow: FLOW-CORE
standards: STD-CORE
runbooks: RB-CORE
screens: SC-CORE-HOME
transitions: TR-CORE-001
${options.parent ? `parentTask: ${options.parent}\n` : ''}${options.dependsOn ? `dependsOn: ${options.dependsOn}\n` : ''}updated: 2026-09-01
-->
# ${id}: ${title}

Task description.

<!-- toudocu:section result -->
## Result

The result exists.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The old behavior.

<!-- toudocu:section after -->
### After

The new behavior.

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
- \`QUALITY\` -> \`go test ./...\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`external.md\`.
`;
}

function draftTask(): string {
  return `<!-- toudocu
id: TASK-DRAFT-001
status: draft
taskType: maintenance
-->
# TASK-DRAFT-001: Draft

<!-- toudocu:section result -->
## Result

The draft exists.
`;
}

function screen(id: string, route: string, transitions = ''): string {
  return `<!-- toudocu
id: ${id}
screenKind: page
module: MOD-CORE
status: planned
route: ${route}
-->
# ${id}

${transitions}`;
}

function transitionTable(): string {
  return `<!-- toudocu:table transitions columns=id,useCase,action,condition,target,state,error,message,contract,kind -->
| ID | Use case | Action | Condition | Target | State | Error | Message | Contract | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TR-CORE-001 | UC-CORE | Continue | Always | SC-CORE-DETAIL | | | | | navigation |`;
}

function sources(
  tasks: readonly string[],
): { sourcePath: string; content: string; modifiedAt: Date }[] {
  return [
    { sourcePath: 'index.md', content: '# Project\n', modifiedAt: now },
    {
      sourcePath: 'modules/core.md',
      content: `<!-- toudocu
id: MOD-CORE
status: active
-->
# Core

Core module.

## BR-CORE-001: Preserve context bounds

The selected context stays bounded.
`,
      modifiedAt: now,
    },
    {
      sourcePath: 'use-cases/core.md',
      content: `<!-- toudocu
id: UC-CORE
module: MOD-CORE
status: active
screens: SC-CORE-HOME, SC-CORE-DETAIL
startScreen: SC-CORE-HOME
terminalScreens: SC-CORE-DETAIL
allowCycle: false
-->
# Core use case

Core use case.

<!-- toudocu:section main-scenario -->
## Main scenario

Evaluate context.

<!-- toudocu:section postconditions -->
## Postconditions

The context is bounded.

<!-- toudocu:section business-rules -->
## Business rules

The selected entities are included.

<!-- toudocu:section implementation -->
## Implementation

The application builds the report.
`,
      modifiedAt: now,
    },
    {
      sourcePath: 'flows/core.md',
      content:
        '<!-- toudocu\nid: FLOW-CORE\nmodule: MOD-CORE\nuseCase: UC-CORE\n-->\n# Core flow\n\nThe flow is selected.\n',
      modifiedAt: now,
    },
    {
      sourcePath: 'quality/STD-CORE.md',
      content: `<!-- toudocu
id: STD-CORE
status: active
scope: Application
updated: 2026-09-01
-->
# Core standard

<!-- toudocu:section rules -->
## Rules

Keep context bounded.

<!-- toudocu:section automated-checks -->
## Automated checks

Run application tests.
`,
      modifiedAt: now,
    },
    {
      sourcePath: 'runbooks/RB-CORE.md',
      content: `<!-- toudocu
id: RB-CORE
status: active
risk: low
environment: test
lastVerified: 2026-09-18
-->
# Core runbook

<!-- toudocu:section prerequisites -->
## Prerequisites

The project is available.

<!-- toudocu:section procedure -->
## Procedure

1. Run the context command.

<!-- toudocu:section verification -->
## Verification

Check the output.

<!-- toudocu:section rollback -->
## Rollback

Restore the previous output.
`,
      modifiedAt: now,
    },
    {
      sourcePath: 'screens/SC-CORE-HOME.md',
      content: screen('SC-CORE-HOME', '/', transitionTable()),
      modifiedAt: now,
    },
    {
      sourcePath: 'screens/SC-CORE-DETAIL.md',
      content: screen('SC-CORE-DETAIL', '/detail'),
      modifiedAt: now,
    },
    ...tasks.map((content, index) => ({
      sourcePath: `work/TASK-CTX-${String(index + 1).padStart(3, '0')}.md`,
      content,
      modifiedAt: now,
    })),
  ];
}

function project(tasks: readonly string[]) {
  return compileProject(sources(tasks), {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: {
      exists: (path) => path === '.' || ['src/app.ts', 'external.md'].includes(path),
      matches: () => [],
    },
  });
}

const options = (pathStatus: DocumentationPathStatus = () => 'found' as const) => ({
  version: 'test',
  strict: false,
  pathStatus,
  externalDocuments: new Map<string, Document>([
    [
      'external.md',
      createDocument(
        {
          sourcePath: 'external.md',
          content: '# External\n\nDeclared external context.\n',
          modifiedAt: now,
        },
        { now, staleDays: 0 },
      ),
    ],
  ]),
});

test('projects selected entities, screen transitions, dependency records, and declared external docs', () => {
  const compiled = project([
    task('TASK-CTX-001', 'Context task', { dependsOn: 'TASK-CTX-002' }),
    task('TASK-CTX-002', 'Dependency', { status: 'done' }),
  ]);
  const report = buildTaskContext(compiled, 'TASK-CTX-001', options());

  expect(report.module?.id).toBe('MOD-CORE');
  expect(report.useCase?.id).toBe('UC-CORE');
  expect(report.flow?.id).toBe('FLOW-CORE');
  expect(report.standards.map((item) => item.id)).toEqual(['STD-CORE']);
  expect(report.runbooks.map((item) => item.id)).toEqual(['RB-CORE']);
  expect(report.screens.map((item) => item.id)).toEqual(['SC-CORE-HOME']);
  expect(report.screenTransitions.map((item) => item.id)).toEqual(['TR-CORE-001']);
  expect(report.dependencies.map((item) => item.id)).toEqual(['TASK-CTX-002']);
  expect(report.businessRules.map((item) => item.id)).toEqual(['BR-CORE-001']);
  expect(report.fullVerification).toBe(true);
  expect(report.documents.map((document) => document.path)).toContain('external.md');
  expect(report.requiredReads).toContain('external.md');
  expect(report.requiredReads).not.toContain('work/TASK-CTX-002.md');
});

test('allows Ready context and rejects Draft context', () => {
  const ready = buildTaskContext(
    project([task('TASK-CTX-001', 'Ready')]),
    'TASK-CTX-001',
    options(),
  );
  expect(ready.task.id).toBe('TASK-CTX-001');

  expect(() => buildTaskContext(project([draftTask()]), 'TASK-DRAFT-001', options())).toThrow(
    expect.objectContaining({ code: 'invalid-task-context-state' }),
  );
});

test('keeps hierarchy references compact and excludes parent/subtree documents', () => {
  const compiled = project([
    task('TASK-CTX-001', 'Parent'),
    task('TASK-CTX-002', 'Selected child', { parent: 'TASK-CTX-001' }),
    task('TASK-CTX-003', 'Grandchild', { parent: 'TASK-CTX-002' }),
  ]);
  const report = buildTaskContext(compiled, 'TASK-CTX-002', options());

  expect(report.hierarchy.parent).toMatchObject({ id: 'TASK-CTX-001', title: 'Parent' });
  expect(report.hierarchy.children).toHaveLength(1);
  expect(report.hierarchy.children[0]).toMatchObject({ id: 'TASK-CTX-003' });
  expect(report.hierarchy.descendants).toMatchObject({ total: 1 });
  expect(report.documents.map((document) => document.path)).not.toContain('work/TASK-CTX-001.md');
  expect(report.documents.map((document) => document.path)).not.toContain('work/TASK-CTX-003.md');
});

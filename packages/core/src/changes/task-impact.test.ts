import renameCapture from '../../../../fixtures/expected/compatibility/changes-rename.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { ChangeSetReportV1Schema, type ChangeSetReportV1 } from '@toudocu/contracts';
import { parseMarkdown } from '../markdown/parse.js';
import {
  buildTaskImpact,
  declaredTaskDocumentation,
  normalizeTaskDocumentationPath,
  pathMatchesTaskScope,
  taskScopePaths,
  type TaskImpactTask,
} from './task-impact.js';

function report(): ChangeSetReportV1 {
  return ChangeSetReportV1Schema.parse(JSON.parse(renameCapture.stdout));
}

function task(id: string, path: string, source: string): TaskImpactTask {
  return {
    id,
    path,
    side: {
      analysis: parseMarkdown(source, path).analysis,
      source,
      path,
    },
  };
}

const rootSource = `<!-- toudocu
id: TASK-ROOT-001
status: ready
-->
# Root task

<!-- toudocu:section documentation-impact -->
## Documentation impact

\`guide.md\`
\`existing.md\`
\`missing.md\`
\`inline.json\`
[Other](../other.md)

<!-- toudocu:section scope -->
## Scope

- \`src/**\`
`;

test('normalizes declared documentation paths and extracts H2 task sections', () => {
  const root = task('TASK-ROOT-001', 'docs/work/TASK-ROOT-001.md', rootSource);

  expect(declaredTaskDocumentation(root.side.analysis, root.path, 'docs')).toEqual([
    'docs/existing.md',
    'docs/guide.md',
    'docs/inline.json',
    'docs/missing.md',
    'docs/other.md',
  ]);
  expect(taskScopePaths(root.side.analysis)).toEqual(['src/**']);
  expect(normalizeTaskDocumentationPath('../other.md#part', root.path, 'docs', true)).toBe(
    'docs/other.md',
  );
  expect(normalizeTaskDocumentationPath('guide.md?view=full#part', root.path, 'docs', false)).toBe(
    'docs/guide.md',
  );
  expect(normalizeTaskDocumentationPath('\u0085guide.md\u00a0', root.path, 'docs', false)).toBe(
    'docs/guide.md',
  );
  expect(normalizeTaskDocumentationPath('/tmp/other.md', root.path, 'docs', true)).toBe('');
  expect(normalizeTaskDocumentationPath('../../outside.md', root.path, 'docs', true)).toBe('');
  expect(declaredTaskDocumentation(root.side.analysis, root.path, '.')).toEqual([
    'docs/other.md',
    'existing.md',
    'guide.md',
    'inline.json',
    'missing.md',
  ]);
  expect(normalizeTaskDocumentationPath('guide.md', root.path, '.', false)).toBe('guide.md');
  expect(normalizeTaskDocumentationPath('../other.md', root.path, '.', true)).toBe('docs/other.md');
  expect(
    pathMatchesTaskScope('src/main.ts', ['src/**'], (pattern, path) => {
      return pattern === 'src/**' && path.startsWith('src/');
    }),
  ).toBe(true);
});

test('builds declared, actual, task changes, and ordered diagnostics', () => {
  const value = report();
  const root = task('TASK-ROOT-001', 'docs/work/TASK-ROOT-001.md', rootSource);
  value.changes = [
    { ...value.changes[0]!, status: 'modified', path: root.path },
    { ...value.changes[0]!, status: 'modified', path: 'docs/guide.md' },
    { ...value.changes[0]!, status: 'added', path: 'docs/other.md' },
    { ...value.changes[0]!, status: 'modified', path: 'docs/extra.md' },
    { ...value.changes[0]!, status: 'untracked', path: 'docs/new.png' },
  ];

  const impact = buildTaskImpact(value, root.id, {
    task: root,
    docsRel: 'docs',
    pathExists: new Set(['docs/existing.md']),
    scopeMatch: (pattern, path) => pattern === 'src/**' && path.startsWith('src/'),
  });

  expect(impact.taskChanges.map((change) => change.path)).toEqual([root.path]);
  expect(impact.declared).toEqual([
    { path: 'docs/existing.md', declared: true, changed: false, declaredBy: [root.id] },
    { path: 'docs/guide.md', declared: true, changed: true, declaredBy: [root.id] },
    { path: 'docs/inline.json', declared: true, changed: false, declaredBy: [root.id] },
    { path: 'docs/missing.md', declared: true, changed: false, declaredBy: [root.id] },
    {
      path: 'docs/other.md',
      declared: true,
      changed: true,
      created: true,
      declaredBy: [root.id],
    },
  ]);
  expect(impact.actual).toEqual([
    { path: 'docs/guide.md', declared: false, changed: true },
    { path: 'docs/other.md', declared: false, changed: true, created: true },
    { path: 'docs/extra.md', declared: false, changed: true },
    { path: 'docs/new.png', declared: false, changed: true, created: true },
  ]);
  expect(impact.diagnostics.map((issue) => issue.code)).toEqual([
    'declared-document-not-changed',
    'declared-document-not-created',
    'declared-document-not-created',
    'documentation-change-outside-task-scope',
    'documentation-change-outside-task-scope',
    'undeclared-document-change',
    'documentation-change-outside-task-scope',
    'undeclared-document-created',
    'documentation-change-outside-task-scope',
  ]);
});

test('uses selected task tree documents and records declaredBy', () => {
  const value = report();
  const root = task('TASK-ROOT-001', 'docs/work/TASK-ROOT-001.md', rootSource);
  const child = task(
    'TASK-CHILD-001',
    'docs/work/TASK-CHILD-001.md',
    rootSource.replaceAll('TASK-ROOT-001', 'TASK-CHILD-001').replace('guide.md', 'child.md'),
  );
  value.changes = [
    { ...value.changes[0]!, status: 'modified', path: root.path },
    { ...value.changes[0]!, status: 'modified', path: child.path },
    { ...value.changes[0]!, status: 'modified', path: 'docs/child.md' },
  ];

  const impact = buildTaskImpact(value, root.id, {
    task: root,
    selectedTasks: [child],
    docsRel: 'docs',
    pathExists: () => true,
    scopeMatch: () => true,
  });

  expect(impact.taskChanges.map((change) => change.path)).toEqual([root.path, child.path]);
  expect(impact.declared.find((entry) => entry.path === 'docs/guide.md')?.declaredBy).toEqual([
    root.id,
  ]);
  expect(impact.declared.find((entry) => entry.path === 'docs/child.md')?.declaredBy).toEqual([
    child.id,
  ]);
});

test('reports missing documentation impact for durable changes', () => {
  const value = report();
  const root = task(
    'TASK-ROOT-001',
    'docs/work/TASK-ROOT-001.md',
    '<!-- toudocu\nid: TASK-ROOT-001\n-->\n# Root task\n',
  );
  value.changes = [
    { ...value.changes[0]!, path: 'docs/guide.md', classification: 'permanent-documentation' },
  ];

  const impact = buildTaskImpact(value, root.id, {
    task: root,
    docsRel: 'docs',
    pathExists: () => true,
    scopeMatch: () => true,
  });

  expect(impact.diagnostics.map((issue) => issue.code)).toEqual([
    'undeclared-document-change',
    'missing-documentation-impact-entry',
  ]);
});

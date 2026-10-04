import renameCapture from '../../../../fixtures/expected/compatibility/changes-rename.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { ChangeSetReportV1Schema, type ChangeSetReportV1 } from '@toudocu/contracts';
import { parseMarkdown } from '../markdown/parse.js';
import { addChangeSummary, coalesceEntityRenames } from './aggregate.js';

function report(): ChangeSetReportV1 {
  return ChangeSetReportV1Schema.parse(JSON.parse(renameCapture.stdout));
}

function change(
  base: ChangeSetReportV1['changes'][number],
  status: string,
  path: string,
  id: string,
): ChangeSetReportV1['changes'][number] {
  const { oldPath: _oldPath, asset: _asset, screen: _screen, ...withoutOptionalFields } = base;
  return {
    ...withoutOptionalFields,
    status,
    path,
    oldPath: undefined,
    lines: { added: 1, deleted: 2 },
    entitiesBefore: status === 'deleted' ? [{ id, type: 'module' }] : [],
    entitiesAfter: status === 'deleted' ? [] : [{ id, type: 'module' }],
    sourceDiff: status === 'deleted' ? '@@ -1,1 +0,0 @@\n-old\n' : '@@ -0,0 +1,1 @@\n+new\n',
    sourceDiffHunks: [],
    renderedSections: [],
    semanticDiffAvailable: false,
    semanticChanges: [],
    relationChanges: [],
  };
}

test('coalesces a stable-ID delete and add into a rename', () => {
  const value = report();
  const base = value.changes[0]!;
  value.changes = [
    change(base, 'deleted', 'old.md', 'MOD-1'),
    change(base, 'untracked', 'new.md', 'MOD-1'),
  ];
  value.summary = {
    files: {
      added: 0,
      modified: 0,
      deleted: 1,
      renamed: 0,
      copied: 0,
      typeChanged: 0,
      untracked: 1,
    },
    lines: { added: 2, deleted: 2 },
    entities: { module: 1 },
    classifications: { documentation: 2 },
  };

  coalesceEntityRenames(value, new Map());

  expect(value.changes).toHaveLength(1);
  expect(value.changes[0]).toMatchObject({
    status: 'renamed',
    path: 'new.md',
    oldPath: 'old.md',
    sourceDiff: '@@ -1,1 +0,0 @@\n-old\n@@ -0,0 +1,1 @@\n+new\n',
    lines: { added: 2, deleted: 4 },
    semanticChanges: [
      {
        kind: 'entity-moved',
        entity: { id: 'MOD-1', type: 'module' },
        before: 'old.md',
        after: 'new.md',
        summary: 'Entity MOD-1 moved.',
      },
    ],
  });
  expect(value.changes[0]?.sourceDiffHunks).toHaveLength(2);
  expect(value.summary.files).toMatchObject({ renamed: 1, deleted: 0, untracked: 0 });
  expect(value.summary.lines).toEqual({ added: 2, deleted: 4 });
});

test('leaves unmatched entities and conflicting stable IDs predictable', () => {
  const value = report();
  const base = value.changes[0]!;
  value.changes = [
    change(base, 'deleted', 'old-a.md', 'MOD-A'),
    change(base, 'deleted', 'old-b.md', 'MOD-A'),
    change(base, 'added', 'new-a.md', 'MOD-A'),
    change(base, 'added', 'new-b.md', 'MOD-A'),
    change(base, 'deleted', 'only-old.md', 'MOD-B'),
  ];

  coalesceEntityRenames(value, new Map());

  expect(value.changes.map((item) => [item.status, item.path, item.oldPath])).toEqual([
    ['deleted', 'old-a.md', undefined],
    ['added', 'new-a.md', undefined],
    ['renamed', 'new-b.md', 'old-b.md'],
    ['deleted', 'only-old.md', undefined],
  ]);
});

test('does not coalesce changes without a matching stable ID', () => {
  const value = report();
  const base = value.changes[0]!;
  value.changes = [
    change(base, 'deleted', 'old.md', 'MOD-A'),
    change(base, 'added', 'new.md', 'MOD-B'),
  ];
  const summary = value.summary;

  coalesceEntityRenames(value, new Map());

  expect(value.changes.map((item) => item.status)).toEqual(['deleted', 'added']);
  expect(value.summary).toBe(summary);
});

test('recomputes semantic changes from parsed sides when both are available', () => {
  const value = report();
  const base = value.changes[0]!;
  const oldSource = '<!-- toudocu\nid: MOD-1\nstatus: active\n-->\n# Old\n';
  const newSource = '<!-- toudocu\nid: MOD-1\nstatus: draft\n-->\n# New\n';
  value.changes = [
    {
      ...change(base, 'deleted', 'old.md', 'MOD-1'),
      semanticDiffAvailable: true,
    },
    {
      ...change(base, 'added', 'new.md', 'MOD-1'),
      semanticDiffAvailable: true,
    },
  ];
  const parsedSides = new Map([
    ['old.md', { analysis: parseMarkdown(oldSource).analysis, source: oldSource, path: 'old.md' }],
    ['new.md', { analysis: parseMarkdown(newSource).analysis, source: newSource, path: 'new.md' }],
  ]);

  coalesceEntityRenames(value, parsedSides);

  expect(value.changes[0]?.semanticChanges.map((item) => item.kind)).toContain('status-changed');
  expect(value.changes[0]?.semanticChanges[0]?.kind).toBe('entity-moved');
});

test('omits source diff when both rename sides omit it', () => {
  const value = report();
  const base = value.changes[0]!;
  const oldChange = change(base, 'deleted', 'old.md', 'MOD-1');
  const newChange = change(base, 'added', 'new.md', 'MOD-1');
  delete oldChange.sourceDiff;
  delete newChange.sourceDiff;
  value.changes = [oldChange, newChange];

  coalesceEntityRenames(value, new Map());

  expect(value.changes[0]).not.toHaveProperty('sourceDiff');
  expect(value.changes[0]?.sourceDiffHunks).toEqual([]);
});

test('counts every change status and unique entity in summaries', () => {
  const value = report();
  const summary = {
    files: {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      typeChanged: 0,
      untracked: 0,
    },
    lines: { added: 0, deleted: 0 },
    entities: {},
    classifications: {},
  } satisfies ChangeSetReportV1['summary'];
  const base = value.changes[0]!;
  for (const status of [
    'added',
    'untracked',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'type-changed',
  ]) {
    addChangeSummary(summary, {
      ...base,
      status,
      classification: 'documentation',
      entitiesBefore: [{ id: 'MOD-1', type: 'module' }],
      entitiesAfter: [{ id: 'MOD-1', type: 'module' }],
    });
  }

  expect(summary.files).toEqual({
    added: 1,
    modified: 1,
    deleted: 1,
    renamed: 1,
    copied: 1,
    typeChanged: 1,
    untracked: 1,
  });
  expect(summary.entities).toEqual({ module: 7 });
  expect(summary.classifications).toEqual({ documentation: 7 });
});

test('restores summary maps when aggregating a migration-gated report', () => {
  const value = report();
  value.summary.entities = null;
  value.summary.classifications = null;

  addChangeSummary(value.summary, value.changes[0]!);

  expect(value.summary.entities).toEqual({ module: 1 });
  expect(value.summary.classifications).toEqual({ 'permanent-documentation': 1 });
});

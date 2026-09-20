import { expect, test } from 'vitest';
import { parseMarkdown } from '../markdown/parse.js';
import { relationMarkdownDiff, semanticMarkdownDiff } from './semantic.js';

function side(source: string, path = 'docs/modules/MOD-AUTH.md') {
  return { analysis: parseMarkdown(source).analysis, source, path };
}

test('reports metadata, typed sections, table columns, and stable rule and transition subjects', () => {
  const oldSide = side(
    [
      '<!-- toudocu',
      'id: MOD-AUTH',
      'status: active',
      'label: first',
      'label: second',
      'oldField: value',
      '-->',
      '# Auth',
      '',
      '<!-- toudocu:section business-rules -->',
      '## Rules',
      '',
      '- `BR-AUTH-001` Login is allowed.',
      '',
      '<!-- toudocu:table states columns=id,title -->',
      '| id | title |',
      '| --- | --- |',
      '| idle | Idle |',
      '',
      '<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->',
      '| id | useCase | action | condition | target | kind |',
      '| --- | --- | --- | --- | --- | --- |',
      '| TR-AUTH-001 | UC-AUTH | Login | valid | home | user |',
    ].join('\n'),
  );
  const newSide = side(
    [
      '<!-- toudocu',
      'id: MOD-AUTH',
      'status: deprecated',
      'label: first',
      'newField: value',
      '-->',
      '# Auth',
      '',
      '<!-- toudocu:section business-rules -->',
      '## Rules',
      '',
      '- `BR-AUTH-001` Login requires MFA.',
      '- `BR-AUTH-002` Lock after failures.',
      '',
      '<!-- toudocu:table states columns=id,title,preview -->',
      '| id | title | preview |',
      '| --- | --- | --- |',
      '| idle | Idle | yes |',
      '',
      '<!-- toudocu:table transitions columns=id,useCase,action,condition,target,kind -->',
      '| id | useCase | action | condition | target | kind |',
      '| --- | --- | --- | --- | --- | --- |',
      '| TR-AUTH-001 | UC-AUTH | Login | MFA | home | user |',
      '| TR-AUTH-002 | UC-AUTH | Lock | failures | locked | system |',
    ].join('\n'),
  );
  const entity = [{ id: 'MOD-AUTH', type: 'module', title: 'Auth' }];

  const changes = semanticMarkdownDiff(oldSide, newSide, entity, entity);

  expect(changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'status-changed',
        field: 'status',
        before: 'active',
        after: 'deprecated',
      }),
      expect.objectContaining({
        kind: 'field-added',
        field: 'newField',
        after: 'value',
      }),
      expect.objectContaining({
        kind: 'field-removed',
        field: 'oldField',
      }),
      expect.objectContaining({
        kind: 'rule-changed',
        field: 'business-rules',
        before: expect.stringContaining('BR-AUTH-001'),
      }),
      expect.objectContaining({
        kind: 'field-changed',
        field: 'table.states',
        before: ['id', 'title'],
        after: ['id', 'title', 'preview'],
      }),
      expect.objectContaining({
        kind: 'rule-changed',
        field: 'BR-AUTH-001',
        subject: { id: 'BR-AUTH-001', type: 'business-rule' },
      }),
      expect.objectContaining({
        kind: 'rule-added',
        field: 'BR-AUTH-002',
      }),
      expect.objectContaining({
        kind: 'transition-changed',
        field: 'TR-AUTH-001',
      }),
      expect.objectContaining({
        kind: 'transition-added',
        field: 'TR-AUTH-002',
      }),
    ]),
  );
  expect(changes).toHaveLength(9);
  expect(changes.map((change) => `${change.kind}:${change.field}`)).toEqual([
    'field-added:newField',
    'field-removed:oldField',
    'status-changed:status',
    'rule-changed:business-rules',
    'field-changed:table.states',
    'rule-changed:BR-AUTH-001',
    'rule-added:BR-AUTH-002',
    'transition-changed:TR-AUTH-001',
    'transition-added:TR-AUTH-002',
  ]);

  expect(changes.find((change) => change.field === 'label')).toBeUndefined();
  expect(changes.find((change) => change.field === 'BR-AUTH-002')).toMatchObject({
    sourceAfter: { path: 'docs/modules/MOD-AUTH.md', line: 13 },
  });
});

test('reports work verification changes with optional before and after values', () => {
  const oldSide = side(
    [
      '<!-- toudocu',
      'id: TASK-AUTH-001',
      'status: open',
      '-->',
      '# Verify auth',
      '',
      '<!-- toudocu:section verification -->',
      '## Verification',
      '',
      '- [ ] AC-AUTH-001 Run unit tests.',
    ].join('\n'),
    'work/TASK-AUTH-001.md',
  );
  const newSide = side(
    [
      '<!-- toudocu',
      'id: TASK-AUTH-001',
      'status: open',
      '-->',
      '# Verify auth',
      '',
      '<!-- toudocu:section verification -->',
      '## Verification',
      '',
      '- [x] AC-AUTH-001 Run unit tests.',
      '- [ ] AC-AUTH-002 Run integration tests.',
    ].join('\n'),
    'work/TASK-AUTH-001.md',
  );
  const entity = [{ id: 'TASK-AUTH-001', type: 'work', title: 'Verify auth' }];

  const changes = semanticMarkdownDiff(oldSide, newSide, entity, entity);
  const verification = changes.filter(
    (change) => change.kind === 'verification-changed' && change.field === 'acceptanceCriteria',
  );

  expect(verification).toEqual([
    expect.objectContaining({
      field: 'acceptanceCriteria',
      subject: { id: 'AC-AUTH-001', type: 'acceptance-criterion' },
      before: { completed: false, text: 'AC-AUTH-001 Run unit tests.' },
      after: { completed: true, text: 'AC-AUTH-001 Run unit tests.' },
      sourceBefore: { path: 'work/TASK-AUTH-001.md', line: 11 },
      sourceAfter: { path: 'work/TASK-AUTH-001.md', line: 11 },
    }),
    expect.objectContaining({
      subject: { id: 'AC-AUTH-002', type: 'acceptance-criterion' },
      after: { completed: false, text: 'AC-AUTH-002 Run integration tests.' },
      sourceAfter: { path: 'work/TASK-AUTH-001.md', line: 12 },
    }),
  ]);
  expect(verification[1]).not.toHaveProperty('before');
});

test('reports relation additions and removals while excluding the source entity', () => {
  const oldSource = '# MOD-AUTH\n\nUses BR-AUTH-001 and TR-AUTH-001.\n';
  const newSource = '# MOD-AUTH\n\nUses BR-AUTH-001 and TR-AUTH-002.\n';
  const entity = [{ id: 'MOD-AUTH', type: 'module', title: 'Auth' }];

  expect(relationMarkdownDiff(oldSource, newSource, entity, entity)).toEqual([
    {
      kind: 'relation-removed',
      source: entity[0],
      target: { id: 'TR-AUTH-001', type: 'transition' },
    },
    {
      kind: 'relation-added',
      source: entity[0],
      target: { id: 'TR-AUTH-002', type: 'transition' },
    },
  ]);
});

test('chooses the longest stable subject by UTF-8 byte length', () => {
  const oldSide = side('## BR-AUTH-001 aaa\n\n- BR-AUTH-001 яя\n');
  const newSide = side('## BR-AUTH-001 aaa\n\n- BR-AUTH-001 zz\n');
  const entity = [{ id: 'MOD-AUTH', type: 'module', title: 'Auth' }];

  const changes = semanticMarkdownDiff(oldSide, newSide, entity, entity);

  expect(changes).toEqual([
    expect.objectContaining({
      kind: 'rule-changed',
      field: 'BR-AUTH-001',
      before: 'BR-AUTH-001 яя',
      after: 'BR-AUTH-001 aaa',
    }),
  ]);
});

test('returns entity add and remove changes without reparsing content', () => {
  const empty = side('', 'docs/guide.md');
  const added = side('# Guide\n', 'docs/guide.md');
  const entity = [{ type: 'guide', title: 'Guide' }];

  expect(semanticMarkdownDiff(empty, added, [], entity)).toEqual([
    {
      kind: 'entity-added',
      entity: entity[0],
      after: entity[0],
      summary: 'Added document Guide.',
      sourceAfter: { path: 'docs/guide.md', line: 1 },
    },
  ]);
  expect(semanticMarkdownDiff(added, empty, entity, [])).toEqual([
    {
      kind: 'entity-removed',
      entity: entity[0],
      before: entity[0],
      summary: 'Removed document Guide.',
      sourceBefore: { path: 'docs/guide.md', line: 1 },
    },
  ]);
});

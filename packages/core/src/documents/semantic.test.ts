import { expect, test } from 'vitest';
import { createDocument, parseISODate } from './document.js';
import { validateSemanticAnnotations } from './semantic.js';

const now = new Date('2026-09-19T00:00:00Z');
const makeDocument = (sourcePath: string, content: string) =>
  createDocument({ sourcePath, content, modifiedAt: now }, { now, staleDays: 0 });

test('validates typed metadata, nested sections, and tables with legacy locations', () => {
  const document = makeDocument(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\nupdated: 2026-09-01\n-->\n# Auth\n\nDescription.\n\n<!-- toudocu:section context -->\n## Context\n\n<!-- toudocu:section decision -->\n### Decision\n\n<!-- toudocu:table states columns=id,title,preview -->\n| ID | Title | Preview |\n| --- | --- | --- |\n| idle | Idle | yes |\n',
  );

  expect(validateSemanticAnnotations(document)).toEqual([]);
  expect(document.sections[0]?.children[0]?.kind).toBe('decision');
  expect(document.tables[0]?.kind).toBe('states');
});

test('reports duplicate fields, unknown values, nested duplicate sections, and bad table columns', () => {
  const document = makeDocument(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\nstatus: unknown\nstatus: active\nupdated: 2026-02-30\nextra: value\n-->\n# Auth\n\n<!-- toudocu:section context -->\n## Context\n\n<!-- toudocu:section context -->\n### Nested context\n\n<!-- toudocu:section risk -->\n<!-- toudocu\nstatus: active\nprobability: maybe\n-->\n## Risk\n\n<!-- toudocu:table states columns=id,id -->\n| ID | Title |\n| --- | --- |\n',
  );
  const issues = validateSemanticAnnotations(document);
  expect(issues.map((issue) => issue.code)).toEqual([
    'duplicate-toudocu-metadata',
    'unknown-semantic-field',
    'invalid-semantic-value',
    'invalid-semantic-value',
    'duplicate-section-kind',
    'missing-semantic-field',
    'invalid-semantic-value',
    'invalid-table-columns',
  ]);
  expect(issues.find((issue) => issue.code === 'duplicate-toudocu-metadata')?.line).toBe(3);
  expect(issues.find((issue) => issue.code === 'duplicate-section-kind')?.line).toBe(14);
});

test('does not mutate null-prototype metadata or the document', () => {
  const source = makeDocument(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth\n',
  );
  const metadata = Object.create(null) as Record<string, string>;
  Object.assign(metadata, source.metadata);
  Object.defineProperty(metadata, '__proto__', {
    value: 'unexpected',
    enumerable: true,
    writable: true,
  });
  const metadataItems = [
    ...source.metadataItems,
    {
      key: '__proto__',
      rawKey: '__proto__',
      value: 'unexpected',
      range: { start: { offset: 0, line: 4, column: 1 }, end: { offset: 0, line: 4, column: 1 } },
    },
  ];
  const document = { ...source, metadata, metadataItems };
  const before = {
    metadata: document.metadata,
    sections: document.sections,
    tables: document.tables,
  };
  const issues = validateSemanticAnnotations(document);
  expect(
    issues.some(
      (issue) => issue.code === 'unknown-semantic-field' && issue.message.includes('__proto__'),
    ),
  ).toBe(true);
  expect(document.metadata).toBe(before.metadata);
  expect(document.sections).toBe(before.sections);
  expect(document.tables).toBe(before.tables);
});

test('treats prototype names as unknown semantic kinds', () => {
  const source = makeDocument(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth\n\n<!-- toudocu:section constructor -->\n## Constructor\n\n<!-- toudocu:table toString columns=id -->\n| ID |\n| --- |\n',
  );
  const document = {
    ...source,
    tables: [
      {
        headers: ['ID'],
        rows: [],
        alignments: [''],
        kind: 'toString',
        columns: ['id'],
        range: { start: { offset: 0, line: 7, column: 1 }, end: { offset: 0, line: 8, column: 1 } },
      },
    ],
  };
  expect(validateSemanticAnnotations(document).map((issue) => issue.code)).toEqual([
    'unknown-section-kind',
    'unknown-table-kind',
  ]);
});

test('parses calendar dates strictly like the legacy validator', () => {
  expect(parseISODate('2026-09-19')?.toISOString()).toBe('2026-09-19T00:00:00.000Z');
  expect(parseISODate('2026-02-29')).toBeUndefined();
  expect(parseISODate('2026-9-19')).toBeUndefined();
});

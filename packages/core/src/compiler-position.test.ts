import { expect, test } from 'vitest';
import { compileProject } from './knowledge/compile.js';
import { parseOpenAPIContract } from './openapi/openapi.js';

test('compiler keeps normalized UTF-8 ranges and source diagnostic lines across Unicode and CRLF', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const content =
    '\uFEFF# Кириллица 中文 😀 e\u0301\r\n\r\n```mermaid\r\nunsupported\r\n```\r\n\r\n[Ссылка](missing.md)\r\n';
  const project = compileProject([{ sourcePath: 'notes.md', content, modifiedAt: now }], {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: { exists: () => false, matches: () => [] },
  });
  const document = project.index.byPath.get('notes.md');
  expect(document?.content).toBe(content);
  const normalized = content.slice(1).replaceAll('\r\n', '\n');
  const link = document?.links[0];
  expect(link?.range.start.line).toBe(7);
  expect(link?.range.start.offset).toBe(
    new TextEncoder().encode(normalized.slice(0, normalized.indexOf('[Ссылка]'))).length,
  );
  expect(
    project.issues.find((issue) => issue.code === 'unsupported-mermaid-diagram-type'),
  ).toMatchObject({ documentPath: 'notes.md', line: 3 });
  expect(project.issues.find((issue) => issue.code === 'broken-link')).toMatchObject({
    documentPath: 'notes.md',
    line: 7,
  });
});

test('compiler exposes UTF-8 OpenAPI ranges without changing public issues', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const source = [
    'openapi: 3.1.0',
    'info:',
    '  title: "Китай 中文 😀 é"',
    '  version: "1"',
    'paths:',
    '  /x:',
    '    get:',
    '      operationId: getX',
    '      responses:',
    '        "200": {description: ok, $ref: "#/missing"}',
  ].join('\r\n');
  const project = compileProject([], {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: { exists: () => false, matches: () => [] },
    openAPI: [{ sourcePath: 'contracts/emoji.openapi.yaml', content: source }],
  });
  const diagnostic = project.openAPIDiagnostics.find(
    (item) => item.code === 'openapi-unresolved-internal-ref',
  );

  expect(diagnostic).toMatchObject({
    documentPath: 'contracts/emoji.openapi.yaml',
    line: 10,
    column: 40,
    range: {
      start: { offset: 185, line: 10, column: 40 },
      end: { offset: 196, line: 10, column: 51 },
    },
  });
  expect(project.issues).toContainEqual({
    severity: 'error',
    code: 'openapi-unresolved-internal-ref',
    message: 'Internal $ref cannot be resolved: #/missing',
    documentPath: 'contracts/emoji.openapi.yaml',
    line: 10,
    column: 40,
  });
});

test('compiler exposes syntax-error ranges and omits unknown OpenAPI locations', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const source = 'info: "Китай 😀 é"\r\nopenapi: [x, y}\r\n';
  const project = compileProject([], {
    now,
    staleDays: 0,
    links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
    repository: { exists: () => false, matches: () => [] },
    openAPI: [{ sourcePath: 'contracts/syntax.openapi.yaml', content: source }],
  });
  const syntaxDiagnostic = project.openAPIDiagnostics[0];

  expect(syntaxDiagnostic).toMatchObject({
    code: 'openapi-syntax-error',
    line: 2,
    column: 15,
    range: {
      start: { offset: 43, line: 2, column: 15 },
      end: { offset: 44, line: 2, column: 16 },
    },
  });
  expect(project.issues[2]).toEqual({
    severity: 'error',
    code: 'openapi-syntax-error',
    message: expect.stringContaining('Invalid OpenAPI YAML/JSON:'),
    documentPath: 'contracts/syntax.openapi.yaml',
    line: 2,
    column: 15,
  });

  const tooLarge = parseOpenAPIContract(
    'contracts/large.openapi.yaml',
    'x'.repeat(4 * 1024 * 1024 + 1),
  );
  expect(tooLarge.diagnostics[0]).toMatchObject({ code: 'openapi-document-too-large' });
  expect(tooLarge.diagnostics[0]).not.toHaveProperty('range');
});

import { describe, expect, it } from 'vitest';
import {
  openAPIOperations,
  parseOpenAPIContract,
  validateOpenAPIContract,
  type OpenAPIIssue,
} from './openapi.js';

const validSource = `openapi: 3.1.0
info:
  title: Test API
  version: '1.0'
paths:
  /items/{id}:
    parameters:
      - $ref: '#/components/parameters/ItemId'
    get:
      operationId: getItem
      responses:
        '200':
          description: ok
components:
  parameters:
    ItemId:
      name: id
      in: path
      required: true
      schema:
        type: string
`;

function codes(issues: OpenAPIIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

function expectIssue(source: string, code: string): OpenAPIIssue[] {
  const issues = validateOpenAPIContract('contracts/test.openapi.yaml', source);
  expect(codes(issues)).toContain(code);
  expect(issues[0]?.line).toBeGreaterThan(0);
  expect(issues[0]?.column).toBeGreaterThan(0);
  return issues;
}

function encodeUTF16(source: string, littleEndian: boolean): Uint8Array {
  const units = [
    0xfeff,
    ...Array.from(source).flatMap((character) => {
      const codePoint = character.codePointAt(0)!;
      if (codePoint <= 0xffff) {
        return [codePoint];
      }
      const value = codePoint - 0x10000;
      return [0xd800 + (value >> 10), 0xdc00 + (value & 0x3ff)];
    }),
  ];
  const bytes = new Uint8Array(units.length * 2);
  for (const [index, unit] of units.entries()) {
    if (littleEndian) {
      bytes[index * 2] = unit & 0xff;
      bytes[index * 2 + 1] = unit >> 8;
    } else {
      bytes[index * 2] = unit >> 8;
      bytes[index * 2 + 1] = unit & 0xff;
    }
  }
  return bytes;
}

describe('OpenAPI contract parser', () => {
  it('extracts title/version and validates operations and internal parameter refs', () => {
    const result = parseOpenAPIContract('contracts\\test.openapi.yaml', validSource);
    expect(result.issues).toEqual([]);
    expect(result.contract).toEqual({
      path: 'contracts/test.openapi.yaml',
      title: 'Test API',
      version: '3.1.0',
    });
    expect(openAPIOperations(validSource)).toEqual({ '/items/{id}': { GET: true } });
  });

  it('accepts JSON input and preserves the no-network external-ref policy', () => {
    const source = JSON.stringify({
      openapi: '3.0.3',
      info: { title: 'JSON API', version: '1' },
      paths: {
        '/x': {
          get: {
            operationId: 'getX',
            responses: {
              '200': {
                description: 'ok',
                content: { json: { schema: { $ref: 'https://invalid.example/schema.yaml' } } },
              },
            },
          },
        },
      },
    });
    const result = parseOpenAPIContract(
      'contracts/api.openapi.json',
      new TextEncoder().encode(source),
    );
    expect(result.issues).toEqual([]);
    expect(result.contract.title).toBe('JSON API');
    expect(result.contract.version).toBe('3.0.3');
  });

  it('accepts Go-compatible UTF-16LE and UTF-16BE BOM input', () => {
    for (const littleEndian of [true, false]) {
      const source = validSource.replace('Test API', '😀 API');
      const result = parseOpenAPIContract(
        littleEndian ? 'contracts/utf16le.yaml' : 'contracts/utf16be.yaml',
        encodeUTF16(source, littleEndian),
      );
      expect(result.issues).toEqual([]);
      expect(result.contract.title).toBe('😀 API');
      expect(openAPIOperations(encodeUTF16(source, littleEndian))).toEqual({
        '/items/{id}': { GET: true },
      });
    }
  });

  it('reports Go UTF-16 reader errors for truncated and malformed surrogate input', () => {
    const malformed: Array<[number[], string]> = [
      [[0xff, 0xfe, 0x61], 'incomplete UTF-16 character'],
      [[0xff, 0xfe, 0x00, 0xdc], 'unexpected low surrogate area'],
      [[0xff, 0xfe, 0x00, 0xd8], 'incomplete UTF-16 surrogate pair'],
      [[0xff, 0xfe, 0x00, 0xd8, 0x41, 0x00], 'expected low surrogate area'],
    ];
    for (const [bytes, detail] of malformed) {
      const result = parseOpenAPIContract('contracts/malformed-utf16.yaml', new Uint8Array(bytes));
      expect(result.diagnostics[0]).toEqual({
        severity: 'error',
        code: 'openapi-syntax-error',
        message: `Invalid OpenAPI YAML/JSON: yaml: ${detail}`,
        documentPath: 'contracts/malformed-utf16.yaml',
        line: 0,
        column: 0,
      });
    }
  });

  it('keeps decoded UTF-16 syntax positions aligned with UTF-8 source positions', () => {
    const source = 'openapi: 3.1.0\ninfo: [\n';
    const utf8 = parseOpenAPIContract('contracts/invalid.yaml', source).diagnostics[0];
    const utf16 = parseOpenAPIContract('contracts/invalid-utf16.yaml', encodeUTF16(source, true))
      .diagnostics[0];
    expect(utf16?.line).toBe(utf8?.line);
    expect(utf16?.column).toBe(utf8?.column);
  });

  it('rejects malformed UTF-8 without rejecting a literal replacement character', () => {
    const prefix = new TextEncoder().encode(validSource);
    const malformedCases: Array<[string, number[], string]> = [
      ['leading', [0xff], 'invalid leading UTF-8 octet'],
      ['incomplete', [0xc2], 'incomplete UTF-8 octet sequence'],
      ['trailing', [0xc2, 0x20], 'invalid trailing UTF-8 octet'],
      ['overlong', [0xc0, 0x80], 'invalid length of a UTF-8 sequence'],
      ['surrogate', [0xed, 0xa0, 0x80], 'invalid Unicode character'],
      ['out-of-range', [0xf4, 0x90, 0x80, 0x80], 'invalid Unicode character'],
    ];
    for (const [name, suffix, detail] of malformedCases) {
      const malformed = new Uint8Array([...prefix, ...suffix]);
      const result = parseOpenAPIContract(`contracts/${name}.openapi.yaml`, malformed);
      expect(result.diagnostics[0]).toEqual({
        severity: 'error',
        code: 'openapi-syntax-error',
        message: `Invalid OpenAPI YAML/JSON: yaml: ${detail}`,
        documentPath: `contracts/${name}.openapi.yaml`,
        line: 0,
        column: 0,
      });
      expect(result.diagnostics[0]).not.toHaveProperty('range');
    }

    const replacement = validSource.replace('Test API', '� API');
    expect(parseOpenAPIContract('contracts/replacement.openapi.yaml', replacement).issues).toEqual(
      [],
    );

    const oversizedMalformed = new Uint8Array(4 * 1024 * 1024 + 1);
    oversizedMalformed.fill(0xff);
    expect(
      parseOpenAPIContract('contracts/oversized.openapi.yaml', oversizedMalformed).diagnostics[0],
    ).toMatchObject({ code: 'openapi-document-too-large', line: 0, column: 0 });
  });

  it('preserves YAML scalar spelling like go-yaml and reports rune columns', () => {
    const spelling = `openapi: 3.1.0
info:
  title: 01
  version: 01
paths:
  /items/{id}:
    get:
      operationId: getItem
      responses: {'200': {description: ok}}
    parameters:
      - name: id
        in: path
        required: True
`;
    const parsed = parseOpenAPIContract('contracts/spelling.yaml', spelling);
    expect(parsed.contract.title).toBe('01');
    expect(codes(parsed.issues)).toContain('openapi-missing-path-parameter');

    const emoji = `openapi: 3.1.0
paths:
  /x:
    get:
      operationId: x
      responses:
        '200': {description: ok, note: 😀, $ref: '#/missing'}
`;
    const refIssue = validateOpenAPIContract('contracts/emoji.yaml', emoji).find(
      (issue) => issue.code === 'openapi-unresolved-internal-ref',
    );
    expect(refIssue).toMatchObject({ line: 7, column: 49 });
  });

  it('reports syntax, root, version, info, paths, operation, response, and path errors', () => {
    const cases: Array<[string, string]> = [
      ['openapi: [', 'openapi-syntax-error'],
      ['- openapi\n', 'openapi-invalid-root'],
      ['info: {title: Test, version: "1"}\npaths: {}\n', 'openapi-invalid-version'],
      [
        'openapi: 3.1.invalid\ninfo: {title: Test, version: "1"}\npaths: {}\n',
        'openapi-invalid-version',
      ],
      ['openapi: 3.1.0\npaths: {}\n', 'openapi-missing-info'],
      ['openapi: 3.1.0\ninfo: {version: "1"}\npaths: {}\n', 'openapi-missing-info-title'],
      ['openapi: 3.1.0\ninfo: {title: Test}\npaths: {}\n', 'openapi-missing-info-version'],
      ['openapi: 3.1.0\ninfo: {title: Test, version: "1"}\n', 'openapi-missing-paths'],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {x: {get: {operationId: x, responses: {"200": {description: ok}}}}}\n',
        'openapi-invalid-path',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {fetch: {operationId: x, responses: {"200": {description: ok}}}}}\n',
        'openapi-invalid-path-item-key',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: nope}}\n',
        'openapi-invalid-operation',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: {responses: {"200": {description: ok}}}}}\n',
        'openapi-missing-operation-id',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: {operationId: x}}}\n',
        'openapi-missing-responses',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: {operationId: x, responses: {"20": {description: ok}}}}}\n',
        'openapi-invalid-response-status',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: {operationId: x, responses: {"200": nope}}}}\n',
        'openapi-invalid-response',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x": {get: {operationId: x, responses: {"200": {content: {}}}}}}\n',
        'openapi-missing-response-description',
      ],
      [
        'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {"/x/{id}": {get: {operationId: x, responses: {"200": {description: ok}}}}}\n',
        'openapi-missing-path-parameter',
      ],
    ];
    for (const [source, code] of cases) expectIssue(source, code);
  });

  it('detects duplicate operation IDs and unresolved internal references', () => {
    const source = `openapi: 3.1.0
info: {title: Test, version: '1'}
paths:
  /x:
    get:
      operationId: same
      responses: {'200': {description: ok}}
      requestBody: {content: {application/json: {schema: {$ref: '#/components/schemas/Missing'}}}}
  /y:
    get:
      operationId: same
      responses: {'200': {description: ok}}
`;
    const issues = expectIssue(source, 'openapi-duplicate-operation-id');
    expect(codes(issues)).toContain('openapi-unresolved-internal-ref');
    expect(
      issues.find((issue) => issue.code === 'openapi-unresolved-internal-ref')?.message,
    ).toContain('#/components/schemas/Missing');
  });

  it('counts YAML aliases for limits while keeping normal YAML anchors parseable', () => {
    const anchored = `openapi: 3.1.0
info: {title: Test, version: '1'}
paths:
  /x:
    get:
      operationId: x
      responses:
        '200': &ok {description: ok}
`;
    expect(validateOpenAPIContract('contracts/anchored.yaml', anchored)).toEqual([]);

    const aliases = [
      'openapi: 3.1.0',
      'info: {title: Test, version: "1"}',
      'paths: {}',
      'base: &base value',
    ];
    for (let index = 0; index < 1001; index++) aliases.push(`alias${index}: *base`);
    const issues = validateOpenAPIContract('contracts/aliases.yaml', aliases.join('\n'));
    expect(codes(issues)).toContain('openapi-structure-limit');
  });

  it('does not recurse unsafely through null sequence entries or bypass parser guards', () => {
    const nullEntry = `openapi: 3.1.0
info: {title: Test, version: '1'}
paths:
  /x:
    parameters: [null]
    get:
      operationId: x
      responses: {'200': {description: ok}}
`;
    expect(() => validateOpenAPIContract('contracts/null.yaml', nullEntry)).not.toThrow();
    expect(openAPIOperations('openapi: [')).toEqual({});
    expect(openAPIOperations(`openapi: 3.1.0\n${'x'.repeat(4 * 1024 * 1024)}`)).toEqual({});
  });

  it('enforces document byte, node-depth, and node-count limits', () => {
    const tooLarge = `openapi: 3.1.0\n# ${'x'.repeat(4 * 1024 * 1024)}\n`;
    expect(validateOpenAPIContract('contracts/large.yaml', tooLarge)[0]?.code).toBe(
      'openapi-document-too-large',
    );

    let deep = 'openapi: 3.1.0\ninfo: {title: Test, version: "1"}\npaths: {}\nroot: ';
    for (let index = 0; index < 101; index++) deep += '{level: ';
    deep += 'value' + '}'.repeat(101);
    expect(codes(validateOpenAPIContract('contracts/deep.yaml', deep))).toContain(
      'openapi-structure-limit',
    );

    const many = ['openapi: 3.1.0', 'info: {title: Test, version: "1"}', 'paths: {}'];
    for (let index = 0; index < 50_000; index++) many.push(`key${index}: value`);
    expect(codes(validateOpenAPIContract('contracts/many.yaml', many.join('\n')))).toContain(
      'openapi-structure-limit',
    );
  });
});

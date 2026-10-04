import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument, Scalar } from 'yaml';
import type { Node, Pair, YAMLMap, YAMLSeq } from 'yaml';
import type { SourceRange } from '../markdown/source-position.js';
import { SourcePositionMapper } from '../markdown/source-position.js';

type AstNode = Node;
type AstMap = YAMLMap;
type AstSeq = YAMLSeq;

export interface OpenAPIContract {
  path: string;
  title: string;
  version: string;
}

export interface OpenAPIIssue {
  severity: 'error';
  code: string;
  message: string;
  documentPath: string;
  line: number;
  column: number;
}

export interface OpenAPIDiagnostic extends OpenAPIIssue {
  range?: SourceRange;
}

export type OpenAPIOperations = Record<string, Record<string, true>>;

export interface OpenAPIParseResult {
  contract: OpenAPIContract;
  issues: OpenAPIIssue[];
  diagnostics: OpenAPIDiagnostic[];
}

const httpMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const openAPIVersion = /^3\.(?:0|1)\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const responseStatus = /^(?:default|[1-5](?:\d{2}|XX))$/u;
const pathItemFields = new Set(['$ref', 'summary', 'description', 'servers', 'parameters']);
const maxBytes = 4 * 1024 * 1024;

interface SourceContext {
  source: string;
  lineCounter: LineCounter;
  mapper: SourcePositionMapper;
}

type ParsedYAMLDocument = ReturnType<typeof parseDocument>;
type ParsedSource =
  | { kind: 'too-large' }
  | { kind: 'syntax'; source: string; context: SourceContext; error: unknown }
  | { kind: 'ok'; source: string; context: SourceContext; document: ParsedYAMLDocument };

/** Parse and validate one OpenAPI source without filesystem or network access. */
export function parseOpenAPIContract(
  filePath: string,
  input: string | Uint8Array,
): OpenAPIParseResult {
  const path = normalizePath(filePath);
  const contract: OpenAPIContract = { path, title: '', version: '' };
  const parsed = parseSource(input);
  if (parsed.kind === 'too-large')
    return parseResult(contract, [
      issue('openapi-document-too-large', 'The OpenAPI document exceeds 4 MiB.', path, 0, 0),
    ]);
  if (parsed.kind === 'syntax') {
    const position = errorPosition(parsed.error, parsed.context);
    return parseResult(contract, [
      issue(
        'openapi-syntax-error',
        `Invalid OpenAPI YAML/JSON: ${errorMessage(parsed.error)}`,
        path,
        position.line,
        position.column,
        position.range,
      ),
    ]);
  }
  const { document, context } = parsed;
  const syntaxError = document.errors[0];
  if (syntaxError) {
    const position = errorPosition(syntaxError, context);
    return parseResult(contract, [
      issue(
        'openapi-syntax-error',
        `Invalid OpenAPI YAML/JSON: ${syntaxError.message}`,
        path,
        position.line,
        position.column,
        position.range,
      ),
    ]);
  }

  const root = documentMapping(document.contents);
  if (!root) {
    const location = document.contents ?? undefined;
    return parseResult(contract, [
      issueAt(
        'openapi-invalid-root',
        'The OpenAPI document must be an object.',
        path,
        location,
        context,
      ),
    ]);
  }
  const structureIssue = validateStructureLimits(path, root, context);
  if (structureIssue) return parseResult(contract, [structureIssue]);

  const diagnostics: OpenAPIDiagnostic[] = [];
  const version = mappingValue(root, 'openapi');
  if (!version || !isScalar(version) || !openAPIVersion.test(scalarValue(version))) {
    const location = version ?? root;
    diagnostics.push(
      issueAt(
        'openapi-invalid-version',
        'The openapi field must declare OpenAPI 3.0.x or 3.1.x.',
        path,
        location,
        context,
      ),
    );
  } else {
    contract.version = scalarValue(version);
  }

  const info = mappingValue(root, 'info');
  if (!info || !isAstMap(info)) {
    diagnostics.push(
      issueAt(
        'openapi-missing-info',
        'Required field info must be an object.',
        path,
        root,
        context,
      ),
    );
  } else {
    const title = mappingValue(info, 'title');
    const versionNode = mappingValue(info, 'version');
    if (!title || !isScalar(title) || !scalarValue(title).trim()) {
      diagnostics.push(
        issueAt(
          'openapi-missing-info-title',
          'Required field info.title is missing.',
          path,
          info,
          context,
        ),
      );
    } else {
      contract.title = scalarValue(title);
    }
    if (!versionNode || !isScalar(versionNode) || !scalarValue(versionNode).trim()) {
      diagnostics.push(
        issueAt(
          'openapi-missing-info-version',
          'Required field info.version is missing.',
          path,
          info,
          context,
        ),
      );
    }
  }

  const paths = mappingValue(root, 'paths');
  if (!paths || !isAstMap(paths)) {
    diagnostics.push(
      issueAt(
        'openapi-missing-paths',
        'Required field paths must be an object.',
        path,
        root,
        context,
      ),
    );
  } else {
    diagnostics.push(...validatePaths(path, root, paths, context));
  }
  diagnostics.push(...validateInternalRefs(path, root, context));
  return parseResult(contract, diagnostics);
}

export function validateOpenAPIContract(
  filePath: string,
  input: string | Uint8Array,
): OpenAPIIssue[] {
  return parseOpenAPIContract(filePath, input).issues;
}

/** Extract HTTP operations from a parsed OpenAPI source. Invalid sources return no operations. */
export function openAPIOperations(input: string | Uint8Array): OpenAPIOperations {
  const parsed = parseSource(input);
  if (parsed.kind !== 'ok') return {};
  const { document, context } = parsed;
  if (document.errors[0]) return {};
  const root = documentMapping(document.contents);
  const result: OpenAPIOperations = {};
  if (root && validateStructureLimits('', root, context)) return result;
  const paths = root ? mappingValue(root, 'paths') : undefined;
  if (!paths || !isAstMap(paths)) return result;
  for (const pair of pairs(paths)) {
    const pathValue = scalarValue(pair.key);
    if (!pair.value || !isAstMap(pair.value)) continue;
    const methods: Record<string, true> = {};
    for (const operation of pairs(pair.value)) {
      const method = scalarValue(operation.key).toUpperCase();
      if (httpMethods.has(method.toLowerCase())) methods[method] = true;
    }
    if (Object.keys(methods).length > 0) result[pathValue] = methods;
  }
  return result;
}

function parseSource(input: string | Uint8Array): ParsedSource {
  const inputBytes = typeof input === 'string' ? byteLength(input) : input.byteLength;
  if (inputBytes > maxBytes) {
    return { kind: 'too-large' };
  }

  let source: string;
  if (typeof input === 'string') {
    source = input;
  } else {
    const utf16 = decodeUTF16(input);
    if (utf16 !== undefined) {
      if (typeof utf16 === 'string') {
        source = utf16;
      } else {
        return {
          kind: 'syntax',
          source: '',
          context: {
            source: '',
            lineCounter: new LineCounter(),
            mapper: new SourcePositionMapper(''),
          },
          error: new Error(`yaml: ${utf16.message}`),
        };
      }
    } else {
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(input);
      } catch {
        return {
          kind: 'syntax',
          source: '',
          context: {
            source: '',
            lineCounter: new LineCounter(),
            mapper: new SourcePositionMapper(''),
          },
          error: new Error(`yaml: ${utf8DecodeErrorMessage(input)}`),
        };
      }
    }
  }
  const context: SourceContext = {
    source,
    lineCounter: new LineCounter(),
    mapper: new SourcePositionMapper(source),
  };
  try {
    const document = parseDocument(source, {
      lineCounter: context.lineCounter,
      keepSourceTokens: true,
      prettyErrors: false,
      strict: true,
      uniqueKeys: false,
      logLevel: 'silent',
    });
    return { kind: 'ok', source, context, document };
  } catch (error: unknown) {
    return { kind: 'syntax', source, context, error };
  }
}

function decodeUTF16(input: Uint8Array): string | { message: string } | undefined {
  if (input.length < 2) {
    return undefined;
  }
  const littleEndian = input[0] === 0xff && input[1] === 0xfe;
  const bigEndian = input[0] === 0xfe && input[1] === 0xff;
  if (!littleEndian && !bigEndian) {
    return undefined;
  }
  let source = '';
  for (let index = 2; index < input.length; index += 2) {
    if (index + 1 >= input.length) {
      return { message: 'incomplete UTF-16 character' };
    }
    const first = littleEndian
      ? (input[index] ?? 0) | ((input[index + 1] ?? 0) << 8)
      : ((input[index] ?? 0) << 8) | (input[index + 1] ?? 0);
    if (first >= 0xdc00 && first <= 0xdfff) {
      return { message: 'unexpected low surrogate area' };
    }
    if (first >= 0xd800 && first <= 0xdbff) {
      if (index + 3 >= input.length) {
        return { message: 'incomplete UTF-16 surrogate pair' };
      }
      const second = littleEndian
        ? (input[index + 2] ?? 0) | ((input[index + 3] ?? 0) << 8)
        : ((input[index + 2] ?? 0) << 8) | (input[index + 3] ?? 0);
      if (second < 0xdc00 || second > 0xdfff) {
        return { message: 'expected low surrogate area' };
      }
      source += String.fromCodePoint(0x10000 + ((first - 0xd800) << 10) + second - 0xdc00);
      index += 2;
      continue;
    }
    source += String.fromCodePoint(first);
  }
  return source;
}

function utf8DecodeErrorMessage(input: Uint8Array): string {
  for (let index = 0; index < input.length; index += 1) {
    const first = input[index] ?? 0;
    if ((first & 0x80) === 0) {
      continue;
    }
    let width: number;
    let value: number;
    if ((first & 0xe0) === 0xc0) {
      width = 2;
      value = first & 0x1f;
    } else if ((first & 0xf0) === 0xe0) {
      width = 3;
      value = first & 0x0f;
    } else if ((first & 0xf8) === 0xf0) {
      width = 4;
      value = first & 0x07;
    } else {
      return 'invalid leading UTF-8 octet';
    }
    if (index + width > input.length) {
      return 'incomplete UTF-8 octet sequence';
    }
    for (let part = 1; part < width; part += 1) {
      const byte = input[index + part] ?? 0;
      if ((byte & 0xc0) !== 0x80) {
        return 'invalid trailing UTF-8 octet';
      }
    }
    for (let part = 1; part < width; part += 1) {
      const byte = input[index + part] ?? 0;
      value = (value << 6) + (byte & 0x3f);
    }
    if (!(
      (width === 2 && value >= 0x80) ||
      (width === 3 && value >= 0x800) ||
      (width === 4 && value >= 0x10000)
    )) {
      return 'invalid length of a UTF-8 sequence';
    }
    if ((value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff) {
      return 'invalid Unicode character';
    }
    index += width - 1;
  }
  return 'invalid leading UTF-8 octet';
}

function validatePaths(
  path: string,
  root: AstMap,
  paths: AstMap,
  context: SourceContext,
): OpenAPIDiagnostic[] {
  const diagnostics: OpenAPIDiagnostic[] = [];
  const operationIDs = new Map<string, Node>();
  for (const pair of pairs(paths)) {
    const pathNode = pair.key;
    const item = pair.value;
    const pathValue = scalarValue(pathNode);
    if (!pathValue.startsWith('/') || !item || !isAstMap(item)) {
      diagnostics.push(
        issueAt(
          'openapi-invalid-path',
          'Every paths key must start with / and contain a Path Item object.',
          path,
          pathNode,
          context,
        ),
      );
      continue;
    }
    const pathParameters = openAPIParameters(root, item);
    for (const operationPair of pairs(item)) {
      const methodNode = operationPair.key;
      const operation = operationPair.value;
      const method = scalarValue(methodNode).toLowerCase();
      if (!httpMethods.has(method)) {
        if (!pathItemFields.has(method) && !method.startsWith('x-')) {
          diagnostics.push(
            issueAt(
              'openapi-invalid-path-item-key',
              `Unknown Path Item field: ${scalarValue(methodNode)}`,
              path,
              methodNode,
              context,
            ),
          );
        }
        continue;
      }
      if (!operation || !isAstMap(operation)) {
        diagnostics.push(
          issueAt(
            'openapi-invalid-operation',
            `${method.toUpperCase()} ${pathValue} must be an object.`,
            path,
            operation,
            context,
          ),
        );
        continue;
      }
      const operationID = mappingValue(operation, 'operationId');
      if (!operationID || !isScalar(operationID) || !scalarValue(operationID).trim()) {
        diagnostics.push(
          issueAt(
            'openapi-missing-operation-id',
            `${method.toUpperCase()} ${pathValue} has no operationId.`,
            path,
            operation,
            context,
          ),
        );
      } else {
        const id = scalarValue(operationID);
        const previous = operationIDs.get(id);
        if (previous)
          diagnostics.push(
            issueAt(
              'openapi-duplicate-operation-id',
              `operationId ${JSON.stringify(id)} is already declared on line ${nodeLine(previous, context)}.`,
              path,
              operationID,
              context,
            ),
          );
        else operationIDs.set(id, operationID);
      }
      const responses = mappingValue(operation, 'responses');
      if (!responses || !isMap(responses) || pairs(responses).length === 0) {
        diagnostics.push(
          issueAt(
            'openapi-missing-responses',
            `${method.toUpperCase()} ${pathValue} has no responses.`,
            path,
            operation,
            context,
          ),
        );
      } else {
        diagnostics.push(...validateResponses(path, method, pathValue, responses, context));
      }
      const parameters = [...pathParameters, ...openAPIParameters(root, operation)];
      for (const parameter of pathTemplateParameters(pathValue)) {
        if (!parameters.includes(parameter))
          diagnostics.push(
            issueAt(
              'openapi-missing-path-parameter',
              `Path parameter {${parameter}} is not declared as required in:path.`,
              path,
              operation,
              context,
            ),
          );
      }
    }
  }
  return diagnostics;
}

function validateResponses(
  path: string,
  method: string,
  pathValue: string,
  responses: AstMap,
  context: SourceContext,
): OpenAPIDiagnostic[] {
  const diagnostics: OpenAPIDiagnostic[] = [];
  for (const pair of pairs(responses)) {
    const status = scalarValue(pair.key);
    const response = pair.value;
    if (!responseStatus.test(status))
      diagnostics.push(
        issueAt(
          'openapi-invalid-response-status',
          `Invalid response status ${status} for ${method.toUpperCase()} ${pathValue}.`,
          path,
          pair.key,
          context,
        ),
      );
    if (!response || !isAstMap(response)) {
      diagnostics.push(
        issueAt(
          'openapi-invalid-response',
          `Response ${status} must be an object.`,
          path,
          response,
          context,
        ),
      );
      continue;
    }
    if (!mappingScalar(response, '$ref')) {
      const description = mappingValue(response, 'description');
      if (!description || !isScalar(description) || !scalarValue(description).trim())
        diagnostics.push(
          issueAt(
            'openapi-missing-response-description',
            `Response ${status} has no description.`,
            path,
            response,
            context,
          ),
        );
    }
  }
  return diagnostics;
}

function openAPIParameters(root: AstMap, node: AstMap): string[] {
  const parameters = mappingValue(node, 'parameters');
  if (!parameters || !isSeq(parameters)) return [];
  const result: string[] = [];
  for (let parameter of parameters.items as Node[]) {
    const ref = mappingScalar(parameter, '$ref');
    if (ref.startsWith('#/')) parameter = resolveYAMLPointer(root, ref) ?? parameter;
    if (
      !isAstMap(parameter) ||
      mappingScalar(parameter, 'in') !== 'path' ||
      mappingScalar(parameter, 'required') !== 'true'
    )
      continue;
    const name = mappingScalar(parameter, 'name');
    if (name) result.push(name);
  }
  return result;
}

function validateInternalRefs(
  path: string,
  root: AstMap,
  context: SourceContext,
): OpenAPIDiagnostic[] {
  const diagnostics: OpenAPIDiagnostic[] = [];
  const visit = (node: Node | null): void => {
    if (!node) return;
    if (isAstMap(node)) {
      for (const pair of pairs(node)) {
        if (
          scalarValue(pair.key) === '$ref' &&
          isScalar(pair.value) &&
          scalarValue(pair.value).startsWith('#/') &&
          !resolveYAMLPointer(root, scalarValue(pair.value))
        ) {
          diagnostics.push(
            issueAt(
              'openapi-unresolved-internal-ref',
              `Internal $ref cannot be resolved: ${scalarValue(pair.value)}`,
              path,
              pair.value,
              context,
            ),
          );
        }
        visit(pair.value);
      }
      return;
    }
    if (isAstSeq(node)) {
      for (const child of node.items as Array<Node | null>) if (child) visit(child);
    }
  };
  visit(root);
  return diagnostics;
}

function resolveYAMLPointer(root: AstMap, ref: string): AstNode | null {
  let current: AstNode | null = root;
  for (const rawToken of ref.slice(2).split('/')) {
    const token = rawToken.replaceAll('~1', '/').replaceAll('~0', '~');
    current = isAstMap(current) ? mappingValue(current, token) : null;
    if (!current) return null;
  }
  return current;
}

function validateStructureLimits(
  path: string,
  root: AstNode,
  context: SourceContext,
): OpenAPIDiagnostic | undefined {
  let nodes = 0;
  let aliases = 0;
  const walk = (node: AstNode, depth: number): OpenAPIIssue | undefined => {
    nodes++;
    if (isAlias(node)) aliases++;
    if (depth > 100 || nodes > 100_000 || aliases > 1_000)
      return issueAt(
        'openapi-structure-limit',
        'The OpenAPI document exceeds the allowed depth, node count, or alias count.',
        path,
        node,
        context,
      );
    if (isAstMap(node)) {
      for (const pair of pairs(node)) {
        const keyIssue = walk(pair.key, depth + 1);
        if (keyIssue) return keyIssue;
        if (pair.value) {
          const valueIssue = walk(pair.value, depth + 1);
          if (valueIssue) return valueIssue;
        }
      }
    } else if (isAstSeq(node)) {
      for (const child of node.items as Array<Node | null>) {
        if (!child) continue;
        const childIssue = walk(child, depth + 1);
        if (childIssue) return childIssue;
      }
    }
    return undefined;
  };
  return walk(root, 1);
}

function documentMapping(contents: AstNode | null | undefined): AstMap | null {
  return contents && isAstMap(contents) ? contents : null;
}

function isAstMap(value: unknown): value is AstMap {
  return isMap(value);
}
function isAstSeq(value: unknown): value is AstSeq {
  return isSeq(value);
}

function mappingValue(node: AstMap | null, key: string): AstNode | null {
  if (!node) return null;
  for (const pair of pairs(node)) if (scalarValue(pair.key) === key) return pair.value;
  return null;
}

function mappingScalar(node: AstNode | null, key: string): string {
  return isAstMap(node) ? scalarValue(mappingValue(node, key)) : '';
}

function pairs(node: AstMap): Pair<AstNode, AstNode | null>[] {
  return node.items as Pair<AstNode, AstNode | null>[];
}

function scalarValue(node: AstNode | null | undefined): string {
  if (!node || !isScalar(node)) return '';
  const scalar = node as Scalar;
  if (scalar.type === Scalar.PLAIN && scalar.source !== undefined) return scalar.source;
  const value = scalar.value;
  return value === null || value === undefined ? '' : String(value);
}

function pathTemplateParameters(value: string): string[] {
  const result: string[] = [];
  let remaining = value;
  while (true) {
    const start = remaining.indexOf('{');
    if (start < 0) return result;
    remaining = remaining.slice(start + 1);
    const end = remaining.indexOf('}');
    if (end < 0) return result;
    result.push(remaining.slice(0, end));
    remaining = remaining.slice(end + 1);
  }
}

function issue(
  code: string,
  message: string,
  documentPath: string,
  line: number,
  column: number,
  range?: SourceRange,
): OpenAPIDiagnostic {
  return {
    severity: 'error',
    code,
    message,
    documentPath,
    line,
    column,
    ...(range ? { range } : {}),
  };
}

function issueAt(
  code: string,
  message: string,
  documentPath: string,
  node: AstNode | null | undefined,
  context: SourceContext,
): OpenAPIDiagnostic {
  const position = nodePosition(node, context);
  return issue(
    code,
    message,
    documentPath,
    position.line,
    position.column,
    nodeRange(node, context),
  );
}

function parseResult(
  contract: OpenAPIContract,
  diagnostics: OpenAPIDiagnostic[],
): OpenAPIParseResult {
  return {
    contract,
    diagnostics,
    issues: diagnostics.map(({ range: _range, ...publicIssue }) => publicIssue),
  };
}

function normalizePath(value: string): string {
  return value.replaceAll('\\', '/');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function nodePosition(
  node: AstNode | null | undefined,
  context: SourceContext,
): { line: number; column: number } {
  const offset = node?.range?.[0] ?? 0;
  return offsetPosition(offset, context);
}

function nodeLine(node: AstNode | null | undefined, context: SourceContext): number {
  return nodePosition(node, context).line;
}

function errorPosition(
  error: unknown,
  context: SourceContext,
): { line: number; column: number; range?: SourceRange } {
  if (typeof error === 'object' && error !== null && 'pos' in error) {
    const pos = (error as { pos?: unknown }).pos;
    const offset = Array.isArray(pos) && typeof pos[0] === 'number' ? pos[0] : undefined;
    if (offset === undefined) return { line: 0, column: 0 };
    const position = offsetPosition(offset, context);
    const end = Array.isArray(pos) && typeof pos[1] === 'number' ? pos[1] : undefined;
    if (end === undefined) return position;
    return {
      ...position,
      range: {
        start: context.mapper.positionAt(offset),
        end: context.mapper.positionAt(end),
      },
    };
  }
  return { line: 0, column: 0 };
}

function offsetPosition(offset: number, context: SourceContext): { line: number; column: number } {
  const position = context.lineCounter.linePos(offset);
  const lineStart = context.lineCounter.lineStarts[Math.max(0, position.line - 1)] ?? 0;
  return {
    line: position.line,
    column: Array.from(context.source.slice(lineStart, offset)).length + 1,
  };
}

function nodeRange(
  node: AstNode | null | undefined,
  context: SourceContext,
): SourceRange | undefined {
  const start = node?.range?.[0];
  const end = node?.range?.[1];
  if (start === undefined || end === undefined) return undefined;
  return {
    start: context.mapper.positionAt(start),
    end: context.mapper.positionAt(end),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

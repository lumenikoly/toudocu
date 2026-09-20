import { isAlias, isMap, isSeq, LineCounter, parseDocument } from 'yaml';
import type { Node } from 'yaml';
import type { ChangeSetReportV1 } from '@toudocu/contracts';

type SemanticChange = ChangeSetReportV1['changes'][number]['semanticChanges'][number];
type ChangeDiagnostic = ChangeSetReportV1['changes'][number]['diagnostics'][number];
type ChangeEntity = SemanticChange['entity'];
type OpenAPIMap = Record<string, unknown>;
type OpenAPIValue = unknown;

interface ParsedOpenAPI {
  spec?: OpenAPIMap;
  error?: string;
}

export interface OpenAPIDiffResult {
  changes: SemanticChange[];
  diagnostics: ChangeDiagnostic[];
  available: boolean;
}

const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
const maxBytes = 4 * 1024 * 1024;
const maxDepth = 100;
const maxNodes = 100_000;
const maxAliases = 1_000;
const utf8 = new TextEncoder();

export function openAPIDiff(
  oldInput: string | Uint8Array,
  newInput: string | Uint8Array,
  oldPath: string,
  newPath: string,
): OpenAPIDiffResult {
  const oldSource = sourceText(oldInput);
  const newSource = sourceText(newInput);
  const oldParsed = oldSource.error
    ? { error: oldSource.error }
    : parseOpenAPISpec(oldSource.value);
  const newParsed = newSource.error
    ? { error: newSource.error }
    : parseOpenAPISpec(newSource.value);
  const diagnostics: ChangeDiagnostic[] = [];

  if (oldParsed.error && oldSource.hasContent) {
    diagnostics.push(openAPIDiagnostic('openapi-old-version-invalid', oldParsed.error, oldPath));
  }
  if (newParsed.error && newSource.hasContent) {
    diagnostics.push(openAPIDiagnostic('openapi-new-version-invalid', newParsed.error, newPath));
  }
  if (oldParsed.error || newParsed.error) {
    return { changes: [], diagnostics, available: false };
  }

  const entity = contractEntity(oldPath, newPath);
  const oldSpec = oldParsed.spec;
  const newSpec = newParsed.spec;
  const changes: SemanticChange[] = [];
  changes.push(...compareOpenAPIRoot(entity, oldSpec, newSpec));

  const oldOperations = collectOpenAPIOperations(oldSpec);
  const newOperations = collectOpenAPIOperations(newSpec);
  for (const key of unionSortedKeys(oldOperations, newOperations)) {
    const oldOperation = mapValue(oldOperations, key);
    const newOperation = mapValue(newOperations, key);
    if (oldOperation === undefined) {
      changes.push(
        openAPIChange(
          'contract-operation-added',
          entity,
          key,
          undefined,
          newOperation,
          'non-breaking',
          `Added operation ${key}.`,
        ),
      );
    } else if (newOperation === undefined) {
      changes.push(
        openAPIChange(
          'contract-operation-removed',
          entity,
          key,
          oldOperation,
          undefined,
          'breaking',
          `Removed operation ${key}.`,
        ),
      );
    } else {
      changes.push(...compareOpenAPIOperation(entity, key, oldOperation, newOperation));
    }
  }

  const oldSchemas = nestedMap(oldSpec, 'components', 'schemas');
  const newSchemas = nestedMap(newSpec, 'components', 'schemas');
  for (const name of unionSortedKeys(oldSchemas, newSchemas)) {
    const oldValue = mapValue(oldSchemas, name);
    const newValue = mapValue(newSchemas, name);
    if (oldValue !== undefined && newValue !== undefined && jsonEqual(oldValue, newValue)) {
      continue;
    }
    let compatibility = 'informational';
    let kind = 'field-changed';
    if (oldValue === undefined) {
      compatibility = 'non-breaking';
      kind = 'field-added';
    } else if (newValue === undefined) {
      compatibility = 'breaking';
      kind = 'field-removed';
    }
    const field = `components.schemas.${name}`;
    if (oldValue === undefined || newValue === undefined) {
      changes.push(
        openAPIChange(
          kind,
          entity,
          field,
          oldValue,
          newValue,
          compatibility,
          `Changed schema ${name}.`,
        ),
      );
    } else {
      changes.push(...compareOpenAPISchema(entity, field, oldValue, newValue));
    }
  }

  for (const change of changes) {
    if (change.compatibility === 'breaking') {
      diagnostics.push(openAPIDiagnostic('openapi-breaking-change', change.summary, newPath));
    }
  }
  return { changes, diagnostics, available: true };
}

function sourceText(input: string | Uint8Array): {
  value: string;
  hasContent: boolean;
  error?: string;
} {
  if (typeof input === 'string') {
    return { value: input, hasContent: input.length > 0 };
  }
  try {
    return {
      value: new TextDecoder('utf-8', { fatal: true }).decode(input),
      hasContent: input.byteLength > 0,
    };
  } catch {
    return { value: '', hasContent: input.byteLength > 0, error: 'Invalid UTF-8 input.' };
  }
}

function parseOpenAPISpec(source: string): ParsedOpenAPI {
  if (source.length === 0) {
    return {};
  }
  if (utf8.encode(source).byteLength > maxBytes) {
    return { error: 'The OpenAPI document exceeds 4 MiB.' };
  }

  const lineCounter = new LineCounter();
  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(source, {
      lineCounter,
      keepSourceTokens: true,
      prettyErrors: false,
      strict: true,
      uniqueKeys: true,
      logLevel: 'silent',
    });
  } catch (error: unknown) {
    return { error: errorMessage(error) };
  }
  if (document.errors.length > 0) {
    return { error: document.errors[0]?.message ?? 'Invalid OpenAPI YAML/JSON.' };
  }

  const root = document.contents;
  if (!root || !isMap(root)) {
    return { error: 'OpenAPI root must be an object.' };
  }
  const structureError = structureLimitError(root);
  if (structureError) {
    return { error: structureError };
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: maxAliases });
  } catch (error: unknown) {
    return { error: errorMessage(error) };
  }
  if (!isObjectMap(value)) {
    return { error: 'OpenAPI root must be an object.' };
  }
  if (hasObjectCycle(value)) {
    return { error: 'The OpenAPI document contains a recursive alias.' };
  }
  if (!Object.hasOwn(value, 'openapi')) {
    return { error: 'openapi field is missing.' };
  }
  return { spec: value };
}

function structureLimitError(root: Node): string | undefined {
  let nodes = 0;
  let aliases = 0;
  const walk = (node: Node, depth: number): boolean => {
    nodes += 1;
    if (isAlias(node)) {
      aliases += 1;
    }
    if (depth > maxDepth || nodes > maxNodes || aliases > maxAliases) {
      return true;
    }
    if (isMap(node)) {
      for (const pair of node.items as Array<{ key: Node; value: Node | null }>) {
        if (walk(pair.key, depth + 1)) {
          return true;
        }
        if (pair.value && walk(pair.value, depth + 1)) {
          return true;
        }
      }
    } else if (isSeq(node)) {
      for (const child of node.items as Array<Node | null>) {
        if (child && walk(child, depth + 1)) {
          return true;
        }
      }
    }
    return false;
  };
  return walk(root, 1)
    ? 'The OpenAPI document exceeds the allowed depth, node count, or alias count.'
    : undefined;
}

function hasObjectCycle(value: unknown, active = new Set<object>()): boolean {
  if (!isObjectMap(value) && !Array.isArray(value)) {
    return false;
  }
  if (active.has(value)) {
    return true;
  }
  active.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    if (hasObjectCycle(child, active)) {
      return true;
    }
  }
  active.delete(value);
  return false;
}

function compareOpenAPIRoot(
  entity: ChangeEntity,
  oldSpec: OpenAPIMap | undefined,
  newSpec: OpenAPIMap | undefined,
): SemanticChange[] {
  const changes: SemanticChange[] = [];
  for (const field of ['openapi', 'info', 'servers', 'tags', 'webhooks']) {
    const oldValue = oldSpec === undefined ? undefined : mapValue(oldSpec, field);
    const newValue = newSpec === undefined ? undefined : mapValue(newSpec, field);
    if (samePresenceAndValue(oldSpec, newSpec, field, oldValue, newValue)) {
      continue;
    }
    const compatibility =
      field === 'webhooks' && oldValue !== undefined && newValue === undefined
        ? 'breaking'
        : 'informational';
    changes.push(
      openAPIChange(
        'field-changed',
        entity,
        field,
        oldValue,
        newValue,
        compatibility,
        `Changed OpenAPI element ${field}.`,
      ),
    );
  }
  changes.push(
    ...compareNamedOpenAPIValues(
      entity,
      'components.securitySchemes',
      nestedMap(oldSpec, 'components', 'securitySchemes'),
      nestedMap(newSpec, 'components', 'securitySchemes'),
      'potentially-breaking',
    ),
  );
  return changes;
}

function collectOpenAPIOperations(spec: OpenAPIMap | undefined): Record<string, OpenAPIValue> {
  const result: Record<string, OpenAPIValue> = Object.create(null) as Record<string, OpenAPIValue>;
  const paths = asOpenAPIMap(spec === undefined ? undefined : mapValue(spec, 'paths'));
  for (const path of sortedKeys(paths)) {
    const item = asOpenAPIMap(mapValue(paths, path));
    for (const method of httpMethods) {
      if (Object.hasOwn(item, method)) {
        result[`${method.toUpperCase()} ${path}`] = mapValue(item, method);
      }
    }
  }
  return result;
}

function compareOpenAPIOperation(
  entity: ChangeEntity,
  key: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  const oldOperation = asOpenAPIMap(oldRaw);
  const newOperation = asOpenAPIMap(newRaw);
  const changes: SemanticChange[] = [];
  for (const field of ['operationId', 'callbacks']) {
    const oldValue = mapValue(oldOperation, field);
    const newValue = mapValue(newOperation, field);
    if (samePresenceAndValue(oldOperation, newOperation, field, oldValue, newValue)) {
      continue;
    }
    let compatibility = 'potentially-breaking';
    if (oldValue === undefined) {
      if (field === 'parameters' && !containsRequiredParameter(newValue)) {
        compatibility = 'non-breaking';
      }
    } else if (newValue === undefined) {
      compatibility = 'breaking';
    }
    changes.push(
      openAPIChange(
        'contract-operation-changed',
        entity,
        `${key}.${field}`,
        oldValue,
        newValue,
        compatibility,
        `${key}: changed field ${field}.`,
      ),
    );
  }
  changes.push(
    ...compareOpenAPIParameters(
      entity,
      key,
      mapValue(oldOperation, 'parameters'),
      mapValue(newOperation, 'parameters'),
    ),
  );
  changes.push(
    ...compareOpenAPIRequestBody(
      entity,
      key,
      mapValue(oldOperation, 'requestBody'),
      mapValue(newOperation, 'requestBody'),
    ),
  );
  changes.push(
    ...compareOpenAPISecurity(
      entity,
      key,
      mapValue(oldOperation, 'security'),
      mapValue(newOperation, 'security'),
    ),
  );

  const oldResponses = asOpenAPIMap(mapValue(oldOperation, 'responses'));
  const newResponses = asOpenAPIMap(mapValue(newOperation, 'responses'));
  for (const response of unionSortedKeys(oldResponses, newResponses)) {
    const oldValue = mapValue(oldResponses, response);
    const newValue = mapValue(newResponses, response);
    if (oldValue !== undefined && newValue !== undefined && jsonEqual(oldValue, newValue)) {
      continue;
    }
    let compatibility = 'potentially-breaking';
    let verb = 'changed';
    if (oldValue === undefined) {
      compatibility = 'non-breaking';
      verb = 'added';
    } else if (newValue === undefined) {
      compatibility = 'breaking';
      verb = 'removed';
    }
    const field = `${key}.responses.${response}`;
    changes.push(
      openAPIChange(
        'contract-operation-changed',
        entity,
        field,
        oldValue,
        newValue,
        compatibility,
        `${key}: ${verb} response ${response}.`,
      ),
    );
    if (oldValue !== undefined && newValue !== undefined) {
      changes.push(...compareOpenAPIResponseHeaders(entity, field, oldValue, newValue));
    }
  }
  return changes;
}

function compareOpenAPIParameters(
  entity: ChangeEntity,
  operation: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  const oldParameters = openAPIParameterMap(oldRaw);
  const newParameters = openAPIParameterMap(newRaw);
  const changes: SemanticChange[] = [];
  for (const key of unionSortedKeys(oldParameters, newParameters)) {
    const oldValue = mapValue(oldParameters, key);
    const newValue = mapValue(newParameters, key);
    if (oldValue !== undefined && newValue !== undefined && jsonEqual(oldValue, newValue)) {
      continue;
    }
    let compatibility = 'potentially-breaking';
    let verb = 'changed';
    if (oldValue === undefined) {
      verb = 'added';
      compatibility = openAPIRequired(newValue) ? 'breaking' : 'non-breaking';
    } else if (newValue === undefined) {
      verb = 'removed';
    }
    const field = `${operation}.parameters.${key}`;
    changes.push(
      openAPIChange(
        'contract-operation-changed',
        entity,
        field,
        oldValue,
        newValue,
        compatibility,
        `${operation}: ${verb} parameter ${key}.`,
      ),
    );
  }
  return changes;
}

function compareOpenAPIRequestBody(
  entity: ChangeEntity,
  operation: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  if (jsonEqual(oldRaw, newRaw)) {
    return [];
  }
  let compatibility = 'potentially-breaking';
  if (oldRaw === undefined || oldRaw === null) {
    compatibility = openAPIRequired(newRaw) ? 'breaking' : 'non-breaking';
  } else if (newRaw === undefined || newRaw === null) {
    compatibility = 'non-breaking';
  }
  return [
    openAPIChange(
      'contract-operation-changed',
      entity,
      `${operation}.requestBody`,
      oldRaw,
      newRaw,
      compatibility,
      `${operation}: changed request body.`,
    ),
  ];
}

function compareOpenAPISecurity(
  entity: ChangeEntity,
  operation: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  if (jsonEqual(oldRaw, newRaw)) {
    return [];
  }
  const compatibility = securityAlternativesRemoved(oldRaw, newRaw)
    ? 'breaking'
    : 'potentially-breaking';
  return [
    openAPIChange(
      'contract-operation-changed',
      entity,
      `${operation}.security`,
      oldRaw,
      newRaw,
      compatibility,
      `${operation}: changed security alternatives.`,
    ),
  ];
}

function compareOpenAPIResponseHeaders(
  entity: ChangeEntity,
  field: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  return compareNamedOpenAPIValues(
    entity,
    `${field}.headers`,
    nestedMap(asOpenAPIMap(oldRaw), 'headers'),
    nestedMap(asOpenAPIMap(newRaw), 'headers'),
    'potentially-breaking',
  );
}

function compareOpenAPISchema(
  entity: ChangeEntity,
  field: string,
  oldRaw: OpenAPIValue,
  newRaw: OpenAPIValue,
): SemanticChange[] {
  const oldSchema = asOpenAPIMap(oldRaw);
  const newSchema = asOpenAPIMap(newRaw);
  const changes: SemanticChange[] = [];
  for (const key of ['type', 'format', 'nullable', 'additionalProperties']) {
    const oldValue = mapValue(oldSchema, key);
    const newValue = mapValue(newSchema, key);
    if (samePresenceAndValue(oldSchema, newSchema, key, oldValue, newValue)) {
      continue;
    }
    const compatibility =
      key === 'type' || key === 'format' || (key === 'additionalProperties' && newValue === false)
        ? 'breaking'
        : 'potentially-breaking';
    changes.push(
      openAPIChange(
        'field-changed',
        entity,
        `${field}.${key}`,
        oldValue,
        newValue,
        compatibility,
        `Changed schema field ${field}.${key}.`,
      ),
    );
  }

  const oldEnum = stringSet(mapValue(oldSchema, 'enum'));
  const newEnum = stringSet(mapValue(newSchema, 'enum'));
  if (!stringSetEqual(oldEnum, newEnum)) {
    const compatibility = stringSetSubset(oldEnum, newEnum) ? 'non-breaking' : 'breaking';
    changes.push(
      openAPIChange(
        'field-changed',
        entity,
        `${field}.enum`,
        mapValue(oldSchema, 'enum'),
        mapValue(newSchema, 'enum'),
        compatibility,
        `Changed enum ${field}.`,
      ),
    );
  }

  const oldProperties = nestedMap(oldSchema, 'properties');
  const newProperties = nestedMap(newSchema, 'properties');
  const oldRequired = stringSet(mapValue(oldSchema, 'required'));
  const newRequired = stringSet(mapValue(newSchema, 'required'));
  for (const name of unionSortedKeys(oldProperties, newProperties)) {
    const oldValue = mapValue(oldProperties, name);
    const newValue = mapValue(newProperties, name);
    const propertyField = `${field}.properties.${name}`;
    if (oldValue === undefined || newValue === undefined) {
      const added = oldValue === undefined;
      changes.push(
        openAPIChange(
          added ? 'field-added' : 'field-removed',
          entity,
          propertyField,
          oldValue,
          newValue,
          added ? 'non-breaking' : 'breaking',
          `${added ? 'Added' : 'Removed'} schema property ${name}.`,
        ),
      );
    } else {
      changes.push(...compareOpenAPISchema(entity, propertyField, oldValue, newValue));
    }
  }
  for (const name of sortedSetValues(newRequired)) {
    if (!oldRequired.has(name)) {
      changes.push(
        openAPIChange(
          'field-changed',
          entity,
          `${field}.required.${name}`,
          false,
          true,
          'breaking',
          `Property ${name} became required.`,
        ),
      );
    }
  }
  for (const name of sortedSetValues(oldRequired)) {
    if (!newRequired.has(name)) {
      changes.push(
        openAPIChange(
          'field-changed',
          entity,
          `${field}.required.${name}`,
          true,
          false,
          'non-breaking',
          `Property ${name} is no longer required.`,
        ),
      );
    }
  }
  return changes;
}

function compareNamedOpenAPIValues(
  entity: ChangeEntity,
  prefix: string,
  oldValues: OpenAPIMap,
  newValues: OpenAPIMap,
  removalCompatibility: string,
): SemanticChange[] {
  const changes: SemanticChange[] = [];
  for (const name of unionSortedKeys(oldValues, newValues)) {
    const oldValue = mapValue(oldValues, name);
    const newValue = mapValue(newValues, name);
    if (oldValue !== undefined && newValue !== undefined && jsonEqual(oldValue, newValue)) {
      continue;
    }
    let compatibility = 'informational';
    let kind = 'field-changed';
    let verb = 'Changed';
    if (oldValue === undefined) {
      compatibility = 'non-breaking';
      kind = 'field-added';
      verb = 'Added';
    } else if (newValue === undefined) {
      compatibility = removalCompatibility;
      kind = 'field-removed';
      verb = 'Removed';
    }
    changes.push(
      openAPIChange(
        kind,
        entity,
        `${prefix}.${name}`,
        oldValue,
        newValue,
        compatibility,
        `${verb} OpenAPI element ${prefix}.${name}.`,
      ),
    );
  }
  return changes;
}

function asOpenAPIMap(value: OpenAPIValue): OpenAPIMap {
  return isObjectMap(value) ? value : {};
}

function emptyOpenAPIValue(value: OpenAPIValue, exists: boolean): OpenAPIValue {
  return exists ? value : undefined;
}

function openAPIParameterMap(value: OpenAPIValue): OpenAPIMap {
  const result: OpenAPIMap = Object.create(null) as OpenAPIMap;
  if (!Array.isArray(value)) {
    return result;
  }
  for (const raw of value) {
    const parameter = asOpenAPIMap(raw);
    const name = goString(mapValue(parameter, 'name'));
    const location = goString(mapValue(parameter, 'in'));
    if (!name || name === '<nil>' || !location || location === '<nil>') {
      continue;
    }
    result[`${location}:${name}`] = raw;
  }
  return result;
}

function openAPIRequired(value: OpenAPIValue): boolean {
  return mapValue(asOpenAPIMap(value), 'required') === true;
}

function securityAlternativesRemoved(oldRaw: OpenAPIValue, newRaw: OpenAPIValue): boolean {
  return !stringSetSubset(securityAlternativeSet(oldRaw), securityAlternativeSet(newRaw));
}

function securityAlternativeSet(value: OpenAPIValue): Set<string> {
  const result = new Set<string>();
  if (!Array.isArray(value)) {
    return result;
  }
  for (const item of value) {
    result.add(canonicalJSON(item));
  }
  return result;
}

function stringSet(value: OpenAPIValue): Set<string> {
  const result = new Set<string>();
  if (!Array.isArray(value)) {
    return result;
  }
  for (const item of value) {
    result.add(goString(item));
  }
  return result;
}

function stringSetSubset(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function stringSetEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && stringSetSubset(left, right);
}

function containsRequiredParameter(value: OpenAPIValue): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((item) => openAPIRequired(item));
}

function nestedMap(value: OpenAPIMap | undefined, ...keys: string[]): OpenAPIMap {
  let current = value;
  for (const key of keys) {
    const raw = current === undefined ? undefined : mapValue(current, key);
    const next = asOpenAPIMap(raw);
    if (Object.keys(next).length === 0 && !isObjectMap(raw)) {
      return {};
    }
    current = next;
  }
  return current ?? {};
}

function unionSortedKeys(left: OpenAPIMap, right: OpenAPIMap): string[] {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...keys].sort(compareGoStrings);
}

function sortedKeys(value: OpenAPIMap): string[] {
  return Object.keys(value).sort(compareGoStrings);
}

function sortedSetValues(value: ReadonlySet<string>): string[] {
  return [...value].sort(compareGoStrings);
}

function samePresenceAndValue(
  oldMap: OpenAPIMap | undefined,
  newMap: OpenAPIMap | undefined,
  field: string,
  oldValue: OpenAPIValue,
  newValue: OpenAPIValue,
): boolean {
  const oldPresent = oldMap !== undefined && Object.hasOwn(oldMap, field);
  const newPresent = newMap !== undefined && Object.hasOwn(newMap, field);
  return oldPresent === newPresent && jsonEqual(oldValue, newValue);
}

function isObjectMap(value: unknown): value is OpenAPIMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mapValue(value: OpenAPIMap, key: string): OpenAPIValue | undefined {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}

function goString(value: unknown): string {
  if (value === null || value === undefined) {
    return '<nil>';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function canonicalJSON(value: unknown): string {
  return JSON.stringify(canonicalValue(value)) ?? 'null';
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (isObjectMap(value)) {
    const result: OpenAPIMap = Object.create(null) as OpenAPIMap;
    for (const key of sortedKeys(value)) {
      result[key] = canonicalValue(mapValue(value, key));
    }
    return result;
  }
  return value ?? null;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return canonicalJSON(left) === canonicalJSON(right);
}

function openAPIChange(
  kind: string,
  entity: ChangeEntity,
  field: string,
  before: OpenAPIValue,
  after: OpenAPIValue,
  compatibility: string,
  summary: string,
): SemanticChange {
  const change: SemanticChange = {
    kind,
    entity,
    field,
    summary,
    compatibility,
  };
  if (before !== undefined && before !== null) {
    change.before = canonicalValue(before);
  }
  if (after !== undefined && after !== null) {
    change.after = canonicalValue(after);
  }
  return change;
}

function openAPIDiagnostic(code: string, message: string, documentPath: string): ChangeDiagnostic {
  return { severity: 'warning', code, message, documentPath };
}

function contractEntity(oldPath: string, newPath: string): ChangeEntity {
  const newID = contractID(newPath);
  const id = newID || contractID(oldPath);
  const entity: ChangeEntity = { type: 'contract' };
  if (id) {
    entity.id = id;
  }
  if (newPath) {
    entity.title = newPath;
  }
  return entity;
}

function contractID(path: string): string {
  const match = path
    .toUpperCase()
    .match(/\b(?:UC|FLOW|SC|TR|MOD|ADR|TASK|BUG|BR|INV|CONTRACT)-[A-Z0-9][A-Z0-9-]*\b/);
  const id = match?.[0] ?? '';
  return id.startsWith('CONTRACT-') ? id : '';
}

function compareGoStrings(left: string, right: string): number {
  const a = utf8.encode(left);
  const b = utf8.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const leftByte = a[index] ?? 0;
    const rightByte = b[index] ?? 0;
    if (leftByte !== rightByte) {
      return leftByte - rightByte;
    }
  }
  return a.length - b.length;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

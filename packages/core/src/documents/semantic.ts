import type { Issue } from '@toudocu/contracts';
import { parseISODate, statusFor, type Document } from './document.js';
import type { MetadataItem, Section } from '../markdown/model.js';

interface SemanticSchema {
  readonly allowed: readonly string[];
  readonly required: readonly string[];
}

const schemas: Readonly<Record<string, SemanticSchema>> = {
  status: { allowed: ['status', 'stage', 'updated'], required: ['status'] },
  roadmap: { allowed: ['updated'], required: [] },
  risks: { allowed: ['updated'], required: [] },
  module: { allowed: ['id', 'status', 'updated'], required: ['id', 'status'] },
  'use-case': {
    allowed: [
      'id',
      'status',
      'priority',
      'module',
      'screens',
      'startScreen',
      'terminalScreens',
      'allowCycle',
      'updated',
    ],
    required: ['id', 'status', 'module'],
  },
  flow: { allowed: ['id', 'module', 'useCase', 'updated'], required: ['id'] },
  decision: { allowed: ['id', 'status', 'date', 'author', 'updated'], required: ['id', 'status'] },
  contract: { allowed: ['id', 'status', 'updated'], required: ['id'] },
  standard: {
    allowed: ['id', 'status', 'scope', 'updated', 'supersededBy'],
    required: ['id', 'status', 'scope', 'updated'],
  },
  runbook: {
    allowed: ['id', 'status', 'environment', 'risk', 'lastVerified'],
    required: ['id', 'status', 'risk', 'lastVerified'],
  },
  work: {
    allowed: [
      'id',
      'status',
      'taskType',
      'priority',
      'severity',
      'reproducibility',
      'regression',
      'observedIn',
      'module',
      'useCase',
      'flow',
      'screens',
      'transitions',
      'standards',
      'runbooks',
      'dependsOn',
      'parentTask',
      'updated',
    ],
    required: ['id', 'status', 'taskType'],
  },
  screen: {
    allowed: [
      'id',
      'screenKind',
      'module',
      'status',
      'route',
      'preview',
      'parentScreen',
      'component',
      'updated',
    ],
    required: ['id', 'screenKind', 'module', 'status'],
  },
};

const sectionKinds = new Set([
  'summary',
  'acceptance-criteria',
  'verification',
  'rules',
  'automated-checks',
  'prerequisites',
  'procedure',
  'rollback',
  'stop-conditions',
  'main-scenario',
  'postconditions',
  'business-rules',
  'implementation',
  'code-location',
  'boundaries',
  'invariants',
  'stable-interfaces',
  'related-use-cases',
  'context',
  'decision',
  'consequences',
  'result',
  'behavior-change',
  'before',
  'after',
  'scope',
  'out-of-scope',
  'plan',
  'documentation-impact',
  'blocker',
  'cancellation-reason',
  'use-case-omission-reason',
  'symptom',
  'expected-behavior',
  'actual-behavior',
  'steps-to-reproduce',
  'evidence',
  'cause',
  'regression-test',
  'relationship-to-user-behavior',
  'roadmap-stage',
  'risk',
]);

const sectionSchemas: Readonly<Record<string, SemanticSchema>> = {
  'roadmap-stage': { allowed: ['status', 'plannedDate'], required: ['status'] },
  risk: {
    allowed: ['status', 'probability', 'impact'],
    required: ['status', 'probability', 'impact'],
  },
};

const tableSchemas: Readonly<Record<string, SemanticSchema>> = {
  states: { allowed: ['id', 'title', 'preview'], required: ['id', 'title', 'preview'] },
  transitions: {
    allowed: [
      'id',
      'useCase',
      'action',
      'condition',
      'target',
      'state',
      'error',
      'message',
      'contract',
      'kind',
    ],
    required: ['id', 'useCase', 'action', 'condition', 'target', 'kind'],
  },
  errors: { allowed: ['id', 'message'], required: ['id', 'message'] },
};

const riskValues = new Set(['low', 'medium', 'high', 'critical']);
const priorityValues = new Set(['low', 'normal', 'medium', 'high', 'urgent']);
const severityValues = new Set(['low', 'medium', 'high', 'critical']);
const reproducibilityValues = new Set([
  'always',
  'often',
  'sometimes',
  'rarely',
  'not-reproduced',
  'unknown',
]);
const screenKinds = new Set(['screen', 'page', 'modal', 'panel', 'external', 'system']);
const taskStatuses = new Set(['draft', 'ready', 'in-progress', 'blocked', 'done', 'cancelled']);
const standardStatuses = new Set(['draft', 'active', 'obsolete', 'superseded']);
const runbookStatuses = new Set(['draft', 'active', 'review-required', 'obsolete']);
const screenStatuses = new Set(['done', 'in-progress', 'planned', 'blocked', 'obsolete']);

type IssueLocation = { readonly line?: number | undefined };

function issue(
  document: Document,
  code: string,
  message: string,
  location: IssueLocation = {},
): Issue {
  return {
    severity: 'error',
    code,
    message,
    documentPath: document.sourcePath,
    ...(location.line === undefined ? {} : { line: location.line }),
  };
}

function allowed(values: readonly string[]): ReadonlySet<string> {
  return new Set(values);
}

function schemaFor(
  schemasByName: Readonly<Record<string, SemanticSchema>>,
  name: string,
): SemanticSchema | undefined {
  return Object.hasOwn(schemasByName, name) ? schemasByName[name] : undefined;
}

function metadataRecord(items: readonly MetadataItem[]): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  for (const item of items) if (!Object.hasOwn(result, item.key)) result[item.key] = item.value;
  return result;
}

function metadataLine(document: Document, key: string): number | undefined {
  return document.metadataItems.find((item) => item.key === key)?.range.start.line;
}

function metadataCounts(document: Document): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const item of document.metadataItems) counts.set(item.key, (counts.get(item.key) ?? 0) + 1);
  return counts;
}

function sectionMetadata(section: Section): Record<string, string> {
  return metadataRecord(section.metadata);
}

function validDate(value: string): boolean {
  return parseISODate(value.trim()) !== undefined;
}

function statusValue(value: string, type: string): boolean {
  const normalized = value.trim();
  if (type === 'standard') return standardStatuses.has(normalized);
  if (type === 'runbook') return runbookStatuses.has(normalized);
  if (type === 'work') return taskStatuses.has(normalized);
  if (type === 'screen') return screenStatuses.has(normalized);
  return statusFor(normalized).recognized;
}

/** Validate canonical semantic annotations without changing the supplied document. */
export function validateSemanticAnnotations(document: Document): Issue[] {
  const issues: Issue[] = [];
  if (document.metadataBlocks > 1) {
    issues.push(
      issue(
        document,
        'duplicate-toudocu-metadata',
        'A document may contain only one Toudocu metadata block.',
      ),
    );
  }

  const counts = metadataCounts(document);
  for (const [key, count] of counts) {
    if (count > 1) {
      issues.push(
        issue(
          document,
          'duplicate-toudocu-metadata',
          `Semantic field ${key} is declared more than once.`,
          { line: metadataLine(document, key) },
        ),
      );
    }
  }

  let schema = schemaFor(schemas, document.type);
  let typed = schema !== undefined;
  if (document.sourcePath === 'architecture/overview.md') {
    schema = { allowed: ['updated'], required: [] };
    typed = true;
  } else if (document.type === 'architecture') {
    schema = { allowed: ['architectureQuestion', 'updated'], required: ['architectureQuestion'] };
    typed = true;
  }
  if (typed && schema) {
    const accepted = allowed(schema.allowed);
    for (const key of Object.keys(document.metadata)) {
      if (!accepted.has(key)) {
        issues.push(
          issue(
            document,
            'unknown-semantic-field',
            `Unknown semantic field ${key} for ${document.type}.`,
            { line: metadataLine(document, key) },
          ),
        );
      }
    }
    for (const key of schema.required) {
      if (!document.metadata[key]?.trim()) {
        issues.push(
          issue(document, 'missing-semantic-field', `Missing required semantic field ${key}.`),
        );
      }
    }
  }

  const metadata = document.metadata;
  const invalid = (key: string): void => {
    issues.push(
      issue(
        document,
        'invalid-semantic-value',
        `Invalid canonical value for ${key}: ${metadata[key]}.`,
        { line: metadataLine(document, key) },
      ),
    );
  };
  if (metadata.status && !statusValue(metadata.status, document.type)) invalid('status');
  if (
    metadata.taskType &&
    !new Set(['feature', 'bug', 'maintenance', 'documentation', 'research']).has(
      metadata.taskType.trim(),
    )
  )
    invalid('taskType');
  if (metadata.screenKind && !screenKinds.has(metadata.screenKind.trim())) invalid('screenKind');
  if (metadata.risk && !riskValues.has(metadata.risk.trim())) invalid('risk');
  if (metadata.allowCycle && !['true', 'false'].includes(metadata.allowCycle))
    invalid('allowCycle');
  for (const [key, values] of [
    ['priority', priorityValues],
    ['severity', severityValues],
    ['reproducibility', reproducibilityValues],
    ['regression', new Set(['true', 'false'])],
  ] as const) {
    if (metadata[key] && !values.has(metadata[key].trim())) invalid(key);
  }
  for (const key of ['updated', 'date', 'lastVerified'])
    if (metadata[key] && !validDate(metadata[key])) invalid(key);

  const seenSections = new Set<string>();
  const visitSections = (sections: readonly Section[]): void => {
    for (const section of sections) {
      if (section.kind) {
        if (!sectionKinds.has(section.kind)) {
          issues.push(
            issue(
              document,
              'unknown-section-kind',
              `Unknown semantic section kind ${section.kind}.`,
              { line: section.range.start.line },
            ),
          );
        } else if (
          seenSections.has(section.kind) &&
          section.kind !== 'roadmap-stage' &&
          section.kind !== 'risk'
        ) {
          issues.push(
            issue(
              document,
              'duplicate-section-kind',
              `Semantic section kind ${section.kind} is declared more than once.`,
              { line: section.range.start.line },
            ),
          );
        }
        seenSections.add(section.kind);
      }
      validateSection(document, section, issues);
      visitSections(section.children);
    }
  };
  visitSections(document.sections);
  validateTables(document, issues);
  return issues;
}

function validateSection(document: Document, section: Section, issues: Issue[]): void {
  const schema = schemaFor(sectionSchemas, section.kind);
  if (!schema && section.metadata.length === 0) return;
  const metadata = sectionMetadata(section);
  const line = { line: section.range.start.line };
  if (schema) {
    const accepted = allowed(schema.allowed);
    for (const key of Object.keys(metadata)) {
      if (!accepted.has(key))
        issues.push(
          issue(
            document,
            'unknown-semantic-field',
            `Unknown semantic field ${key} for section ${section.kind}.`,
            line,
          ),
        );
    }
    for (const key of schema.required) {
      if (!metadata[key]?.trim())
        issues.push(
          issue(
            document,
            'missing-semantic-field',
            `Missing required semantic field ${key} for section ${section.kind}.`,
            line,
          ),
        );
    }
  } else {
    for (const key of Object.keys(metadata))
      issues.push(
        issue(
          document,
          'unknown-semantic-field',
          `Unknown semantic field ${key} for section ${section.kind}.`,
          line,
        ),
      );
  }
  if (metadata.status && !statusFor(metadata.status).recognized)
    issues.push(
      issue(
        document,
        'invalid-semantic-value',
        `Invalid canonical value for status: ${metadata.status}.`,
        line,
      ),
    );
  for (const key of ['probability', 'impact'])
    if (metadata[key] && !riskValues.has(metadata[key].trim()))
      issues.push(
        issue(
          document,
          'invalid-semantic-value',
          `Invalid canonical value for ${key}: ${metadata[key]}.`,
          line,
        ),
      );
  if (metadata.plannedDate && !validDate(metadata.plannedDate))
    issues.push(
      issue(
        document,
        'invalid-semantic-value',
        `Invalid canonical value for plannedDate: ${metadata.plannedDate}.`,
        line,
      ),
    );
}

function validateTables(document: Document, issues: Issue[]): void {
  const seen = new Set<string>();
  for (const table of document.tables) {
    if (!table.kind) continue;
    const schema = schemaFor(tableSchemas, table.kind);
    if (!schema) {
      issues.push(
        issue(document, 'unknown-table-kind', `Unknown semantic table kind ${table.kind}.`, {
          line: table.range.start.line,
        }),
      );
      continue;
    }
    let valid = !seen.has(table.kind) && table.columns.length === table.headers.length;
    seen.add(table.kind);
    const accepted = allowed(schema.allowed);
    const columns = new Set<string>();
    for (const column of table.columns) {
      if (!accepted.has(column) || columns.has(column)) valid = false;
      columns.add(column);
    }
    for (const key of schema.required) if (!columns.has(key)) valid = false;
    if (!valid)
      issues.push(
        issue(
          document,
          'invalid-table-columns',
          `Semantic table columns are invalid for ${table.kind}.`,
          { line: table.range.start.line },
        ),
      );
  }
}

import type { ChangeSetReportV1 } from '@toudocu/contracts';
import { normalizeSemanticText } from './mermaid.js';
import type { MarkdownAnalysis, Section, Table, Task } from '../markdown/model.js';

type Change = ChangeSetReportV1['changes'][number];
type ChangeEntity = Change['entitiesBefore'][number];
type SemanticChange = Change['semanticChanges'][number];
type RelationChange = Change['relationChanges'][number];
type ChangeLocation = NonNullable<SemanticChange['sourceBefore']>;

export interface ParsedMarkdownSide {
  analysis: MarkdownAnalysis;
  source: string;
  path: string;
}

interface TableContract {
  columns: string[];
  line: number;
}

interface SemanticSubject {
  entity: ChangeEntity;
  value: string;
  line: number;
}

interface VerificationCriterion {
  completed: boolean;
  text: string;
  line: number;
}

const stableEntityID = /\b(?:UC|FLOW|SC|TR|MOD|ADR|TASK|BUG|BR|INV|CONTRACT)-[A-Z0-9][A-Z0-9-]*\b/g;
const acceptanceCriterionID = /\bAC-[A-Z0-9-]+\b/;
const entityTypes: Readonly<Record<string, string>> = {
  UC: 'use-case',
  FLOW: 'flow',
  SC: 'screen',
  TR: 'transition',
  MOD: 'module',
  ADR: 'decision',
  TASK: 'work',
  BUG: 'work',
  BR: 'business-rule',
  INV: 'invariant',
  CONTRACT: 'contract',
};

export function semanticMarkdownDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  before: readonly ChangeEntity[],
  after: readonly ChangeEntity[],
): SemanticChange[] {
  const entity = after[0] ?? before[0] ?? { type: '' };

  if (oldSide.source.length === 0 && newSide.source.length > 0) {
    return [
      {
        kind: 'entity-added',
        entity,
        after: entity,
        summary: `Added ${semanticEntityName(entity)}.`,
        sourceAfter: sourceLocation(newSide.path, 1),
      },
    ];
  }

  if (newSide.source.length === 0 && oldSide.source.length > 0) {
    return [
      {
        kind: 'entity-removed',
        entity,
        before: entity,
        summary: `Removed ${semanticEntityName(entity)}.`,
        sourceBefore: sourceLocation(oldSide.path, 1),
      },
    ];
  }

  const changes: SemanticChange[] = [];
  changes.push(...metadataDiff(oldSide, newSide, entity));
  changes.push(...sectionDiff(oldSide, newSide, entity));
  changes.push(...tableDiff(oldSide, newSide, entity));
  changes.push(...stableSubjectDiff(oldSide, newSide, entity));

  if (entity.type === 'work') {
    changes.push(...verificationDiff(oldSide, newSide, entity));
  }

  return changes;
}

export function relationMarkdownDiff(
  oldSource: string,
  newSource: string,
  before: readonly ChangeEntity[],
  after: readonly ChangeEntity[],
): RelationChange[] {
  const source = after[0] ?? before[0] ?? { type: '' };
  const oldIDs = referencedEntityIDs(oldSource, source.id);
  const newIDs = referencedEntityIDs(newSource, source.id);
  const ids = new Set([...oldIDs, ...newIDs]);
  const changes: RelationChange[] = [];

  for (const id of [...ids].sort()) {
    let kind = '';
    if (!oldIDs.has(id) && newIDs.has(id)) {
      kind = 'relation-added';
    } else if (oldIDs.has(id) && !newIDs.has(id)) {
      kind = 'relation-removed';
    }

    if (kind) {
      changes.push({
        kind,
        source,
        target: { id, type: entityTypeFromID(id) },
      });
    }
  }

  return changes;
}

function metadataDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  entity: ChangeEntity,
): SemanticChange[] {
  const oldMetadata = metadataRecord(oldSide.analysis);
  const newMetadata = metadataRecord(newSide.analysis);
  const keys = new Set([...oldMetadata.keys(), ...newMetadata.keys()]);
  const changes: SemanticChange[] = [];

  for (const key of [...keys].sort()) {
    const oldValue = oldMetadata.get(key) ?? '';
    const newValue = newMetadata.get(key) ?? '';
    if (oldValue === newValue) {
      continue;
    }

    let kind = 'field-changed';
    if (!oldValue) {
      kind = 'field-added';
    } else if (!newValue) {
      kind = 'field-removed';
    }
    if (key === 'status') {
      kind = 'status-changed';
    }

    const change: SemanticChange = {
      kind,
      entity,
      field: key,
      summary: semanticFieldSummary(kind, key),
    };
    if (oldValue) {
      change.before = oldValue;
    }
    if (newValue) {
      change.after = newValue;
    }

    const oldLine = metadataLine(oldSide.analysis, key);
    if (oldLine !== undefined) {
      change.sourceBefore = sourceLocation(oldSide.path, oldLine);
    }
    const newLine = metadataLine(newSide.analysis, key);
    if (newLine !== undefined) {
      change.sourceAfter = sourceLocation(newSide.path, newLine);
    }

    changes.push(change);
  }

  return changes;
}

function sectionDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  entity: ChangeEntity,
): SemanticChange[] {
  const oldSections = sectionsByKind(oldSide.analysis);
  const newSections = sectionsByKind(newSide.analysis);
  const ids = new Set([...oldSections.keys(), ...newSections.keys()]);
  const changes: SemanticChange[] = [];

  for (const id of [...ids].sort()) {
    const oldSection = oldSections.get(id);
    const newSection = newSections.get(id);

    let operation = 'changed';
    if (!oldSection) {
      operation = 'added';
    } else if (!newSection) {
      operation = 'removed';
    } else if (
      normalizeSemanticText(oldSection.markdown) === normalizeSemanticText(newSection.markdown)
    ) {
      continue;
    }

    const kind = typedSectionChangeKind(
      entity.type,
      newSection?.kind ?? '',
      oldSection?.kind ?? '',
      operation,
    );
    const title = newSection?.heading.title || oldSection?.heading.title || '';
    const change: SemanticChange = {
      kind,
      entity,
      field: id,
      summary: `${summaryVerb(operation)} section ${title}.`,
    };

    if (oldSection) {
      change.before = normalizeSemanticText(oldSection.markdown);
      change.sourceBefore = sourceLocation(oldSide.path, oldSection.range.start.line - 1);
    }
    if (newSection) {
      change.after = normalizeSemanticText(newSection.markdown);
      change.sourceAfter = sourceLocation(newSide.path, newSection.range.start.line - 1);
    }

    changes.push(change);
  }

  return changes;
}

function tableDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  entity: ChangeEntity,
): SemanticChange[] {
  const oldTables = tablesByKind(oldSide.analysis);
  const newTables = tablesByKind(newSide.analysis);
  const kinds = new Set([...oldTables.keys(), ...newTables.keys()]);
  const changes: SemanticChange[] = [];

  for (const tableKind of [...kinds].sort()) {
    const oldTable = oldTables.get(tableKind);
    const newTable = newTables.get(tableKind);
    if (oldTable && newTable && oldTable.columns.join('\0') === newTable.columns.join('\0')) {
      continue;
    }

    let kind = 'field-changed';
    if (!oldTable) {
      kind = 'field-added';
    } else if (!newTable) {
      kind = 'field-removed';
    }

    const field = `table.${tableKind}`;
    const change: SemanticChange = {
      kind,
      entity,
      field,
      summary: semanticFieldSummary(kind, field),
    };
    if (oldTable) {
      change.before = oldTable.columns;
      change.sourceBefore = sourceLocation(oldSide.path, oldTable.line);
    }
    if (newTable) {
      change.after = newTable.columns;
      change.sourceAfter = sourceLocation(newSide.path, newTable.line);
    }

    changes.push(change);
  }

  return changes;
}

function stableSubjectDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  entity: ChangeEntity,
): SemanticChange[] {
  const oldSubjects = stableSubjects(oldSide.analysis);
  const newSubjects = stableSubjects(newSide.analysis);
  const ids = new Set([...oldSubjects.keys(), ...newSubjects.keys()]);
  const changes: SemanticChange[] = [];

  for (const id of [...ids].sort()) {
    const oldSubject = oldSubjects.get(id);
    const newSubject = newSubjects.get(id);
    if (oldSubject && newSubject && oldSubject.value === newSubject.value) {
      continue;
    }

    let operation = 'changed';
    if (!oldSubject) {
      operation = 'added';
    } else if (!newSubject) {
      operation = 'removed';
    }

    const subject = newSubject?.entity ?? oldSubject?.entity ?? { type: '' };
    const prefix = subjectPrefix(subject.type);
    const change: SemanticChange = {
      kind: `${prefix}-${operation}`,
      entity,
      subject,
      field: id,
      summary: semanticSubjectSummary(prefix, operation, id),
    };

    if (oldSubject) {
      change.before = oldSubject.value;
      change.sourceBefore = sourceLocation(oldSide.path, oldSubject.line);
    }
    if (newSubject) {
      change.after = newSubject.value;
      change.sourceAfter = sourceLocation(newSide.path, newSubject.line);
    }

    changes.push(change);
  }

  return changes;
}

function verificationDiff(
  oldSide: ParsedMarkdownSide,
  newSide: ParsedMarkdownSide,
  entity: ChangeEntity,
): SemanticChange[] {
  const oldCriteria = verificationCriteria(oldSide.analysis.tasks);
  const newCriteria = verificationCriteria(newSide.analysis.tasks);
  const ids = new Set([...oldCriteria.keys(), ...newCriteria.keys()]);
  const changes: SemanticChange[] = [];

  for (const id of [...ids].sort()) {
    const oldCriterion = oldCriteria.get(id);
    const newCriterion = newCriteria.get(id);
    if (
      oldCriterion &&
      newCriterion &&
      oldCriterion.completed === newCriterion.completed &&
      oldCriterion.text === newCriterion.text
    ) {
      continue;
    }

    const change: SemanticChange = {
      kind: 'verification-changed',
      entity,
      subject: { id, type: 'acceptance-criterion' },
      field: 'acceptanceCriteria',
      summary: `Changed criterion ${id}.`,
    };
    if (oldCriterion) {
      change.before = {
        completed: oldCriterion.completed,
        text: oldCriterion.text,
      };
      change.sourceBefore = sourceLocation(oldSide.path, oldCriterion.line);
    }
    if (newCriterion) {
      change.after = {
        completed: newCriterion.completed,
        text: newCriterion.text,
      };
      change.sourceAfter = sourceLocation(newSide.path, newCriterion.line);
    }

    changes.push(change);
  }

  return changes;
}

function metadataRecord(analysis: MarkdownAnalysis): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of analysis.metadata) {
    if (!result.has(item.key)) {
      result.set(item.key, trimSemanticText(item.value));
    }
  }
  return result;
}

function metadataLine(analysis: MarkdownAnalysis, key: string): number | undefined {
  return analysis.metadata.find((item) => item.key === key)?.range.start.line;
}

function sectionsByKind(analysis: MarkdownAnalysis): Map<string, Section> {
  const result = new Map<string, Section>();
  for (const section of analysis.sections) {
    if (section.heading.level === 2 && section.kind) {
      result.set(section.kind, section);
    }
  }
  return result;
}

function tablesByKind(analysis: MarkdownAnalysis): Map<string, TableContract> {
  const result = new Map<string, TableContract>();
  for (const table of analysis.tables) {
    if (table.kind) {
      result.set(table.kind, {
        columns: [...table.columns],
        line: table.range.start.line,
      });
    }
  }
  return result;
}

function stableSubjects(analysis: MarkdownAnalysis): Map<string, SemanticSubject> {
  const result = new Map<string, SemanticSubject>();

  const add = (value: string, line: number): void => {
    const ids = value.match(stableEntityID) ?? [];
    const normalized = normalizeSemanticText(value);
    for (const id of ids) {
      const type = entityTypeFromID(id);
      if (type !== 'business-rule' && type !== 'invariant' && type !== 'transition') {
        continue;
      }

      const existing = result.get(id);
      if (!existing || utf8Length(normalized) > utf8Length(existing.value)) {
        result.set(id, {
          entity: { id, type },
          value: normalized,
          line,
        });
      }
    }
  };

  for (const heading of analysis.headings) {
    add(heading.title, heading.range.start.line);
  }
  for (const item of analysis.listItems) {
    add(item.text, item.range.start.line);
  }
  for (const table of analysis.tables) {
    for (const row of table.rows) {
      add(row.cells.join(' | '), row.range.start.line);
    }
  }

  return result;
}

function verificationCriteria(tasks: readonly Task[]): Map<string, VerificationCriterion> {
  const result = new Map<string, VerificationCriterion>();
  for (const task of tasks) {
    const id = acceptanceCriterionID.exec(task.text)?.[0];
    if (id) {
      result.set(id, {
        completed: task.completed,
        text: normalizeSemanticText(task.text),
        line: task.range.start.line + 1,
      });
    }
  }
  return result;
}

function referencedEntityIDs(source: string, sourceID?: string): Set<string> {
  const ids = new Set<string>();
  for (const id of source.match(stableEntityID) ?? []) {
    if (id !== sourceID) {
      ids.add(id);
    }
  }
  return ids;
}

function semanticEntityName(entity: ChangeEntity): string {
  if (entity.id) {
    return `document ${entity.id}`;
  }
  if (entity.title) {
    return `document ${entity.title}`;
  }
  return 'document';
}

function semanticFieldSummary(kind: string, key: string): string {
  if (kind === 'field-added') {
    return `Added field ${key}.`;
  }
  if (kind === 'field-removed') {
    return `Removed field ${key}.`;
  }
  if (kind === 'status-changed') {
    return 'Changed status.';
  }
  return `Changed field ${key}.`;
}

function typedSectionChangeKind(
  entityType: string,
  newKind: string,
  oldKind: string,
  operation: string,
): string {
  const kind = newKind || oldKind;
  let prefix = 'section';
  if (kind === 'business-rules' || kind === 'rules' || kind === 'invariants') {
    prefix = 'rule';
  } else if (entityType === 'work' && kind === 'verification') {
    prefix = 'verification';
  } else if (entityType === 'screen' && kind === 'transitions') {
    prefix = 'transition';
  }
  return `${prefix}-${operation}`;
}

function summaryVerb(operation: string): string {
  if (operation === 'added') {
    return 'Added';
  }
  if (operation === 'removed') {
    return 'Removed';
  }
  return 'Changed';
}

function subjectPrefix(type: string): string {
  if (type === 'business-rule' || type === 'invariant') {
    return 'rule';
  }
  if (type === 'transition') {
    return 'transition';
  }
  return 'field';
}

function semanticSubjectSummary(prefix: string, operation: string, id: string): string {
  let label = 'item';
  if (prefix === 'rule') {
    label = 'rule';
  } else if (prefix === 'transition') {
    label = 'transition';
  }
  const action = summaryVerb(operation);
  return `${action} ${label} ${id}.`;
}

function entityTypeFromID(id: string): string {
  const prefix = id.split('-', 1)[0] ?? '';
  return entityTypes[prefix] ?? '';
}

function sourceLocation(path: string, line: number): ChangeLocation {
  if (line > 0) {
    return { path, line };
  }
  return { path };
}

function trimSemanticText(value: string): string {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

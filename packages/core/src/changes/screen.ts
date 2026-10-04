import type { ChangeSetReportV1 } from '@toudocu/contracts';
import type { MarkdownAnalysis, TableRow } from '../markdown/model.js';
import { normalizeTableCell } from '../markdown/table-cell.js';

export type ScreenDiffMetadata = NonNullable<ChangeSetReportV1['changes'][number]['screen']>;
export type ScreenNodeSnapshot = NonNullable<ScreenDiffMetadata['before']>;
export type ScreenTransitionSnapshot = NonNullable<
  ScreenDiffMetadata['transitions'][number]['before']
>;

type ScreenTransitionChange = ScreenDiffMetadata['transitions'][number];
type ScreenNodeOptionalField = Exclude<keyof ScreenNodeSnapshot, 'id'>;
type ScreenTransitionOptionalStringField = Exclude<
  keyof ScreenTransitionSnapshot,
  'id' | 'source' | 'target' | 'line'
>;

interface ScreenSnapshot {
  node?: ScreenNodeSnapshot;
  transitions: Map<string, ScreenTransitionSnapshot>;
}

const utf8 = new TextEncoder();

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

function screenSnapshotTitle(title: string, id: string): string {
  for (const separator of [':', '—']) {
    const prefix = `${id}${separator}`;
    if (title.startsWith(prefix)) {
      return title.slice(prefix.length).trim();
    }
  }
  return title;
}

function metadataRecord(analysis: MarkdownAnalysis): Readonly<Record<string, string>> {
  const metadata: Record<string, string> = {};
  for (const item of analysis.metadata) {
    if (!Object.hasOwn(metadata, item.key)) {
      metadata[item.key] = item.value.trim();
    }
  }
  return metadata;
}

function tableCell(row: TableRow, columns: ReadonlyMap<string, number>, key: string): string {
  return normalizeTableCell(row.cells, columns.get(key));
}

function screenSnapshot(analysis: MarkdownAnalysis | undefined): ScreenSnapshot {
  const transitions = new Map<string, ScreenTransitionSnapshot>();
  if (!analysis) {
    return { transitions };
  }

  const metadata = metadataRecord(analysis);
  const id = metadata.id ?? '';
  const node: ScreenNodeSnapshot = { id };
  const fields: [ScreenNodeOptionalField, string][] = [
    ['title', screenSnapshotTitle(analysis.title, id)],
    ['route', metadata.route ?? ''],
    ['module', metadata.module ?? ''],
    ['status', metadata.status ?? ''],
    ['type', metadata.screenKind ?? ''],
  ];
  for (const [key, value] of fields) {
    if (value) {
      node[key] = value;
    }
  }

  const table = analysis.tables.find((candidate) => candidate.kind === 'transitions');
  if (table) {
    const columns = new Map<string, number>();
    for (const [index, key] of table.columns.entries()) {
      columns.set(key, index);
    }
    for (const row of table.rows) {
      const transitionID = tableCell(row, columns, 'id').toUpperCase();
      if (!transitionID) {
        continue;
      }
      const transition: ScreenTransitionSnapshot = {
        id: transitionID,
        source: id,
        target: tableCell(row, columns, 'target').toUpperCase(),
      };
      const values: [ScreenTransitionOptionalStringField, string][] = [
        ['action', tableCell(row, columns, 'action')],
        ['condition', tableCell(row, columns, 'condition')],
        ['state', tableCell(row, columns, 'state').toUpperCase()],
        ['error', tableCell(row, columns, 'error').toUpperCase()],
        ['useCase', tableCell(row, columns, 'useCase').toUpperCase()],
      ];
      for (const [key, value] of values) {
        if (value) {
          transition[key] = value;
        }
      }
      if (row.range.start.line) {
        transition.line = row.range.start.line;
      }
      transitions.set(transitionID, transition);
    }
  }
  return { node, transitions };
}

function sameTransition(
  before: ScreenTransitionSnapshot,
  after: ScreenTransitionSnapshot,
): boolean {
  return (
    before.id === after.id &&
    before.source === after.source &&
    before.target === after.target &&
    before.action === after.action &&
    before.condition === after.condition &&
    before.state === after.state &&
    before.error === after.error &&
    before.useCase === after.useCase &&
    before.line === after.line
  );
}

function compareScreenSnapshots(
  beforeNode: ScreenNodeSnapshot | undefined,
  afterNode: ScreenNodeSnapshot | undefined,
  beforeTransitions: ReadonlyMap<string, ScreenTransitionSnapshot>,
  afterTransitions: ReadonlyMap<string, ScreenTransitionSnapshot>,
): ScreenDiffMetadata {
  const ids = new Set([...beforeTransitions.keys(), ...afterTransitions.keys()]);
  const transitions: ScreenTransitionChange[] = [];
  for (const id of [...ids].sort(compareGoStrings)) {
    const before = beforeTransitions.get(id);
    const after = afterTransitions.get(id);
    if (before && after && sameTransition(before, after)) {
      continue;
    }

    let status = 'modified';
    if (!before) {
      status = 'added';
    } else if (!after) {
      status = 'removed';
    }
    const change: ScreenTransitionChange = {
      id,
      status,
    };
    if (before) {
      change.before = before;
    }
    if (after) {
      change.after = after;
    }
    transitions.push(change);
  }
  return {
    ...(beforeNode ? { before: beforeNode } : {}),
    ...(afterNode ? { after: afterNode } : {}),
    transitions,
  };
}

export function buildScreenDiffMetadata(
  before: MarkdownAnalysis | undefined,
  after: MarkdownAnalysis | undefined,
): ScreenDiffMetadata {
  const beforeSnapshot = screenSnapshot(before);
  const afterSnapshot = screenSnapshot(after);
  return compareScreenSnapshots(
    beforeSnapshot.node,
    afterSnapshot.node,
    beforeSnapshot.transitions,
    afterSnapshot.transitions,
  );
}

export function buildScreenDiffFromSnapshots(
  beforeNode: ScreenNodeSnapshot | undefined,
  afterNode: ScreenNodeSnapshot | undefined,
  before: ScreenDiffMetadata | undefined,
  after: ScreenDiffMetadata | undefined,
): ScreenDiffMetadata {
  const beforeTransitions = new Map<string, ScreenTransitionSnapshot>();
  const afterTransitions = new Map<string, ScreenTransitionSnapshot>();
  for (const change of before?.transitions ?? []) {
    if (change.before) {
      beforeTransitions.set(change.id, change.before);
    }
  }
  for (const change of after?.transitions ?? []) {
    if (change.after) {
      afterTransitions.set(change.id, change.after);
    }
  }
  return compareScreenSnapshots(beforeNode, afterNode, beforeTransitions, afterTransitions);
}

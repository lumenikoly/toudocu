import type { ChangeSetReportV1 } from '@toudocu/contracts';
import { buildScreenDiffFromSnapshots } from './screen.js';
import { parseSourceDiffHunks } from './patch.js';
import { semanticMarkdownDiff, type ParsedMarkdownSide } from './semantic.js';

type Change = ChangeSetReportV1['changes'][number];
type Summary = ChangeSetReportV1['summary'];
type AssetDiffMetadata = NonNullable<Change['asset']>;

export function addChangeSummary(summary: Summary, change: Change): void {
  switch (change.status) {
    case 'added':
      summary.files.added += 1;
      break;
    case 'untracked':
      summary.files.untracked += 1;
      break;
    case 'modified':
      summary.files.modified += 1;
      break;
    case 'deleted':
      summary.files.deleted += 1;
      break;
    case 'renamed':
      summary.files.renamed += 1;
      break;
    case 'copied':
      summary.files.copied += 1;
      break;
    case 'type-changed':
      summary.files.typeChanged += 1;
      break;
  }

  summary.lines.added += change.lines.added;
  summary.lines.deleted += change.lines.deleted;

  if (summary.classifications === null) {
    summary.classifications = {};
  }
  summary.classifications[change.classification] =
    (summary.classifications[change.classification] ?? 0) + 1;

  if (summary.entities === null) {
    summary.entities = {};
  }
  const seen = new Set<string>();
  for (const entity of [...change.entitiesBefore, ...change.entitiesAfter]) {
    const key = `${entity.type}:${entity.id ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    summary.entities[entity.type] = (summary.entities[entity.type] ?? 0) + 1;
  }
}

export function coalesceEntityRenames(
  report: ChangeSetReportV1,
  parsedSides: ReadonlyMap<string, ParsedMarkdownSide>,
): void {
  const removed = new Map<string, number>();
  const added = new Map<string, number>();

  for (const [index, change] of report.changes.entries()) {
    if (!change.entitiesBefore.length && !change.entitiesAfter.length) {
      continue;
    }
    const beforeID = change.entitiesBefore[0]?.id;
    const afterID = change.entitiesAfter[0]?.id;
    if (change.status === 'deleted' && beforeID) {
      removed.set(beforeID, index);
    }
    if ((change.status === 'added' || change.status === 'untracked') && afterID) {
      added.set(afterID, index);
    }
  }

  const drop = new Set<number>();
  for (const [id, oldIndex] of removed) {
    const newIndex = added.get(id);
    if (newIndex === undefined) {
      continue;
    }

    const oldChange = report.changes[oldIndex];
    const newChange = report.changes[newIndex];
    if (!oldChange || !newChange) {
      continue;
    }
    newChange.status = 'renamed';
    newChange.oldPath = oldChange.path;
    newChange.entitiesBefore = oldChange.entitiesBefore;
    const sourceDiff = `${oldChange.sourceDiff ?? ''}${newChange.sourceDiff ?? ''}`;
    if (sourceDiff) {
      newChange.sourceDiff = sourceDiff;
    } else {
      delete newChange.sourceDiff;
    }
    newChange.sourceDiffHunks = parseSourceDiffHunks(sourceDiff);
    newChange.renderedSections = [...oldChange.renderedSections, ...newChange.renderedSections];
    mergeAssetMetadata(oldChange, newChange);
    mergeScreenMetadata(oldChange, newChange);
    newChange.lines.added += oldChange.lines.added;
    newChange.lines.deleted += oldChange.lines.deleted;
    newChange.semanticChanges = recomputeSemanticChanges(oldChange, newChange, parsedSides);
    newChange.semanticChanges.unshift({
      kind: 'entity-moved',
      entity: newChange.entitiesAfter[0]!,
      before: oldChange.path,
      after: newChange.path,
      summary: `Entity ${id} moved.`,
    });
    drop.add(oldIndex);
  }

  if (!drop.size) {
    return;
  }

  report.changes = report.changes.filter((_change, index) => !drop.has(index));
  report.summary = emptySummary();
  for (const change of report.changes) {
    addChangeSummary(report.summary, change);
  }
}

function mergeAssetMetadata(oldChange: Change, newChange: Change): void {
  if (!oldChange.asset && !newChange.asset) {
    return;
  }

  const merged: AssetDiffMetadata = {};
  if (oldChange.asset?.before) {
    merged.before = oldChange.asset.before;
  }
  if (newChange.asset?.after) {
    merged.after = newChange.asset.after;
  }
  newChange.asset = merged;
}

function mergeScreenMetadata(oldChange: Change, newChange: Change): void {
  if (!oldChange.screen && !newChange.screen) {
    return;
  }

  newChange.screen = buildScreenDiffFromSnapshots(
    oldChange.screen?.before,
    newChange.screen?.after,
    oldChange.screen,
    newChange.screen,
  );
}

function recomputeSemanticChanges(
  oldChange: Change,
  newChange: Change,
  parsedSides: ReadonlyMap<string, ParsedMarkdownSide>,
): Change['semanticChanges'] {
  if (!oldChange.semanticDiffAvailable || !newChange.semanticDiffAvailable) {
    return [];
  }

  const oldSide = parsedSides.get(oldChange.path);
  const newSide = parsedSides.get(newChange.path);
  if (!oldSide || !newSide) {
    throw new Error(
      `Missing parsed Markdown side for rename ${oldChange.path} -> ${newChange.path}.`,
    );
  }

  return semanticMarkdownDiff(oldSide, newSide, oldChange.entitiesBefore, newChange.entitiesAfter);
}

function emptySummary(): Summary {
  return {
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
  };
}

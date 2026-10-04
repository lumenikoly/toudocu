import type { ChangeSetReportV1 } from '@toudocu/contracts';

export type Change = ChangeSetReportV1['changes'][number];

export type RangeState = {
  base: string;
  branchBase: string;
  target: 'working-tree' | 'index' | 'HEAD' | 'revision';
  revision: string;
};

export type ChangeFilters = {
  query: string;
  status: string;
  type: string;
};

export type ChangeTree = {
  directories: Map<string, ChangeTree>;
  files: Change[];
};

export function rangeFromUrl(
  url = typeof globalThis.location === 'undefined'
    ? 'http://toudocu.local/'
    : globalThis.location.href,
): RangeState {
  const params = new URL(url).searchParams;
  const target = params.get('target');
  const namedTarget = target === 'working-tree' || target === 'index' || target === 'HEAD';
  return {
    base: params.get('base') ?? 'HEAD',
    branchBase: params.get('branchBase') ?? '',
    target:
      target && !namedTarget
        ? 'revision'
        : target === 'index' || target === 'HEAD'
          ? target
          : 'working-tree',
    revision:
      target && !namedTarget
        ? target === 'revision'
          ? (params.get('revision') ?? '')
          : target
        : '',
  };
}

export function rangeQuery(range: RangeState): URLSearchParams {
  const params = new URLSearchParams();
  if (range.base.trim() && range.base.trim() !== 'HEAD') params.set('base', range.base.trim());
  if (range.branchBase.trim()) params.set('branchBase', range.branchBase.trim());
  const target = range.target === 'revision' ? range.revision.trim() : range.target;
  if (target && target !== 'working-tree') params.set('target', target);
  return params;
}

export function buildChangeTree(changes: Change[]): ChangeTree {
  const root: ChangeTree = { directories: new Map(), files: [] };
  for (const change of changes) {
    let node = root;
    const parts = change.path.split('/');
    for (const part of parts.slice(0, -1)) {
      let child = node.directories.get(part);
      if (!child) {
        child = { directories: new Map(), files: [] };
        node.directories.set(part, child);
      }
      node = child;
    }
    node.files.push(change);
  }
  return root;
}

export function isDocumentationChange(change: Change): boolean {
  return change.classification !== 'repository-file' || /\.md$/iu.test(change.path);
}

export function visibleChanges(
  changes: Change[],
  filters: ChangeFilters,
  locale: string,
): Change[] {
  const query = filters.query.trim().toLocaleLowerCase(locale);
  return changes
    .filter(
      (change) =>
        (!query ||
          `${change.path} ${change.oldPath ?? ''}`.toLocaleLowerCase(locale).includes(query)) &&
        (!filters.status || change.status === filters.status) &&
        (!filters.type ||
          (filters.type === 'documents' && isDocumentationChange(change)) ||
          (filters.type === 'other' && !isDocumentationChange(change))),
    )
    .sort((left, right) => left.path.localeCompare(right.path, locale));
}

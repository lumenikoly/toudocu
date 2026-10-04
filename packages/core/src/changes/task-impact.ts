import type { ChangeSetReportV1 } from '@toudocu/contracts';
import type { MarkdownAnalysis } from '../markdown/model.js';
import type { ParsedMarkdownSide } from './semantic.js';

type Change = ChangeSetReportV1['changes'][number];
type Impact = NonNullable<ChangeSetReportV1['taskImpact']>;
type ImpactEntry = Impact['declared'][number];

export interface TaskImpactTask {
  id: string;
  path: string;
  side: ParsedMarkdownSide;
}

export interface TaskImpactOptions {
  task: TaskImpactTask;
  selectedTasks?: readonly TaskImpactTask[];
  docsRel: string;
  pathExists: ((path: string) => boolean) | ReadonlySet<string>;
  scopeMatch: (pattern: string, path: string) => boolean;
}

const documentationPathRE =
  /(?:\.\.?\/)*(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:md|ya?ml|json|png|jpe?g|webp|svg)/gu;
const utf8 = new TextEncoder();
const unicodeWhiteSpace =
  '[\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const trimUnicodeWhiteSpace = new RegExp(`^${unicodeWhiteSpace}+|${unicodeWhiteSpace}+$`, 'gu');

export function buildTaskImpact(
  report: ChangeSetReportV1,
  taskID: string,
  options: TaskImpactOptions,
): Impact {
  const impact: Impact = {
    taskId: taskID,
    declared: [],
    actual: [],
    taskChanges: [],
    diagnostics: [],
  };
  const selectedTasks: TaskImpactTask[] = [options.task];
  for (const task of options.selectedTasks ?? []) {
    if (task.id === options.task.id && task.path === options.task.path) {
      continue;
    }
    selectedTasks.push(task);
  }
  const selectedPaths = new Set(selectedTasks.map((task) => task.path));
  const declaredBy = new Map<string, string[]>();
  const scope: string[] = [];

  for (const task of selectedTasks) {
    for (const path of declaredTaskDocumentation(task.side.analysis, task.path, options.docsRel)) {
      const ids = declaredBy.get(path) ?? [];
      ids.push(task.id);
      declaredBy.set(path, ids);
    }
    scope.push(...taskScopePaths(task.side.analysis));
  }

  for (const change of report.changes) {
    if (selectedPaths.has(change.path) || selectedPaths.has(change.oldPath ?? '')) {
      impact.taskChanges.push(change);
      continue;
    }
    const actual: ImpactEntry = {
      path: change.path,
      declared: false,
      changed: true,
    };
    if (change.status === 'added' || change.status === 'untracked') {
      actual.created = true;
    }
    impact.actual.push(actual);
  }

  const declared = [...declaredBy.keys()].sort(compareGoStrings);
  const changed = new Map<string, Change>();
  for (const change of report.changes) {
    changed.set(change.path, change);
  }

  for (const path of declared) {
    const change = changed.get(path);
    const entry: ImpactEntry = {
      path,
      declared: true,
      changed: !!change,
      declaredBy: uniqueStrings(declaredBy.get(path) ?? []),
    };
    if (change && (change.status === 'added' || change.status === 'untracked')) {
      entry.created = true;
    }
    impact.declared.push(entry);
    if (!change) {
      const exists = pathExists(options.pathExists, path);
      const code = exists ? 'declared-document-not-changed' : 'declared-document-not-created';
      const message = exists
        ? `${path} is declared by the task but was not changed.`
        : `${path} is declared as a new document but was not created.`;
      impact.diagnostics.push({
        severity: 'warning',
        code,
        message,
        documentPath: path,
      });
    }
  }

  const declaredSet = new Set(declared);
  for (const entry of impact.actual) {
    if (!declaredSet.has(entry.path)) {
      const code = entry.created ? 'undeclared-document-created' : 'undeclared-document-change';
      impact.diagnostics.push({
        severity: 'warning',
        code,
        message: `${entry.path} changed but is not declared by the task.`,
        documentPath: entry.path,
      });
    }
    if (scope.length && !pathMatchesTaskScope(entry.path, scope, options.scopeMatch)) {
      impact.diagnostics.push({
        severity: 'warning',
        code: 'documentation-change-outside-task-scope',
        message: `${entry.path} is outside task scope.`,
        documentPath: entry.path,
      });
    }
  }

  if (!declared.length) {
    for (const change of report.changes) {
      if (change.classification === 'permanent-documentation') {
        impact.diagnostics.push({
          severity: 'warning',
          code: 'missing-documentation-impact-entry',
          message:
            'The task changes durable documentation without an explicit documentation impact entry.',
          documentPath: change.path,
        });
        break;
      }
    }
  }

  return impact;
}

export function declaredTaskDocumentation(
  analysis: MarkdownAnalysis,
  taskPath: string,
  docsRel: string,
): string[] {
  const impactSection = analysis.sections.find(
    (section) => section.heading.level === 2 && section.kind === 'documentation-impact',
  );
  if (!impactSection) {
    return [];
  }

  const links = analysis.links.filter((link) => {
    const line = link.range.start.line - 1;
    const start = impactSection.heading.range.start.line - 1;
    const end = impactSection.range.end.line - 1;
    return !link.image && line > start && line <= end;
  });
  const seen = new Set<string>();
  const paths: string[] = [];
  const add = (value: string, relativeToTask: boolean): void => {
    const candidate = normalizeTaskDocumentationPath(value, taskPath, docsRel, relativeToTask);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      paths.push(candidate);
    }
  };

  for (const match of impactSection.markdown.matchAll(documentationPathRE)) {
    const candidate = match[0];
    if (links.some((link) => link.destination.includes(candidate))) {
      continue;
    }
    add(candidate, candidate.startsWith('.'));
  }
  for (const link of links) {
    add(link.destination, true);
  }
  return paths.sort(compareGoStrings);
}

export function normalizeTaskDocumentationPath(
  value: string,
  taskPath: string,
  docsRel: string,
  relativeToTask: boolean,
): string {
  let normalized = trimGoSpace(value).replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.includes('://') ||
    normalized.startsWith('#') ||
    isAbsolutePath(normalized)
  ) {
    return '';
  }
  const pathPart = splitLinkPath(normalized);
  if (pathPart) {
    normalized = pathPart;
  }
  if (!normalized) {
    return '';
  }

  const docsPath = cleanPath(docsRel) || '.';
  let candidate: string;
  if (normalized === docsRel || normalized.startsWith(`${docsRel.replace(/\/+$/u, '')}/`)) {
    candidate = normalized;
  } else if (relativeToTask || normalized.startsWith('./') || normalized.startsWith('../')) {
    candidate = joinPath(dirname(taskPath), normalized);
  } else {
    candidate = joinPath(docsRel, normalized);
  }
  candidate = cleanPath(candidate);
  if (!candidate) {
    return '';
  }
  if (docsPath !== '.' && candidate !== docsPath && !candidate.startsWith(`${docsPath}/`)) {
    return '';
  }
  return candidate;
}

export function taskScopePaths(analysis: MarkdownAnalysis): string[] {
  const values: string[] = [];
  for (const section of analysis.sections) {
    if (section.heading.level !== 2 || section.kind !== 'scope') {
      continue;
    }
    for (const line of section.markdown.split('\n')) {
      const start = line.indexOf('`');
      if (start < 0) {
        continue;
      }
      const end = line.indexOf('`', start + 1);
      if (end < 0) {
        continue;
      }
      const value = trimGoSpace(line.slice(start + 1, end)).replaceAll('\\', '/');
      if (value) {
        values.push(value);
      }
    }
  }
  return values;
}

export function pathMatchesTaskScope(
  path: string,
  scope: readonly string[],
  scopeMatch: (pattern: string, path: string) => boolean,
): boolean {
  for (const item of scope) {
    if (item === '.' || item === './') {
      return true;
    }
    if (item.endsWith('/') && path.startsWith(item)) {
      return true;
    }
    if (item === path || scopeMatch(item, path)) {
      return true;
    }
  }
  return false;
}

function pathExists(
  source: ((path: string) => boolean) | ReadonlySet<string>,
  path: string,
): boolean {
  return typeof source === 'function' ? source(path) : source.has(path);
}

function uniqueStrings(values: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function trimGoSpace(value: string): string {
  return value.replace(trimUnicodeWhiteSpace, '');
}

function splitLinkPath(value: string): string {
  let path = value;
  const hashIndex = path.indexOf('#');
  if (hashIndex >= 0) {
    path = path.slice(0, hashIndex);
  }
  const queryIndex = path.indexOf('?');
  if (queryIndex >= 0) {
    path = path.slice(0, queryIndex);
  }
  return path;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:\//u.test(value);
}

function dirname(path: string): string {
  const normalized = path.replaceAll('\\', '/');
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? '' : normalized.slice(0, slash);
}

function joinPath(base: string, value: string): string {
  return base ? `${base}/${value}` : value;
}

function cleanPath(value: string): string {
  const output: string[] = [];
  for (const part of value.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      if (!output.length) {
        return '';
      }
      output.pop();
      continue;
    }
    output.push(part);
  }
  return output.join('/');
}

function compareGoStrings(left: string, right: string): number {
  const leftBytes = utf8.encode(left);
  const rightBytes = utf8.encode(right);
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index++) {
    const leftByte = leftBytes[index] ?? 0;
    const rightByte = rightBytes[index] ?? 0;
    if (leftByte !== rightByte) {
      return leftByte - rightByte;
    }
  }
  return leftBytes.length - rightBytes.length;
}

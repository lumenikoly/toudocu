import { ToudocuError, type Issue } from '@toudocu/contracts';
import type { CompiledProject } from '../knowledge/compile.js';
import { workItemSections, type WorkItem } from './work-items.js';

export type DocumentationPathStatus = (
  value: string,
  document: string,
) => 'found' | 'missing' | 'outside' | 'absolute';

export function findWorkItem(project: CompiledProject, id: string): WorkItem {
  const matches = project.knowledge.workItems.filter((item) => item.id === id);
  if (matches.length !== 1)
    throw new ToudocuError(
      'task-selection-failed',
      matches.length ? `task identifier ${id} is ambiguous` : `task ${id} not found`,
    );
  return matches[0]!;
}

export function taskRelatedDocumentPaths(project: CompiledProject, item: WorkItem): Set<string> {
  const paths = new Set([item.document, ...item.documentationPaths]);
  const ids = new Set([
    item.moduleId,
    item.useCaseId,
    item.flowId,
    ...item.standardIds,
    ...item.runbookIds,
    ...item.screenIds,
    ...item.transitionIds,
    ...item.verification.flatMap((check) => check.transitions),
  ]);
  const k = project.knowledge;
  for (const entity of [
    ...k.modules,
    ...k.useCases,
    ...k.flows,
    ...k.standards,
    ...k.runbooks,
    ...k.screens,
    ...k.transitions,
  ]) {
    if (ids.has(entity.id)) paths.add(entity.document);
  }
  return paths;
}

export function readinessIssue(
  project: CompiledProject,
  item: WorkItem,
  code: string,
  message: string,
): Issue {
  const line = project.index.byPath
    .get(item.document)
    ?.headings.find((heading) => heading.id === item.anchor)?.range.start.line;
  return {
    severity: 'error',
    code,
    message,
    documentPath: item.document,
    ...(line ? { line } : {}),
  };
}

/** Task-local gate, including the full Ready contract even for a Draft. Never executes checks. */
export function taskReadiness(
  project: CompiledProject,
  id: string,
  pathStatus: DocumentationPathStatus,
): { item?: WorkItem; issues: Issue[] } {
  let item: WorkItem;
  try {
    item = findWorkItem(project, id);
  } catch (error) {
    return {
      issues: [
        { severity: 'error', code: 'task-selection-failed', message: (error as Error).message },
      ],
    };
  }
  const paths = taskRelatedDocumentPaths(project, item);
  const issues = project.issues.filter(
    (issue) =>
      (paths.has(issue.documentPath ?? '') || issue.taskId === id || issue.relatedId === id) &&
      (issue.severity === 'error' || issue.severity === 'warning'),
  );
  const add = (code: string, message: string) =>
    issues.push(readinessIssue(project, item, code, message));
  const required = [
    [item.repositoryPaths.join(' '), 'missing-task-scope', 'Scope'],
    [item.outOfScope, 'missing-task-out-of-scope', 'Out of scope'],
    [item.plan, 'missing-task-plan', 'Plan'],
    [item.documentationImpact, 'missing-task-documentation-impact', 'Documentation impact'],
    ...(item.type === 'bug' ? [] : [[item.result, 'missing-task-result', 'Result']]),
  ];
  for (const [value, code, label] of required)
    if (!value?.trim()) add(code!, `Required task field is empty: ${label}.`);
  if (!item.moduleId.trim())
    add('missing-task-module', 'A task ready for work requires a linked module.');
  const document = project.index.byPath.get(item.document);
  const sections = document ? workItemSections(document, id) : new Map();
  if (item.type === 'feature') {
    if (!item.behaviorChange.trim() || !item.before || !item.after)
      add(
        'missing-behavior-change',
        'A Feature requires Behavior change, Before, and After content.',
      );
    if (!item.useCaseId) add('missing-task-use-case', 'A Feature requires a linked use case.');
  } else if (item.type === 'bug') {
    if (!item.useCaseId && document?.metadata.useCase !== 'not-applicable')
      add(
        'missing-task-use-case',
        'A Bug requires a linked use case or a valid not-applicable explanation.',
      );
  } else if (
    item.type &&
    !item.useCaseId &&
    !sections.get('use-case-omission-reason')?.text.trim()
  ) {
    add(
      'missing-use-case-omission-reason',
      'A technical task without a use case requires a use-case omission reason.',
    );
  }
  if (!item.criteria.length)
    add('missing-acceptance-criterion', 'At least one AC-* criterion is required.');
  const count = (target: string) => item.checks.filter((check) => check.target === target).length;
  for (const criterion of item.verification)
    if (count(criterion.criterionId) < 1 || !criterion.commands.length)
      add(
        'invalid-criterion-verification',
        `Criterion ${criterion.criterionId} requires an executable verification mapping.`,
      );
  const k = project.knowledge;
  const references: [string, string[], readonly { id: string }[]][] = [
    ['module', [item.moduleId], k.modules],
    ['use-case', [item.useCaseId], k.useCases],
    ['flow', [item.flowId], k.flows],
    ['screen', item.screenIds, k.screens],
    ['transition', item.transitionIds, k.transitions],
    ['standard', item.standardIds, k.standards],
    ['runbook', item.runbookIds, k.runbooks],
    ['transition', item.verification.flatMap((check) => check.transitions), k.transitions],
  ];
  for (const [kind, ids, entities] of references)
    for (const ref of ids)
      if (ref && !entities.some((entity) => entity.id === ref))
        add(`missing-task-${kind}`, `Linked entity not found: ${ref}.`);
  const impact = sections.get('documentation-impact');
  if (document && impact) {
    const values: string[] = [];
    for (const match of impact.markdown.matchAll(/`+([^`\n]+?)`+/gu)) {
      const value = match[1]!.trim();
      if (!/\s/u.test(value) && (value.includes('/') || /\.md$/iu.test(value))) values.push(value);
    }
    for (const link of document.links)
      if (
        !link.image &&
        link.range.start.line > impact.heading.range.start.line &&
        link.range.start.line <= impact.range.end.line
      )
        values.push(link.destination.split('#')[0]!);
    for (const value of new Set(values)) {
      if (!value || value.includes('://') || value.startsWith('#')) continue;
      const status = pathStatus(value, item.document);
      if (status === 'absolute')
        add(
          'unsafe-documentation-impact-path',
          `Documentation-impact path must be relative: ${value}.`,
        );
      else if (status === 'outside')
        add(
          'unsafe-documentation-impact-path',
          `Documentation-impact path escapes the repository root: ${value}.`,
        );
      else if (status === 'missing')
        add(
          'missing-documentation-impact-path',
          `Declared documentation-impact path does not exist: ${value}.`,
        );
    }
  }
  const seen = new Set<string>();
  return {
    item,
    issues: issues.filter((issue) => {
      const key = `${issue.code}|${issue.message}|${issue.documentPath ?? ''}|${issue.line ?? 0}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

export function blockingReadinessIssues(issues: readonly Issue[], strict: boolean): Issue[] {
  return issues.filter(
    (issue) => issue.severity === 'error' || (strict && issue.severity === 'warning'),
  );
}

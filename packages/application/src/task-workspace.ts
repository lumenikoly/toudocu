import {
  findWorkItem,
  taskReadiness,
  blockingReadinessIssues,
  type CompiledProject,
  type DocumentationPathStatus,
  type WorkItem,
} from '@toudocu/core';
import {
  TaskCandidatesReportV1Schema,
  TaskTreeReportV1Schema,
  ToudocuError,
  type TaskContextReportV1,
  type TaskCandidatesReportV1,
  type TaskTreeReportV1,
} from '@toudocu/contracts';

type ReadOptions = { version: string; strict: boolean; pathStatus: DocumentationPathStatus };

function workspace(project: CompiledProject, options: ReadOptions) {
  const byID = new Map(project.knowledge.workItems.map((item) => [item.id, item]));
  const status = (item: WorkItem) => project.index.byPath.get(item.document)?.metadata.status ?? '';
  const readiness = (item: WorkItem) => {
    const { issues } = taskReadiness(project, item.id, options.pathStatus);
    const blockedBy = item.dependsOn.flatMap((id) => {
      const dependency = byID.get(id);
      const state = dependency ? status(dependency) : 'unknown';
      return state === 'done' ? [] : [{ id, status: state }];
    });
    return {
      issues,
      contractComplete: !blockingReadinessIssues(issues, options.strict).length,
      blockedBy: blockedBy.length ? blockedBy : null,
      dependenciesSatisfied: !blockedBy.length,
    };
  };
  const cached = new Map<string, ReturnType<typeof readiness>>();
  const ready = (item: WorkItem) => {
    let result = cached.get(item.id);
    if (!result) {
      result = readiness(item);
      cached.set(item.id, result);
    }
    return result;
  };
  const state = (item: WorkItem): string => {
    const value = status(item);
    if (value === 'draft') return ready(item).contractComplete ? 'ready_candidate' : 'draft';
    if (value === 'ready')
      return !ready(item).contractComplete
        ? 'needs_attention'
        : ready(item).dependenciesSatisfied
          ? 'ready'
          : 'waiting';
    return value === 'in-progress' ? 'in_progress' : value;
  };
  const descendants = (item: WorkItem) => {
    const counts = {
      draft: 0,
      readyCandidate: 0,
      ready: 0,
      waiting: 0,
      needsAttention: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      cancelled: 0,
    };
    const visited = new Set<string>();
    let started = false;
    const visit = (current: WorkItem) => {
      for (const id of current.childIds) {
        const child = byID.get(id);
        if (!child || visited.has(id)) continue;
        visited.add(id);
        const value = state(child);
        const key = value.replace(/_([a-z])/gu, (_, char: string) => char.toUpperCase());
        if (Object.hasOwn(counts, key)) counts[key as keyof typeof counts]++;
        if (['in_progress', 'blocked', 'done'].includes(value)) started = true;
        visit(child);
      }
    };
    visit(item);
    return {
      total: visited.size,
      counts,
      started,
      complete: visited.size > 0 && counts.done === visited.size,
    };
  };
  return { byID, status, ready, state, descendants };
}

export function buildTaskHierarchy(
  project: CompiledProject,
  item: WorkItem,
  options: ReadOptions,
): TaskContextReportV1['hierarchy'] {
  const graph = workspace(project, options);
  const ref = (current: WorkItem) => ({
    id: current.id,
    title: current.title,
    status: graph.status(current),
    workState: graph.state(current),
    hasBlocker: Boolean(current.blocker.trim()),
  });
  const parent = graph.byID.get(item.parentId ?? '');
  const ancestors: ReturnType<typeof ref>[] = [];
  const seen = new Set<string>();
  for (let current = parent; current && !seen.has(current.id);) {
    seen.add(current.id);
    ancestors.unshift(ref(current));
    current = graph.byID.get(current.parentId ?? '');
  }
  return {
    parent: parent ? ref(parent) : null,
    ancestors,
    children: item.childIds.flatMap((id) => {
      const child = graph.byID.get(id);
      return child ? [ref(child)] : [];
    }),
    descendants: graph.descendants(item),
  };
}

export function buildTaskCandidates(
  project: CompiledProject,
  parentID: string,
  options: ReadOptions,
): TaskCandidatesReportV1 {
  const graph = workspace(project, options);
  const allowed = new Set<string>();
  if (parentID) {
    const parent = findWorkItem(project, parentID);
    if (!parent.id.startsWith('TASK-'))
      throw new ToudocuError(
        'invalid-task-parent',
        'task candidates --parent requires a TASK-* work item',
      );
    const visit = (item: WorkItem) => {
      for (const id of item.childIds) {
        const child = graph.byID.get(id);
        if (child && !allowed.has(id)) {
          allowed.add(id);
          visit(child);
        }
      }
    };
    visit(parent);
  }
  return TaskCandidatesReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-candidates',
    generator: { name: 'Toudocu', version: options.version },
    ...(parentID ? { parentTaskId: parentID } : {}),
    candidates: project.knowledge.workItems
      .filter(
        (item) =>
          !item.archived &&
          ['draft', 'ready'].includes(graph.status(item)) &&
          (!parentID || allowed.has(item.id)),
      )
      .map((item) => ({
        id: item.id,
        title: item.title,
        status: graph.status(item),
        workState: graph.state(item),
        ...(item.childIds.length ? { descendants: graph.descendants(item) } : {}),
        ...(item.priority ? { priority: item.priority } : {}),
        ...(item.parentId ? { parentId: item.parentId } : {}),
        ...graph.ready(item),
        readyForWork:
          graph.status(item) === 'ready' &&
          graph.ready(item).contractComplete &&
          graph.ready(item).dependenciesSatisfied,
      })),
  });
}

export function buildTaskTree(
  project: CompiledProject,
  id: string,
  options: ReadOptions,
): TaskTreeReportV1 {
  const item = findWorkItem(project, id);
  if (!item.id.startsWith('TASK-'))
    throw new ToudocuError(
      'invalid-task-tree',
      'task tree is available only for TASK-* work items',
    );
  const graph = workspace(project, options),
    seen = new Set<string>();
  const node = (current: WorkItem): TaskTreeReportV1['tree'] => {
    const result: TaskTreeReportV1['tree'] = {
      id: current.id,
      status: graph.status(current),
      workState: graph.state(current),
      title: current.title,
      children: [],
    };
    if (seen.has(current.id)) return result;
    seen.add(current.id);
    for (const childID of current.childIds) {
      const child = graph.byID.get(childID);
      if (child) result.children.push(node(child));
    }
    if (current.childIds.length) result.descendants = graph.descendants(current);
    return result;
  };
  return TaskTreeReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-tree',
    generator: { name: 'Toudocu', version: options.version },
    taskId: id,
    tree: node(item),
  });
}

export function formatTaskCandidatesText(report: TaskCandidatesReportV1): string {
  if (!report.candidates.length) return 'No task candidates.\n';
  return report.candidates
    .map((candidate) => {
      const conditions = [`status=${candidate.status}`];
      if (!candidate.contractComplete) conditions.push('contract incomplete');
      if (candidate.status === 'draft') conditions.push('change status to Ready');
      if (!candidate.dependenciesSatisfied)
        conditions.push(
          `depends on ${candidate.blockedBy?.map((item) => item.id).join(', ') ?? ''}`,
        );
      if (candidate.readyForWork) conditions.push('executable');
      if (candidate.descendants)
        conditions.push(
          `${candidate.descendants.started ? 'branch started; ' : ''}descendants ${candidate.descendants.counts.done}/${candidate.descendants.total} done`,
        );
      return `${candidate.id.padEnd(16)} ${candidate.workState.replaceAll('_', ' ').toUpperCase().padEnd(8)} ${(candidate.priority || '-').padEnd(7)} ${conditions.join('; ')}\n`;
    })
    .join('');
}

export function formatTaskTreeText(report: TaskTreeReportV1): string {
  let output = '';
  const visit = (node: TaskTreeReportV1['tree'], prefix: string, last: boolean, root: boolean) => {
    const branch = root ? '' : last ? '└── ' : '├── ';
    const summary = node.descendants
      ? `${node.descendants.started ? ' · branch started' : ''} · ${node.descendants.counts.done}/${node.descendants.total} done`
      : '';
    output += `${prefix}${branch}${node.id}  ${node.workState.replaceAll('_', ' ').padEnd(16)}  ${node.title}${summary}\n`;
    const next = prefix + (root ? '' : last ? '    ' : '│   ');
    node.children.forEach((child, index) =>
      visit(child, next, index === node.children.length - 1, false),
    );
  };
  visit(report.tree, '', true, true);
  return output;
}

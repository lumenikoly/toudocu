import {
  findWorkItem,
  buildTaskWorkspace as workspace,
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

import type { CompiledProject } from '../knowledge/compile.js';
import {
  blockingReadinessIssues,
  taskReadiness,
  type DocumentationPathStatus,
} from './readiness.js';
import type { WorkItem } from './work-items.js';

export function buildTaskWorkspace(
  project: CompiledProject,
  options: { strict: boolean; pathStatus: DocumentationPathStatus },
) {
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

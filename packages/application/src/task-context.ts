import {
  findWorkItem,
  naturalCompare,
  taskReadiness,
  type CompiledProject,
  type Document,
  type DocumentationPathStatus,
} from '@toudocu/core';
import {
  TaskContextReportV1Schema,
  ToudocuError,
  type TaskContextReportV1,
} from '@toudocu/contracts';
import { projectKnowledge, projectScreens, projectTransitions } from './report.js';
import { buildTaskHierarchy } from './task-workspace.js';

function contextDocument(
  document: Document,
  external = false,
): TaskContextReportV1['documents'][number] {
  const full =
    external ||
    ['work', 'contract', 'guide', 'reference', 'document', 'flow', 'screen'].includes(
      document.type,
    );
  const kinds: Record<string, string[]> = {
    module: ['business-rules', 'invariants', 'stable-interfaces'],
    'use-case': ['main-scenario', 'postconditions', 'business-rules'],
    standard: ['rules', 'automated-checks'],
    runbook: ['prerequisites', 'procedure', 'verification', 'rollback', 'stop-conditions'],
  };
  return {
    ...(!external && document.metadata.id ? { id: document.metadata.id } : {}),
    path: document.sourcePath,
    type: external ? 'document' : document.type,
    title: document.title,
    description: document.description,
    status: document.status,
    sections: full
      ? [{ title: document.title, markdown: document.content }]
      : document.sections
          .filter(
            (section) =>
              section.heading.level === 2 && kinds[document.type]?.includes(section.kind),
          )
          .map((section) => ({ title: section.heading.title, markdown: section.markdown })),
  };
}

/** Bounded task-local context: related contracts, not full contents of dependency trees. */
export function buildTaskContext(
  project: CompiledProject,
  id: string,
  options: {
    version: string;
    strict: boolean;
    pathStatus: DocumentationPathStatus;
    externalDocuments: ReadonlyMap<string, Document>;
  },
): TaskContextReportV1 {
  const item = findWorkItem(project, id);
  const status = project.index.byPath.get(item.document)?.metadata.status ?? '';
  if (!['ready', 'in-progress', 'blocked', 'done'].includes(status))
    throw new ToudocuError(
      'invalid-task-context-state',
      'task context is available only for Ready, In Progress, Blocked, or Done tasks',
    );
  const knowledge = projectKnowledge(project);
  const task = knowledge.workItems!.find((candidate) => candidate.id === id)!;
  const module = knowledge.modules!.find((candidate) => candidate.id === item.moduleId);
  const useCase = knowledge.useCases!.find((candidate) => candidate.id === item.useCaseId);
  const flow = knowledge.flows!.find((candidate) => candidate.id === item.flowId);
  const ruleIDs = new Set([
    ...(module?.businessRuleIds ?? []),
    ...(useCase?.businessRuleIds ?? []),
  ]);
  const businessRules = knowledge
    .businessRules!.filter((rule) => ruleIDs.has(rule.id))
    .sort((a, b) => naturalCompare(a.id, b.id));
  const paths = new Set([item.document, ...item.documentationPaths]);
  for (const entity of [module, useCase, flow, ...businessRules])
    if (entity) paths.add(entity.document);
  const allScreens = projectScreens(project);
  const screens: TaskContextReportV1['screens'] = [];
  for (const screenID of item.screenIds) {
    const original = project.knowledge.screens.find((candidate) => candidate.id === screenID);
    const projected = allScreens.find((candidate) => candidate.id === screenID);
    if (!original || !projected) continue;
    screens.push({
      ...projected,
      status: original.status,
      reachable: original.reachable,
      line: original.line,
    });
    if (original.document) paths.add(original.document);
  }
  const screenTransitions = (projectTransitions(project) ?? []).filter(
    (transition) =>
      item.transitionIds.includes(transition.id) ||
      item.screenIds.includes(transition.source) ||
      item.screenIds.includes(transition.target),
  );
  for (const transition of screenTransitions)
    if (transition.document) paths.add(transition.document);
  const standards = knowledge.standards!.filter((standard) =>
    item.standardIds.includes(standard.id),
  );
  const runbooks = knowledge.runbooks!.filter((runbook) => item.runbookIds.includes(runbook.id));
  for (const entity of [...standards, ...runbooks]) paths.add(entity.document);
  const documents = project.index.documents
    .filter((document) => paths.has(document.sourcePath))
    .map((document) => contextDocument(document));
  for (const path of item.documentationPaths) {
    if (project.index.byPath.has(path)) continue;
    const external = options.externalDocuments.get(path);
    if (external) documents.push(contextDocument(external, true));
  }
  const targets = new Set(item.checks.map((check) => check.target));
  const byID = (a: { id: string }, b: { id: string }) => naturalCompare(a.id, b.id);
  return TaskContextReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-context',
    generator: { name: 'Toudocu', version: options.version },
    task,
    hierarchy: buildTaskHierarchy(project, item, options),
    fullVerification:
      targets.has('ALL') &&
      targets.has('DOCS') &&
      (!item.standardIds.length || targets.has('QUALITY')),
    ...(module ? { module } : {}),
    ...(useCase ? { useCase } : {}),
    ...(flow ? { flow } : {}),
    standards,
    runbooks,
    screens,
    screenTransitions,
    businessRules,
    dependencies: knowledge
      .workItems!.filter((candidate) => item.dependsOn.includes(candidate.id))
      .sort(byID),
    dependents: knowledge
      .workItems!.filter((candidate) => candidate.dependsOn.includes(id))
      .sort(byID),
    documents,
    issues: taskReadiness(project, id, options.pathStatus).issues,
    requiredReads: documents
      .map((document) => document.path)
      .sort((a, b) => (a === item.document ? -1 : b === item.document ? 1 : naturalCompare(a, b))),
  });
}

export function formatTaskContextText(report: TaskContextReportV1): string {
  const task = report.task,
    hierarchy = report.hierarchy;
  let output = `Task: ${task.id} — ${task.title}\nDocument: ${task.document}\nStatus: ${task.status.label}\n`;
  if (report.module) output += `Module: ${report.module.id} — ${report.module.title}\n`;
  if (report.useCase) output += `Use case: ${report.useCase.id} — ${report.useCase.title}\n`;
  if (task.flowId) output += `Flow: ${task.flowId}\n`;
  if (
    hierarchy.parent ||
    hierarchy.ancestors.length ||
    hierarchy.children.length ||
    hierarchy.descendants.total
  ) {
    const ref = (value: NonNullable<typeof hierarchy.parent>) =>
      `${value.id} — ${value.title} [${value.status}; blocker: ${value.hasBlocker ? 'yes' : 'no'}]`;
    if (hierarchy.ancestors.length)
      output += `Ancestors: ${hierarchy.ancestors.map(ref).join(' / ')}\n`;
    if (hierarchy.parent) output += `Parent task: ${ref(hierarchy.parent)}\n`;
    if (hierarchy.children.length)
      output += `Child tasks:\n${hierarchy.children.map((child) => `- ${ref(child)}\n`).join('')}`;
    const summary = hierarchy.descendants;
    const labels: Record<string, string> = {
      draft: 'draft',
      readyCandidate: 'ready candidate',
      ready: 'ready',
      waiting: 'waiting',
      needsAttention: 'needs attention',
      inProgress: 'in progress',
      blocked: 'blocked',
      done: 'done',
      cancelled: 'cancelled',
    };
    const statuses = Object.entries(summary.counts).flatMap(([key, count]) =>
      count > 0 ? [`${labels[key]}: ${count}`] : [],
    );
    output += `Descendants: total ${summary.total}${statuses.length ? '; ' + statuses.join('; ') : ''}; started: ${summary.started}; complete: ${summary.complete}\n`;
  }
  if (task.screenIds.length) output += `Screens: ${task.screenIds.join(', ')}\n`;
  if (task.repositoryPaths.length) output += `Scope: ${task.repositoryPaths.join(', ')}\n`;
  output += `Criteria: ${task.criteria.length}\nChecks: ${task.checks.length}\nDependencies: ${report.dependencies.length}\nDependents: ${report.dependents.length}\nContext issues: ${report.issues.length}\nRequired documents: ${report.requiredReads.join(', ')}\n`;
  return output;
}

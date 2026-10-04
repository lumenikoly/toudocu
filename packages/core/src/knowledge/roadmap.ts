import type { Issue } from '@toudocu/contracts';
import {
  statusFor,
  type Document,
  type DocumentStatus,
  type TaskStats,
} from '../documents/document.js';
import { uniqueStrings, useCaseReadiness } from './entities.js';

export interface RoadmapItem {
  id: string;
  text: string;
  kind: string;
  declaredCompleted: boolean;
  effectiveCompleted: boolean;
  completionSource: string;
  document: string;
  line: number;
  targetDocument?: string;
  targetStatus?: DocumentStatus;
}
export interface RoadmapStage {
  title: string;
  status: DocumentStatus;
  plannedDate: string;
  taskStats: TaskStats;
  items: RoadmapItem[];
  document: string;
  anchor: string;
  text: string;
}
export interface Risk {
  id: string;
  title: string;
  fullTitle: string;
  status: DocumentStatus;
  probability: string;
  impact: string;
  taskStats: TaskStats;
  document: string;
  anchor: string;
  text: string;
}
export function taskStats(total: number, completed: number): TaskStats {
  return {
    total,
    completed,
    remaining: total - completed,
    percent: total ? Math.round((completed / total) * 100) : null,
  };
}
function roadmapId(text: string): string {
  const ids = uniqueStrings(
    text.toUpperCase().match(/\b(?:UC|CON|CONTRACT|DLV|DELIVERABLE)-[A-Z0-9-]+\b/g) ?? [],
  );
  return ids.length === 1 ? (ids[0] ?? '') : '';
}
/** Completion is derived from linked use cases, never silently from a stale checkbox. */
export function compileRoadmap(documents: readonly Document[]): {
  stages: RoadmapStage[];
  risks: Risk[];
  issues: Issue[];
} {
  const stages: RoadmapStage[] = [],
    risks: Risk[] = [],
    issues: Issue[] = [];
  const byId = new Map(
    documents
      .filter((document) => document.metadata.id)
      .map((document) => [document.metadata.id, document]),
  );
  const report = (document: Document, code: string, message: string, line: number): void => {
    issues.push({ severity: 'error', code, message, documentPath: document.sourcePath, line });
  };
  for (const document of documents) {
    if (document.sourcePath === 'status.md')
      for (const task of document.tasks)
        report(
          document,
          'status-requirement-checklist',
          'status.md must not contain its own requirements checklist; link to the roadmap or a work item instead.',
          task.range.start.line,
        );
    if (document.sourcePath === 'roadmap.md') {
      const deliverables = new Map<string, number>();
      for (const task of document.tasks) {
        const id = roadmapId(task.text),
          line = task.range.start.line;
        if (!id)
          report(
            document,
            'invalid-roadmap-item-id',
            'Every roadmap item must contain exactly one stable use-case, contract, or deliverable ID.',
            line,
          );
        else if (id.startsWith('DLV-') || id.startsWith('DELIVERABLE-')) {
          const previous = deliverables.get(id);
          if (previous)
            report(
              document,
              'duplicate-roadmap-id',
              `Deliverable ${id} is already declared on line ${previous}.`,
              line,
            );
          else deliverables.set(id, line);
        } else {
          const target = byId.get(id);
          if (!target || !['use-case', 'contract'].includes(target.type))
            report(
              document,
              'dangling-roadmap-reference',
              `The roadmap references unknown use case or contract ${id}.`,
              line,
            );
        }
      }
    }
    for (const section of document.sections) {
      const metadata = Object.fromEntries(section.metadata.map((item) => [item.key, item.value]));
      if (document.type === 'risks' && section.kind === 'risk') {
        const match = /^([A-Za-zА-Яа-я]+[-_ ]?\d+)\s*[:—-]\s*(.+)$/.exec(section.heading.title);
        risks.push({
          id: match?.[1] ?? section.heading.title,
          title: match?.[2] ?? section.heading.title,
          fullTitle: section.heading.title,
          status: statusFor(metadata.status ?? ''),
          probability: metadata.probability ?? '',
          impact: metadata.impact ?? '',
          taskStats: taskStats(
            section.tasks.length,
            section.tasks.filter((task) => task.completed).length,
          ),
          document: document.sourcePath,
          anchor: section.heading.id,
          text: section.text,
        });
      }
      if (document.type !== 'roadmap' || section.kind !== 'roadmap-stage') continue;
      const items = section.tasks.map((task) => {
        const id = roadmapId(task.text),
          target = byId.get(id);
        const item: RoadmapItem = {
          id,
          text: task.text,
          kind: id.startsWith('UC-')
            ? 'use-case'
            : /^(CON|CONTRACT)-/.test(id)
              ? 'contract'
              : /^(DLV|DELIVERABLE)-/.test(id)
                ? 'deliverable'
                : 'unknown',
          declaredCompleted: task.completed,
          effectiveCompleted: task.completed,
          completionSource: 'roadmap-checkbox',
          document: document.sourcePath,
          line: task.range.start.line,
        };
        if (target) {
          item.targetDocument = target.sourcePath;
          item.targetStatus = target.status;
        }
        if (target?.type === 'use-case') {
          const readiness = useCaseReadiness(target);
          item.effectiveCompleted = readiness.effectiveCompleted;
          item.completionSource = 'use-case-status';
          if (item.declaredCompleted !== item.effectiveCompleted) {
            const reason = !readiness.statusDone
              ? 'the use-case status is not done'
              : !readiness.acceptance.total
                ? 'acceptance criteria are missing'
                : readiness.acceptance.remaining
                  ? 'open acceptance criteria remain'
                  : 'the use case is ready';
            report(
              document,
              'roadmap-item-completion-mismatch',
              `Roadmap item ${id} completion does not match the linked use case: ${reason}.`,
              item.line,
            );
          }
        }
        return item;
      });
      const stage: RoadmapStage = {
        title: section.heading.title,
        status: statusFor(metadata.status ?? ''),
        plannedDate: metadata.plannedDate ?? '',
        taskStats: taskStats(items.length, items.filter((item) => item.effectiveCompleted).length),
        items,
        document: document.sourcePath,
        anchor: section.heading.id,
        text: section.text,
      };
      stages.push(stage);
      if (stage.status.kind === 'done' && stage.taskStats.remaining)
        report(
          document,
          'roadmap-section-status-mismatch',
          `Done roadmap section ${stage.title} contains incomplete items.`,
          section.heading.range.start.line,
        );
    }
    if (document.type === 'roadmap') {
      const own = stages.filter((stage) => stage.document === document.sourcePath);
      document.taskStats = taskStats(
        own.reduce((sum, stage) => sum + stage.taskStats.total, 0),
        own.reduce((sum, stage) => sum + stage.taskStats.completed, 0),
      );
    }
  }
  return { stages, risks, issues };
}

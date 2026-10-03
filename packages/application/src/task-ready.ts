import {
  taskReadiness,
  readinessIssue,
  blockingReadinessIssues,
  type CompiledProject,
  type DocumentationPathStatus,
} from '@toudocu/core';
import { TaskReadyReportV1Schema, type TaskReadyReportV1 } from '@toudocu/contracts';

export function buildTaskReady(
  project: CompiledProject,
  id: string,
  options: { version: string; strict: boolean; pathStatus: DocumentationPathStatus },
): TaskReadyReportV1 {
  const { item, issues } = taskReadiness(project, id, options.pathStatus);
  let status = 'contract_incomplete',
    contractComplete = false,
    readyForWork = false;
  if (item) {
    const state = project.index.byPath.get(item.document)?.metadata.status ?? '';
    if (state === 'draft' || state === 'ready') {
      if (blockingReadinessIssues(issues, options.strict).length === 0) {
        status = state === 'draft' ? 'contract_ready' : 'ready';
        contractComplete = true;
        readyForWork = state === 'ready';
      }
    } else {
      status = 'invalid_state';
      issues.push(
        readinessIssue(
          project,
          item,
          'invalid-task-ready-state',
          'task ready is allowed only for Draft or Ready tasks.',
        ),
      );
    }
  }
  return TaskReadyReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-ready',
    generator: { name: 'Toudocu', version: options.version },
    task: item
      ? {
          id: item.id,
          title: item.title,
          status: item.status,
          ...(item.type ? { type: item.type } : {}),
          document: item.document,
        }
      : {
          id,
          title: '',
          status: { kind: '', symbol: '', label: '', recognized: false },
          document: '',
        },
    status,
    contractComplete,
    readyForWork,
    issues,
  });
}

export function formatTaskReadyText(report: TaskReadyReportV1): string {
  return (
    `Task: ${report.task.id}\nReadiness status: ${report.status}\nContract complete: ${report.contractComplete}\nReady for work: ${report.readyForWork}\n` +
    report.issues
      .map((issue) => `[${issue.severity.toUpperCase()}] ${issue.code} — ${issue.message}\n`)
      .join('')
  );
}

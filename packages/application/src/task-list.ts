import type { CompiledProject, DocumentationPathStatus } from '@toudocu/core';
import { TaskListReportV1Schema, type TaskListReportV1 } from '@toudocu/contracts';
import { projectKnowledge } from './report.js';
import { buildTaskReady } from './task-ready.js';

export function buildTaskList(
  project: CompiledProject,
  options: { version: string; strict: boolean; pathStatus: DocumentationPathStatus },
): TaskListReportV1 {
  const knowledge = projectKnowledge(project);
  return TaskListReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-list',
    generator: { name: 'Toudocu', version: options.version },
    tasks: (knowledge.workItems ?? [])
      .filter((task) => !task.archived)
      .map((task) => {
        const document = project.index.byPath.get(task.document);
        const status = document?.metadata.status ?? '';
        return {
          task,
          markdown: document?.content ?? '',
          ready:
            status === 'draft' || status === 'ready'
              ? buildTaskReady(project, task.id, options)
              : null,
        };
      }),
  });
}

export function formatTaskListText(report: TaskListReportV1): string {
  if (!report.tasks.length) return 'No tasks.\n';
  return report.tasks
    .map(({ task }) => `${task.id.padEnd(16)} ${task.status.label.padEnd(12)} ${task.title}\n`)
    .join('');
}

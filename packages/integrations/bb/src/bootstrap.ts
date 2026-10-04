import type { TaskContextReportV1, TaskReadyReportV1 } from '@toudocu/contracts';

export function bootstrap(context: TaskContextReportV1, ready: TaskReadyReportV1): string {
  return [
    `$toudocu-bb implement ${context.task.id}`,
    `Goal: ${context.task.title.slice(0, 300)}`,
    `Status: ${ready.readyForWork ? 'Ready' : ready.status}`,
    `Relevant context: ${context.requiredReads.slice(0, 6).join(', ').slice(0, 700)}`,
    'Use the toudocu-bb skill. Start with toudocu_task_context and toudocu_task_ready. Fetch further context when needed.',
  ].join('\n');
}

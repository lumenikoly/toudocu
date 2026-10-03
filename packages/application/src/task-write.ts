import {
  ScaffoldReportV1Schema,
  TaskInitReportV1Schema,
  type ScaffoldReportV1,
  type TaskInitReportV1,
} from '@toudocu/contracts';

export function buildTaskInitReport(
  render: {
    id: string;
    title: string;
    type: string;
    language: string;
    path: string;
    parentID: string | null;
  },
  version: string,
): TaskInitReportV1 {
  return TaskInitReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'task-init',
    generator: { name: 'Toudocu', version },
    id: render.id,
    title: render.title,
    type: render.type,
    language: render.language,
    path: render.path,
    parentId: render.parentID,
  });
}

export function buildScaffoldReport(
  render: {
    entityType: string;
    id: string;
    title: string;
    language: string;
    path: string;
  },
  version: string,
): ScaffoldReportV1 {
  return ScaffoldReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'scaffold',
    generator: { name: 'Toudocu', version },
    entityType: render.entityType,
    id: render.id,
    title: render.title,
    language: render.language,
    path: render.path,
  });
}

export function formatTaskInitText(report: TaskInitReportV1): string {
  return `Created task ${report.id}: ${report.path}\n`;
}

export function formatScaffoldText(report: ScaffoldReportV1): string {
  return `Created ${report.entityType} ${report.id}: ${report.path}\n`;
}

import {
  findWorkItem,
  outputPathForDocument,
  resolveDocumentLinks,
  type CompiledProject,
  type Document,
  type LinkResolutionOptions,
} from '@toudocu/core';
import {
  TaskMoveReportV1Schema,
  ToudocuError,
  type Issue,
  type TaskMoveReportV1,
} from '@toudocu/contracts';

export type TaskMoveOperation = 'archive' | 'restore';

export interface TaskMoveOptions {
  version: string;
  now?: Date;
  links: LinkResolutionOptions;
  validateMove: (sourcePath: string, destinationPath: string) => Promise<void>;
  moveFile: (sourcePath: string, destinationPath: string, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
}

export interface TaskMovePlan {
  report: TaskMoveReportV1;
  sourcePath?: string;
  destinationPath?: string;
  sourceLine?: number;
}

function emptyStatus(): TaskMoveReportV1['task']['status'] {
  return { kind: '', symbol: '', label: '', recognized: false };
}

function issue(code: string, message: string, documentPath?: string, line?: number): Issue {
  return {
    severity: 'error',
    code,
    message,
    ...(documentPath ? { documentPath } : {}),
    ...(line && line > 0 ? { line } : {}),
  };
}

function taskMoveTask(id: string): TaskMoveReportV1['task'] {
  return { id, title: '', status: emptyStatus() };
}

function sourceLine(document: Document, item: { anchor: string }): number | undefined {
  return document.headings.find((heading) => heading.id === item.anchor)?.range.start.line;
}

function archivePathInfo(sourcePath: string): {
  archived: boolean;
  year: string;
  valid: boolean;
} {
  const parts = sourcePath.replaceAll('\\', '/').split('/');
  if (parts[0] !== 'work' || parts[1] !== 'archive') {
    return { archived: false, year: '', valid: true };
  }
  const year = parts[2] ?? '';
  const valid = parts.length === 4 && /^\d{4}$/u.test(year) && /\.md$/iu.test(parts[3] ?? '');
  return { archived: true, year: valid ? year : '', valid };
}

function reportKind(operation: TaskMoveOperation): 'task-archive' | 'task-restore' {
  return operation === 'archive' ? 'task-archive' : 'task-restore';
}

function baseReport(
  operation: TaskMoveOperation,
  version: string,
  taskID: string,
): TaskMoveReportV1 {
  return {
    schemaVersion: 1,
    kind: reportKind(operation),
    generator: { name: 'Toudocu', version },
    status: 'blocked',
    task: taskMoveTask(taskID),
    issues: [],
  };
}

function linkKey(link: {
  targetDocumentPath?: string;
  repositoryPath?: string;
  repositoryKind?: string;
  assetPath?: string;
  generatedTarget?: string;
  external: boolean;
  blocked: boolean;
  broken: boolean;
  repositoryEscape: boolean;
  repositoryAsset: boolean;
  activeAsset: boolean;
  unsafeImage: boolean;
}): string {
  return [
    link.targetDocumentPath ?? '',
    link.repositoryPath ?? '',
    link.repositoryKind ?? '',
    link.assetPath ?? '',
    link.generatedTarget ?? '',
    link.external,
    link.blocked,
    link.broken,
    link.repositoryEscape,
    link.repositoryAsset,
    link.activeAsset,
    link.unsafeImage,
  ].join('\u0000');
}

function moveLinkIssues(
  project: CompiledProject,
  document: Document,
  destinationPath: string,
  links: LinkResolutionOptions,
): Issue[] {
  const issues: Issue[] = [];
  for (const source of project.index.documents) {
    if (source === document) {
      continue;
    }
    for (const resolved of project.links.linksByPath.get(source.sourcePath) ?? []) {
      if (resolved.targetDocumentPath !== document.sourcePath) {
        continue;
      }
      issues.push(
        issue(
          'task-move-incoming-link',
          `Link ${JSON.stringify(resolved.destination)} points to the file being moved; update or remove it before moving the task.`,
          source.sourcePath,
          resolved.range.start.line,
        ),
      );
    }
  }

  const movedDocument: Document = {
    ...document,
    id: destinationPath,
    sourcePath: destinationPath,
    outputPath: outputPathForDocument(destinationPath),
  };
  const movedLinks = resolveDocumentLinks(project.index, movedDocument, links);
  const originalLinks = project.links.linksByPath.get(document.sourcePath) ?? [];
  for (const [index, resolved] of originalLinks.entries()) {
    const pathPart = resolved.destination.split(/[?#]/u)[0] ?? '';
    if (resolved.external || (!pathPart && resolved.destination.includes('#'))) {
      continue;
    }
    const moved = movedLinks[index];
    if (!moved || linkKey(resolved) === linkKey(moved)) {
      continue;
    }
    issues.push(
      issue(
        'task-move-outgoing-link',
        `Link ${JSON.stringify(resolved.destination)} would resolve differently after the move.`,
        document.sourcePath,
        resolved.range.start.line,
      ),
    );
  }
  return issues;
}

export function planTaskMove(
  project: CompiledProject,
  taskID: string,
  operation: TaskMoveOperation,
  options: Pick<TaskMoveOptions, 'version' | 'now' | 'links'> & { skipLinks?: boolean },
): TaskMovePlan {
  const report = baseReport(operation, options.version, taskID);
  const item = (() => {
    try {
      return findWorkItem(project, taskID);
    } catch (error) {
      report.issues.push(issue('task-move-target', (error as Error).message));
      return undefined;
    }
  })();
  if (!item) {
    return { report: TaskMoveReportV1Schema.parse(report) };
  }

  const document = project.index.byPath.get(item.document);
  if (!document) {
    report.issues.push(
      issue('task-move-source', 'Task file not found in the model.', item.document),
    );
    return { report: TaskMoveReportV1Schema.parse({ ...report, sourcePath: item.document }) };
  }

  const line = sourceLine(document, item);
  report.task = {
    id: item.id,
    title: item.title,
    status: item.status,
    ...(item.type ? { type: item.type } : {}),
  };
  const archive = archivePathInfo(item.document);
  let archiveYear = archive.year;
  let destinationPath: string;
  if (operation === 'archive') {
    if (archive.archived) {
      report.issues.push(
        issue('task-already-archived', 'The task is already archived.', item.document, line),
      );
      return { report: TaskMoveReportV1Schema.parse({ ...report, sourcePath: item.document }) };
    }
    const statusName = item.status.label.trim().toLowerCase();
    if (!['done', 'cancelled'].includes(statusName)) {
      report.issues.push(
        issue(
          'task-not-terminal',
          'Only a Done or Cancelled task can be archived.',
          item.document,
          line,
        ),
      );
      return { report: TaskMoveReportV1Schema.parse({ ...report, sourcePath: item.document }) };
    }
    archiveYear = (options.now ?? new Date()).getFullYear().toString();
    destinationPath = `work/archive/${archiveYear}/${item.document.split('/').at(-1) ?? ''}`;
  } else {
    if (!archive.archived) {
      report.issues.push(
        issue('task-not-archived', 'The task is not archived.', item.document, line),
      );
      return { report: TaskMoveReportV1Schema.parse({ ...report, sourcePath: item.document }) };
    }
    if (!archive.valid) {
      report.issues.push(
        issue(
          'invalid-task-archive-path',
          'The task is outside work/archive/YYYY/*.md.',
          item.document,
          line,
        ),
      );
      return { report: TaskMoveReportV1Schema.parse({ ...report, sourcePath: item.document }) };
    }
    destinationPath = `work/${item.document.split('/').at(-1) ?? ''}`;
  }

  const reportWithPaths = {
    ...report,
    sourcePath: item.document,
    destinationPath,
    ...(archiveYear ? { archiveYear } : {}),
  };
  if (operation === 'archive') {
    reportWithPaths.issues.push(
      ...project.issues
        .filter(
          (projectIssue) =>
            projectIssue.severity === 'error' && projectIssue.documentPath === item.document,
        )
        .map((projectIssue) => ({ ...projectIssue })),
    );
  }
  if (!options.skipLinks && reportWithPaths.issues.length === 0) {
    reportWithPaths.issues.push(
      ...moveLinkIssues(project, document, destinationPath, options.links),
    );
  }
  return {
    report: TaskMoveReportV1Schema.parse(reportWithPaths),
    sourcePath: item.document,
    destinationPath,
    ...(line ? { sourceLine: line } : {}),
  };
}

export async function moveTask(
  project: CompiledProject,
  taskID: string,
  operation: TaskMoveOperation,
  options: TaskMoveOptions,
): Promise<TaskMoveReportV1> {
  const plan = planTaskMove(project, taskID, operation, { ...options, skipLinks: true });
  if (!plan.sourcePath || !plan.destinationPath || plan.report.issues.length > 0) {
    return plan.report;
  }
  options.signal?.throwIfAborted();
  try {
    await options.validateMove(plan.sourcePath, plan.destinationPath);
  } catch (error) {
    if (error instanceof ToudocuError && error.code === 'unsafe-task-move') {
      return TaskMoveReportV1Schema.parse({
        ...plan.report,
        issues: [
          ...plan.report.issues,
          issue('unsafe-task-move', error.message, plan.sourcePath, plan.sourceLine),
        ],
      });
    }
    throw error;
  }
  const linkIssues = moveLinkIssues(
    project,
    project.index.byPath.get(plan.sourcePath)!,
    plan.destinationPath,
    options.links,
  );
  if (linkIssues.length > 0) {
    return TaskMoveReportV1Schema.parse({
      ...plan.report,
      issues: [...plan.report.issues, ...linkIssues],
    });
  }
  try {
    await options.moveFile(plan.sourcePath, plan.destinationPath, options.signal);
  } catch (error) {
    if (error instanceof ToudocuError && error.code === 'unsafe-task-move') {
      return TaskMoveReportV1Schema.parse({
        ...plan.report,
        status: 'blocked',
        issues: [
          ...plan.report.issues,
          issue('unsafe-task-move', error.message, plan.sourcePath, plan.sourceLine),
        ],
      });
    }
    throw error;
  }
  return TaskMoveReportV1Schema.parse({
    ...plan.report,
    status: operation === 'archive' ? 'archived' : 'restored',
  });
}

export function formatTaskMoveText(report: TaskMoveReportV1): string {
  if (report.status === 'archived') {
    return `Task ${report.task.id} archived: ${report.destinationPath ?? ''}\n`;
  }
  if (report.status === 'restored') {
    return `Task ${report.task.id} restored: ${report.destinationPath ?? ''}\n`;
  }
  return (
    `Task ${report.task.id} was not moved.\n` +
    report.issues
      .map(
        (item) =>
          `[${item.severity.toUpperCase()}] ${item.code} ${item.documentPath ?? ''}${item.line ? `:${item.line}` : ''} — ${item.message}\n`,
      )
      .join('')
  );
}

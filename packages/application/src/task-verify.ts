import {
  blockingReadinessIssues,
  readinessIssue,
  taskReadiness,
  type CompiledProject,
  type DocumentationPathStatus,
  type WorkItem,
} from '@toudocu/core';
import { TaskVerifyReportV1Schema, type Issue, type TaskVerifyReportV1 } from '@toudocu/contracts';

export type TaskVerificationMode = 'dry-run' | 'run';

export interface PlannedTaskCommand {
  command: string;
  targets: string[];
}

export type TaskCommandResult = Omit<
  TaskVerifyReportV1['commands'][number],
  'sequence' | 'command' | 'targets'
>;

export type TaskCommandRunner = (
  command: string,
  repositoryRoot: string,
  signal?: AbortSignal,
) => Promise<TaskCommandResult>;

export interface TaskVerificationOptions {
  version: string;
  strict: boolean;
  pathStatus: DocumentationPathStatus;
  mode: TaskVerificationMode;
  repositoryRoot: string;
  target?: string;
  signal?: AbortSignal;
  now?: () => Date;
}

export interface TaskVerificationPlan {
  report: TaskVerifyReportV1;
  item?: WorkItem;
  commands: PlannedTaskCommand[];
}

function emptyStatus(): TaskVerifyReportV1['task']['status'] {
  return { kind: '', symbol: '', label: '', recognized: false };
}

function taskSnapshot(item: WorkItem | undefined, id: string): TaskVerifyReportV1['task'] {
  if (!item) {
    return { id, title: '', status: emptyStatus(), document: '' };
  }
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    ...(item.type ? { type: item.type } : {}),
    document: item.document,
  };
}

function issue(project: CompiledProject, code: string, message: string, item?: WorkItem): Issue {
  if (item) {
    return readinessIssue(project, item, code, message);
  }
  return { severity: 'error', code, message };
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function planTaskCommands(item: WorkItem): PlannedTaskCommand[] {
  const commands: PlannedTaskCommand[] = [];
  const byCommand = new Map<string, PlannedTaskCommand>();
  for (const check of item.checks) {
    for (const rawCommand of check.commands) {
      const command = rawCommand.trim();
      if (!command) {
        continue;
      }
      const existing = byCommand.get(command);
      if (existing) {
        existing.targets = unique([...existing.targets, check.target]);
        continue;
      }
      const planned = { command, targets: [check.target] };
      byCommand.set(command, planned);
      commands.push(planned);
    }
  }
  return commands;
}

function fullVerification(item: WorkItem): boolean {
  return (
    item.verification.length > 0 &&
    item.verification.every((criterion) => criterion.commands.length > 0)
  );
}

function targetStatus(
  target: string,
  commands: readonly TaskVerifyReportV1['commands'][number][],
): string {
  let found = false;
  let planned = false;
  for (const command of commands) {
    if (!command.targets.includes(target)) {
      continue;
    }
    found = true;
    if (command.status === 'planned') {
      planned = true;
      continue;
    }
    if (command.status !== 'passed') {
      return 'failed';
    }
  }
  if (!found) {
    return 'not_run';
  }
  return planned ? 'planned' : 'passed';
}

function finishReport(
  report: TaskVerifyReportV1,
  item: WorkItem | undefined,
  finishedAt: string,
): TaskVerifyReportV1 {
  report.finishedAt = finishedAt;
  report.durationMillis = Math.max(0, Date.parse(finishedAt) - Date.parse(report.startedAt));
  report.summary.totalCommands = report.commands.length;
  report.summary.passedCommands = report.commands.filter(
    (command) => command.status === 'passed',
  ).length;
  report.summary.timedOutCommands = report.commands.filter(
    (command) => command.status === 'timed_out',
  ).length;
  report.summary.failedCommands = report.commands.filter(
    (command) => !['passed', 'planned'].includes(command.status),
  ).length;
  if (item) {
    for (const criterion of item.verification) {
      if (report.target && report.target !== criterion.criterionId) {
        continue;
      }
      const status = targetStatus(criterion.criterionId, report.commands);
      report.criteria.push({
        id: criterion.criterionId,
        description: criterion.criterion,
        documentCompleted: criterion.completed,
        status,
      });
      if (status === 'passed') {
        report.summary.criteriaPassed += 1;
      } else if (status !== 'planned') {
        report.summary.criteriaFailed += 1;
      }
    }
    const seenTargets = new Set<string>();
    for (const check of item.checks) {
      if (report.target && report.target !== check.target) {
        continue;
      }
      if (seenTargets.has(check.target)) {
        continue;
      }
      seenTargets.add(check.target);
      report.targets.push({
        target: check.target,
        status: targetStatus(check.target, report.commands),
      });
    }
  }
  const failed = report.commands.some((command) => !['passed', 'planned'].includes(command.status));
  if (report.validationIssues.length > 0) {
    report.status = 'blocked';
  } else if (report.commands[0]?.status === 'planned') {
    report.status = 'planned';
  } else if (failed) {
    report.status = 'failed';
  } else {
    report.status = 'passed';
  }
  return TaskVerifyReportV1Schema.parse(report);
}

export function planTaskVerification(
  project: CompiledProject,
  taskID: string,
  options: TaskVerificationOptions,
): TaskVerificationPlan {
  const startedAt = (options.now ?? (() => new Date()))().toISOString();
  let item: WorkItem | undefined;
  let validationIssues: Issue[] = [];
  try {
    const readiness = taskReadiness(project, taskID, options.pathStatus);
    item = readiness.item;
    validationIssues = blockingReadinessIssues(readiness.issues, false);
  } catch (error) {
    validationIssues = [issue(project, 'task-selection-failed', (error as Error).message)];
  }
  if (
    item &&
    options.mode === 'run' &&
    !['ready', 'in-progress', 'blocked', 'done'].includes(item.status.label)
  ) {
    validationIssues.push(
      issue(
        project,
        'invalid-task-verify-state',
        'task verify --run is available only for Ready, In Progress, Blocked, or Done tasks.',
        item,
      ),
    );
  }
  const commands = item ? planTaskCommands(item) : [];
  if (item && commands.length === 0) {
    validationIssues.push(
      issue(
        project,
        'missing-task-command',
        'The task has no executable verification commands.',
        item,
      ),
    );
  }
  if (item && options.target) {
    if (!item.checks.some((check) => check.target === options.target)) {
      validationIssues.push(
        issue(
          project,
          'unknown-verification-target',
          `Unknown verification target: ${options.target}.`,
          item,
        ),
      );
    }
  }
  const blocked = blockingReadinessIssues(validationIssues, options.strict).length > 0;
  const report: TaskVerifyReportV1 = {
    schemaVersion: 1,
    kind: 'task-verify',
    generator: { name: 'Toudocu', version: options.version },
    task: taskSnapshot(item, taskID),
    startedAt,
    finishedAt: startedAt,
    durationMillis: 0,
    status: blocked ? 'blocked' : 'planned',
    mode: options.mode,
    ...(options.target ? { target: options.target } : {}),
    fullVerification: item ? fullVerification(item) && !options.target : false,
    validationIssues,
    issues: [...project.issues],
    commands: [],
    criteria: [],
    targets: [],
    summary: {
      totalCommands: 0,
      passedCommands: 0,
      failedCommands: 0,
      timedOutCommands: 0,
      criteriaPassed: 0,
      criteriaFailed: 0,
    },
  };
  if (blocked || !item) {
    return {
      report: finishReport(report, item, startedAt),
      commands,
      ...(item ? { item } : {}),
    };
  }
  if (options.target) {
    const filtered = commands.filter((command) => command.targets.includes(options.target!));
    for (const command of filtered) {
      command.targets = [options.target];
    }
    return { report, item, commands: filtered };
  }
  return { report, item, commands };
}

function plannedResult(command: PlannedTaskCommand): TaskVerifyReportV1['commands'][number] {
  return {
    sequence: 0,
    command: command.command,
    targets: command.targets,
    status: 'planned',
    exitCode: null,
    startedAt: '0001-01-01T00:00:00Z',
    finishedAt: '0001-01-01T00:00:00Z',
    durationMillis: 0,
    stdout: '',
    stderr: '',
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

export async function executeTaskVerification(
  project: CompiledProject,
  taskID: string,
  options: TaskVerificationOptions,
  runner?: TaskCommandRunner,
): Promise<TaskVerifyReportV1> {
  const plan = planTaskVerification(project, taskID, options);
  const report = plan.report;
  if (!plan.item || report.validationIssues.length > 0) {
    return report;
  }
  if (options.mode === 'dry-run') {
    report.commands = plan.commands.map((command, index) => ({
      ...plannedResult(command),
      sequence: index + 1,
    }));
    return finishReport(report, plan.item, report.startedAt);
  }
  if (!runner) {
    report.validationIssues.push(
      issue(
        project,
        'missing-task-runner',
        'task verify --run requires a command runner.',
        plan.item,
      ),
    );
    return finishReport(report, plan.item, report.startedAt);
  }
  for (const [index, command] of plan.commands.entries()) {
    let result: TaskCommandResult;
    try {
      result = await runner(command.command, options.repositoryRoot, options.signal);
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      const finishedAt = (options.now ?? (() => new Date()))().toISOString();
      result = {
        status: 'start_error',
        exitCode: null,
        startedAt: finishedAt,
        finishedAt,
        durationMillis: 0,
        stdout: '',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
      };
    }
    report.commands.push({
      sequence: index + 1,
      command: command.command,
      targets: command.targets,
      status: result.status,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMillis: result.durationMillis,
      stdout: result.stdout,
      stderr: result.stderr,
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
    });
  }
  return finishReport(report, plan.item, (options.now ?? (() => new Date()))().toISOString());
}

export function formatTaskVerifyText(report: TaskVerifyReportV1): string {
  let output = `\nTask: ${report.task.id}\nVerification status: ${report.status}\nCommands: ${report.summary.totalCommands}, passed: ${report.summary.passedCommands}, failed: ${report.summary.failedCommands}\nCriteria passed: ${report.summary.criteriaPassed}, failed: ${report.summary.criteriaFailed}\n`;
  for (const issueItem of report.validationIssues) {
    output += `[${issueItem.severity.toUpperCase()}] ${issueItem.code} — ${issueItem.message}\n`;
  }
  return output;
}

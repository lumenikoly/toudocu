import {
  ProjectInfoV1Schema,
  ToudocuCapabilitiesV1Schema,
  TaskCandidatesReportV1Schema,
  TaskListReportV1Schema,
  TaskContextReportV1Schema,
  TaskReadyReportV1Schema,
  TaskVerifyReportV1Schema,
  ChangeSetReportV1Schema,
  SearchReportV1Schema,
  ProjectReportV1Schema,
} from '@toudocu/contracts';
import { runProcess, type ProcessResult } from './process.js';

export const reports = {
  project_info: ProjectInfoV1Schema,
  task_candidates: TaskCandidatesReportV1Schema,
  task_list: TaskListReportV1Schema,
  task_context: TaskContextReportV1Schema,
  task_ready: TaskReadyReportV1Schema,
  task_changes: ChangeSetReportV1Schema,
  task_verify: TaskVerifyReportV1Schema,
  search: SearchReportV1Schema,
  changes: ChangeSetReportV1Schema,
  check: ProjectReportV1Schema,
};
export type Operation = keyof typeof reports;
export type Report = ReturnType<(typeof reports)[Operation]['parse']>;
const commands: Record<Operation, string[]> = {
  project_info: ['project', 'info'],
  task_candidates: ['task', 'candidates'],
  task_list: ['task', 'list'],
  task_context: ['task', 'context'],
  task_ready: ['task', 'ready'],
  task_changes: ['task', 'changes'],
  task_verify: ['task', 'verify'],
  search: ['search'],
  changes: ['changes'],
  check: ['check'],
};
export const taskIdPattern = /^(?:TASK|BUG)-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$/u;
export function argumentsFor(operation: Operation, value?: string): string[] {
  const args = [...commands[operation]];
  if (['task_context', 'task_ready', 'task_changes', 'task_verify'].includes(operation)) {
    if (!value || !taskIdPattern.test(value))
      throw new Error('Expected a TASK-AREA-NNN or BUG-AREA-NNN identifier.');
    args.push(value);
  } else if (operation === 'search') {
    if (!value || !/[\p{L}\p{Nd}]/u.test(value) || value.startsWith('-') || value.length > 1000)
      throw new Error('Enter a search query (up to 1000 characters, without a leading dash).');
    args.push(value);
  } else if (value !== undefined) throw new Error('This operation takes no argument.');
  if (operation === 'task_verify') args.push('--dry-run');
  return args;
}

function decode<T>(result: ProcessResult, schema: { parse(value: unknown): T }): T {
  // Exit 1 can carry a valid diagnostic report (not ready, check errors).
  if (result.exitCode > 1 || !result.stdout.trim())
    throw new Error(result.stderr.trim() || `Toudocu exited with code ${result.exitCode}.`);
  try {
    return schema.parse(JSON.parse(result.stdout));
  } catch {
    throw new Error('Toudocu returned an invalid or unsupported JSON report.');
  }
}

export class ToudocuClient {
  constructor(
    readonly cwd: string,
    readonly executable = 'toudocu',
    readonly signal?: AbortSignal,
  ) {}
  private discovered?: {
    at: number;
    data: Promise<{
      capabilities: ReturnType<typeof ToudocuCapabilitiesV1Schema.parse>;
      project: ReturnType<typeof ProjectInfoV1Schema.parse>;
    }>;
  };
  private run(args: string[], signal = this.signal) {
    return runProcess(this.executable, [...args, '--format', 'json'], this.cwd, signal);
  }
  private discover() {
    if (!this.discovered || Date.now() - this.discovered.at > 60_000) {
      const data = Promise.all([
        this.capabilities(),
        this.run(commands.project_info).then((result) => decode(result, ProjectInfoV1Schema)),
      ]).then(([capabilities, project]) => ({ capabilities, project }));
      this.discovered = { at: Date.now(), data };
      void data.catch(() => {
        if (this.discovered?.data === data) delete this.discovered;
      });
    }
    return this.discovered.data;
  }
  async capabilities() {
    const report = decode(await this.run(['capabilities']), ToudocuCapabilitiesV1Schema);
    if (report.cliContractVersion !== 1)
      throw new Error(`Toudocu CLI contract v${report.cliContractVersion}; plugin supports v1.`);
    return report;
  }
  async call<K extends Operation>(
    operation: K,
    value?: string,
    requestSignal?: AbortSignal,
    fresh = false,
  ): Promise<ReturnType<(typeof reports)[K]['parse']>> {
    const args = argumentsFor(operation, value);
    const signal =
      requestSignal && this.signal
        ? AbortSignal.any([requestSignal, this.signal])
        : (requestSignal ?? this.signal);
    signal?.throwIfAborted();
    const { capabilities, project } = await this.discover();
    signal?.throwIfAborted();
    const capability = operation.replaceAll('_', '-');
    if (!capabilities.capabilities.includes(capability))
      throw new Error(`Toudocu CLI does not support ${capability}. Update the CLI.`);
    if (operation === 'project_info')
      return (
        fresh ? decode(await this.run(args, signal), ProjectInfoV1Schema) : project
      ) as ReturnType<(typeof reports)[K]['parse']>;
    args.push(project.documentationRoot, '--repository-root', project.projectRoot);
    return decode<Report>(await this.run(args, signal), reports[operation]) as ReturnType<
      (typeof reports)[K]['parse']
    >;
  }
}

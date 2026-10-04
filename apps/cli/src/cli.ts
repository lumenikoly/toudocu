import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { cwd } from 'node:process';
import {
  discoverProject,
  registerServeInstance,
  buildDocumentationChanges,
  listRepositoryReviewFiles,
  readRepositoryReviewFile,
  buildStaticPortal,
  loadProject,
  documentationImpactPathStatus,
  loadTaskExternalDocuments,
  writeChangesOutput,
  createScaffold,
  createTaskInit,
  loadTaskWriteProject,
  detectSkillAgents,
  executeSkillPlan,
  findSkillProjectRoot,
  loadRuntimeSkillBundle,
  planSkillTarget,
  resolveSkillTargets,
  moveTaskFile,
  validateTaskFileMove,
  runTaskVerificationCommand,
  validateTaskVerifyReportPath,
  writeTaskVerifyReport,
  claimAgentDelivery,
  respondAgentDelivery,
  createReviewDiscussion,
  createReviewMessage,
  EditorWorkspace,
  loadReviewState,
  updateReviewDiscussion,
  updateReviewMessage,
  deleteReviewMessage,
  deleteReviewDiscussion,
  AgentConsoleRuntime,
  CodexProvider,
  OpenCodeProvider,
} from '@toudocu/platform-node';
import {
  buildProjectReport,
  createPortalSnapshot,
  createLogger,
  formatChangesMarkdown,
  formatChangesText,
  searchDocumentation,
  formatSearchText,
  buildTaskReady,
  buildTaskList,
  formatTaskListText,
  formatTaskReadyText,
  buildTaskCandidates,
  buildTaskTree,
  formatTaskCandidatesText,
  formatTaskTreeText,
  buildTaskContext,
  formatTaskContextText,
  buildScaffoldReport,
  buildTaskInitReport,
  formatScaffoldText,
  formatTaskInitText,
  moveTask,
  formatTaskMoveText,
  executeTaskVerification,
  formatTaskVerifyText,
  planTaskVerification,
  formatSkillConflict,
  formatSkillFailure,
  formatSkillResult,
  formatSkillStatus,
  formatSkillTarget,
  previewEditorDocument,
  validateEditorDocument,
} from '@toudocu/application';
import { ToudocuError, type SkillOperation, type SkillScope } from '@toudocu/contracts';
import { createDocumentationServer, isLoopbackHost } from '@toudocu/server';
import { formatLocalDate } from './date.js';

const packageManifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
export const version = packageManifest.version;
const help: Readonly<Record<string, string>> = {
  build:
    'Builds a standalone read-only portal and writes the output.\n\nUsage:\n  toudocu build [docs-dir] [-o DIR] [--clean] [--strict]\n                [--exclude PATHS] [--stale-days N] [--repository-root DIR]\n                [--repository-url URL] [--repository-ref REF]\n                [--screen-map|--no-screen-map] [-t TITLE]\n\nExample:\n  toudocu build ./docs -o ./build/project-docs --clean\n\nSide effects: writes output; --clean first validates the output path.\n',
  serve:
    'Serves the React portal and rebuilds it when project files change.\n\nUsage:\n  toudocu serve [docs-dir] [--host HOST] [--port PORT] [--no-update-check]\n                [--exclude PATHS] [--stale-days N] [--repository-root DIR] [-t TITLE]\n\nExample:\n  toudocu serve ./docs --port 6419 --no-update-check\n\nSide effects: starts a loopback HTTP server and watches project files.\n',
  changes:
    'Builds a read-only Git-backed documentation changes report.\n\nUsage:\n  toudocu changes [docs-dir] [--base REV|--branch-base REF]\n                  [--target working-tree|index|HEAD|REV]\n                  [--status STATUS] [--module ID] [--type TYPE]\n                  [--permanent-only] [--include-assets|--translation-input]\n                  [--repository-root DIR] [--format text|json|markdown] [-o FILE]\n  toudocu changes file PATH [docs-dir] [same options]\nExample:\n  toudocu changes ./docs --base main --target working-tree --format markdown\n\n--include-assets includes binary assets regardless of changes.includeAssets.\n--translation-input includes reader-facing Markdown, work artifacts, and assets,\nignoring changes.exclude except generated/** and cache/** inside the docs root.\n\nSide effects: reads Git and the workspace; -o writes the explicitly selected report.\n',
  'changes-file':
    'Shows details for one changed path without changing files.\n\nUsage:\n  toudocu changes file PATH [docs-dir] [--base REV|--branch-base REF]\n                       [--target working-tree|index|HEAD|REV]\n                       [--include-assets|--translation-input]\n                       [--repository-root DIR]\n                       [--format text|json|markdown] [-o FILE]\n\nSide effects: reads Git and the workspace; -o writes the explicitly selected report file.\n',
  'task-changes':
    'Builds one task-scoped read-only changes and impact report.\n\nUsage:\n  toudocu task changes TASK-ID [docs-dir] [--base REV|--branch-base REF]\n                       [--target working-tree|index|HEAD|REV]\n                       [--include-assets|--translation-input]\n                       [--repository-root DIR]\n                       [--tree] [--format text|json|markdown] [-o FILE]\n\nSide effects: reads Git and the workspace; -o writes the explicitly selected\nreport file. --tree includes the selected task and all its descendants.\n',
  'task-context':
    'Returns compact read-only context for a Ready+ task.\n\nUsage:\n  toudocu task context TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]\n',
  'task-candidates':
    'Lists Draft and Ready work candidates without changing files.\n\nUsage:\n  toudocu task candidates [docs-dir] [--parent TASK-ID] [--strict] [--format text|json]\n\nWithout --parent, candidates come from all active work items. With --parent,\nonly descendants of that TASK-* are included.\n',
  'task-list':
    'Lists all nonarchived work items with canonical Markdown and readiness without changing files.\n\nUsage:\n  toudocu task list [docs-dir] [--strict] [--repository-root DIR] [--format text|json]\n',
  'task-tree':
    'Shows a read-only TASK-* decomposition tree.\n\nUsage:\n  toudocu task tree TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]\n',
  'task-ready':
    'Validates a Draft or Ready contract without changing files.\n\nUsage:\n  toudocu task ready TASK-ID [docs-dir] [--strict] [--format text|json]\n',
  'task-verify':
    'Plans or runs trusted task verification commands.\n\nUsage:\n  toudocu task verify TASK-ID [docs-dir] (--dry-run|--run)\n                      [--target TARGET] [--report FILE] [--timeout DURATION]\n\n--dry-run does not run commands. --report writes a JSON file outside the documentation root.\n--run executes the task commands.\n',
  'task-archive':
    'Moves a terminal task into the yearly archive without changing its Markdown.\n\nUsage:\n  toudocu task archive TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]\n',
  'task-restore':
    'Restores an archived task without changing its Markdown.\n\nUsage:\n  toudocu task restore TASK-ID [docs-dir] [--repository-root DIR] [--format text|json]\n',
  'task-init':
    'Atomically creates a new Draft TASK-* or BUG-*.\n\nUsage:\n  toudocu task init [docs-dir] --area AREA --title TITLE --type TYPE [--parent TASK-ID]\n                    [--lang en|ru] [--format text|json]\n',
  scaffold:
    'Atomically creates one typed Markdown file.\n\nUsage:\n  toudocu scaffold module|use-case|flow|screen|decision|standard|runbook ID\n                   [docs-dir] --title TITLE [--lang en|ru] [--format text|json]\n',
  check:
    'Validates structure, links, IDs, and explicit relationships without changing files.\n\nUsage:\n  toudocu check [docs-dir] [--strict] [--format text|json]\n                [--exclude PATHS] [--stale-days N] [--repository-root DIR]\n\nExample:\n  toudocu check ./docs --strict\n\nSide effects: none. Without --strict, warnings do not change the exit code.\n',
  search:
    'Searches current source Markdown without changing files.\n\nUsage:\n  toudocu search "QUERY" [docs-dir] [--limit N] [--format text|json]\n\nExample:\n  toudocu search "task workflow" ./docs --format json\n',
  agent:
    'Reads the local Agent Feedback queue without starting an agent.\n\nUsage:\n  toudocu agent next [--repository-root DIR] --json\n  toudocu agent respond [--input response.json] [--repository-root DIR] [--json]\n',
  skill:
    'Manages the bundled offline Toudocu AI-skill package.\n\nUsage:\n  toudocu skill install|status|update|uninstall [--agent auto|codex|claude-code|copilot|all]\n                  [--scope project|user] [--repository-root DIR]\n\n--repository-root is available only for project scope. status changes nothing.\n',
};
interface ReadOptions {
  format: string;
  staleDays: string;
  limit: string;
  exclude: string[];
  repositoryRoot?: string;
  repositoryUrl?: string;
  repositoryRef?: string;
  title?: string;
  area?: string;
  lang?: string;
  strict?: boolean;
  parent?: string;
  base?: string;
  branchBase?: string;
  target?: string;
  status?: string;
  module?: string;
  type?: string;
  permanentOnly?: boolean;
  includeAssets?: boolean;
  translationInput?: boolean;
  tree?: boolean;
  output?: string;
  report?: string;
  run?: boolean;
  dryRun?: boolean;
  timeout?: string;
  debug?: boolean;
  agent?: string;
  scope?: string;
  clean?: boolean;
  screenMap?: boolean;
  noScreenMap?: boolean;
  host: string;
  port: string;
  updateCheck: boolean;
}
function json(value: unknown): string {
  return (
    JSON.stringify(value, null, 2).replace(
      /[<>&\u2028\u2029]/gu,
      (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`,
    ) + '\n'
  );
}
function argumentError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const unknown = /unknown option '([^']+)'/u.exec(message);
  if (unknown) {
    return `unknown option: ${unknown[1]}`;
  }
  const missing = /option '([^ ]+)[^']*' argument missing/u.exec(message);
  if (missing) {
    return `option ${missing[1]} requires a value`;
  }
  return message.replace(/^error: /u, '');
}

async function codexSkillSetup(repositoryRoot: string) {
  const candidates = [
    resolve(repositoryRoot, '.agents/skills/toudocu/SKILL.md'),
    resolve(homedir(), '.agents/skills/toudocu/SKILL.md'),
  ];
  for (const path of candidates) {
    try {
      if ((await lstat(path)).isFile()) {
        return { state: 'installed', diagnostic: `Toudocu skill: ${path}` };
      }
    } catch {
      // Try the next supported skill scope.
    }
  }
  return {
    state: 'not-installed',
    diagnostic: 'The Toudocu skill is not installed for Codex.',
    command: 'toudocu skill install --agent codex --scope project',
  };
}

function parseDurationMillis(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const units: Readonly<Record<string, number>> = {
    ns: 1e-6,
    us: 1e-3,
    µs: 1e-3,
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };
  const part = /(\d+(?:\.\d*)?|\.\d+)(ns|us|µs|ms|s|m|h)/y;
  let offset = 0;
  let milliseconds = 0;
  let parts = 0;
  while (offset < value.length) {
    part.lastIndex = offset;
    const match = part.exec(value);
    if (!match) {
      throw new Error('--timeout must be a positive duration, for example 10m');
    }
    milliseconds += Number(match[1]) * (units[match[2] ?? ''] ?? 0);
    offset = part.lastIndex;
    parts += 1;
  }
  if (parts === 0) {
    throw new Error('--timeout must be a positive duration, for example 10m');
  }
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error('--timeout must be a positive duration, for example 10m');
  }
  if (milliseconds > 2_147_483_647) {
    throw new Error('--timeout must be a positive duration, for example 10m');
  }
  return Math.ceil(milliseconds);
}

function hasDebugOption(argv: readonly string[]): boolean {
  const separator = argv.indexOf('--');
  const options = separator === -1 ? argv : argv.slice(0, separator);
  return options.includes('--debug');
}

function changesExitCode(error: unknown): number {
  if (!(error instanceof ToudocuError)) {
    return 4;
  }
  if (
    ['git-base-not-found', 'git-merge-base-not-found', 'git-target-not-found'].includes(error.code)
  ) {
    return 2;
  }
  if (['git-command-failed', 'git-repository-not-found'].includes(error.code)) {
    return 3;
  }
  return error.exitCode;
}

function interruptionExitCode(signal: AbortSignal): number {
  const reason = signal.reason;
  if (reason instanceof Error && 'signal' in reason && reason.signal === 'SIGTERM') {
    return 143;
  }
  return 130;
}

async function chooseSkillAgent(
  stdin: NodeJS.ReadableStream,
  stdout: (value: string) => void,
  detected: readonly string[],
): Promise<string> {
  const names = ['codex', 'claude-code', 'copilot'];
  stdout('Select an AI host:\n');
  names.forEach((name, index) => {
    const marker = detected.includes(name) ? ' (detected)' : '';
    stdout(`  ${index + 1}) ${name}${marker}\n`);
  });
  stdout(`  ${names.length + 1}) all\nChoice: `);
  const reader = createInterface({ input: stdin });
  try {
    const choice = Number.parseInt(await reader.question(''), 10);
    if (!Number.isInteger(choice) || choice < 1 || choice > names.length + 1) {
      throw new ToudocuError('SKILL_AGENT_REQUIRED', 'invalid selection');
    }
    return choice === names.length + 1 ? 'all' : names[choice - 1]!;
  } finally {
    reader.close();
  }
}

async function runSkill(
  operation: SkillOperation,
  options: ReadOptions,
  stdout: (value: string) => void,
  stderr: (value: string) => void,
  signal: AbortSignal | undefined,
  stdin: NodeJS.ReadableStream | undefined,
): Promise<number> {
  if (options.format !== 'text') {
    throw new ToudocuError('SKILL_ARGUMENT_INVALID', 'unsupported parameter "--format"');
  }
  const scopeValue = options.scope ?? 'project';
  if (scopeValue !== 'project' && scopeValue !== 'user') {
    throw new ToudocuError(
      'SKILL_SCOPE_INVALID',
      `unsupported scope ${JSON.stringify(scopeValue)}`,
    );
  }
  if (scopeValue === 'user' && options.repositoryRoot !== undefined) {
    throw new ToudocuError(
      'SKILL_ARGUMENT_INVALID',
      '--repository-root is available only for project scope',
    );
  }
  const root = await findSkillProjectRoot(options.repositoryRoot, cwd());
  const home = homedir();
  let agent = options.agent ?? 'auto';
  if (agent === 'auto') {
    const detected = await detectSkillAgents(root, home);
    if (detected.length === 1) {
      agent = detected[0]!;
    } else if (stdin !== undefined && (stdin as NodeJS.ReadStream).isTTY) {
      agent = await chooseSkillAgent(stdin, stdout, detected);
    } else {
      throw new ToudocuError(
        'SKILL_AGENT_REQUIRED',
        '--agent is required when auto-detection finds zero or multiple hosts',
      );
    }
  }
  const bundle = await loadRuntimeSkillBundle();
  const targets = resolveSkillTargets({
    agent,
    scope: scopeValue as SkillScope,
    repositoryRoot: root,
    home,
  });
  const plans = [];
  for (const target of targets) {
    signal?.throwIfAborted();
    plans.push(await planSkillTarget(operation, target, bundle));
  }
  let failed = false;
  for (const plan of plans) {
    signal?.throwIfAborted();
    stdout(formatSkillTarget(plan));
    if (operation === 'status') {
      stdout(formatSkillStatus(plan));
      continue;
    }
    if (plan.conflict) {
      failed = true;
      stderr(formatSkillConflict(plan));
      continue;
    }
    const result = await executeSkillPlan(
      { operation, target: plan.target, before: plan.before, bundle: plan.bundle },
      bundle,
      version,
    );
    if (result.error !== undefined) {
      failed = true;
      stderr(formatSkillFailure(result));
      continue;
    }
    stdout(formatSkillResult(result));
  }
  return failed ? 1 : 0;
}

function agentErrorCode(error: unknown): string {
  return error instanceof ToudocuError ? error.code : 'AGENT_STATE_CORRUPTED';
}

function writeAgentError(
  stderr: (value: string) => void,
  jsonOutput: boolean,
  code: string,
  message: string,
): number {
  if (jsonOutput) {
    stderr(
      json({
        diagnostics: [{ severity: 'error', code, message }],
        schemaVersion: 1,
      }),
    );
  } else {
    stderr(`Error ${code}: ${message}\n`);
  }
  return 1;
}

async function readAgentInput(inputPath: string | undefined): Promise<unknown> {
  let data: Buffer;
  if (inputPath === undefined) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    data = Buffer.concat(chunks);
  } else {
    data = await readFile(resolve(inputPath));
  }
  try {
    return JSON.parse(data.toString('utf8'));
  } catch {
    throw new ToudocuError(
      'AGENT_INVALID_MESSAGE',
      data.length === 0 ? 'invalid response JSON: EOF' : 'invalid response JSON',
    );
  }
}

async function runAgentCLI(
  argv: readonly string[],
  stdout: (value: string) => void,
  stderr: (value: string) => void,
): Promise<number> {
  const operation = argv[1];
  if (operation === undefined || operation === '--help' || operation === '-h') {
    stdout(help.agent ?? '');
    return 0;
  }
  if (operation !== 'next' && operation !== 'respond') {
    return writeAgentError(
      stderr,
      false,
      'AGENT_INVALID_MESSAGE',
      'agent supports next or respond',
    );
  }
  let repositoryRoot: string | undefined;
  let inputPath: string | undefined;
  let jsonOutput = false;
  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === '--json') {
      jsonOutput = true;
      continue;
    }
    if (argument === '--repository-root' || argument === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) {
        return writeAgentError(
          stderr,
          jsonOutput,
          argument === '--input' ? 'AGENT_INVALID_MESSAGE' : 'AGENT_INVALID_PATH',
          `${argument} requires a value`,
        );
      }
      index += 1;
      if (argument === '--input') {
        inputPath = value;
      } else {
        repositoryRoot = value;
      }
      continue;
    }
    if (argument.startsWith('--repository-root=')) {
      repositoryRoot = argument.slice('--repository-root='.length);
      continue;
    }
    if (argument.startsWith('--input=')) {
      inputPath = argument.slice('--input='.length);
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      stdout(help.agent ?? '');
      return 0;
    }
    return writeAgentError(
      stderr,
      jsonOutput,
      'AGENT_INVALID_MESSAGE',
      `unknown option: ${argument}`,
    );
  }
  if (operation === 'next' && !jsonOutput) {
    return writeAgentError(stderr, false, 'AGENT_INVALID_MESSAGE', 'agent next requires --json');
  }
  if (operation === 'next' && inputPath !== undefined) {
    return writeAgentError(
      stderr,
      true,
      'AGENT_INVALID_MESSAGE',
      'agent next does not accept --input',
    );
  }
  try {
    if (operation === 'next') {
      const request = await claimAgentDelivery({
        ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
      });
      stdout(json(request));
      return 0;
    }
    if (inputPath !== undefined) {
      let info: Awaited<ReturnType<typeof lstat>>;
      try {
        info = await lstat(resolve(inputPath));
      } catch (error) {
        throw new ToudocuError(
          'AGENT_INVALID_PATH',
          '--input must be a regular non-symlink JSON file',
          { cause: error },
        );
      }
      if (info.isSymbolicLink() || !info.isFile()) {
        throw new ToudocuError(
          'AGENT_INVALID_PATH',
          '--input must be a regular non-symlink JSON file',
        );
      }
      if (info.size > 64 * 1024) {
        throw new ToudocuError('AGENT_PAYLOAD_TOO_LARGE', 'agent response exceeds 64 KiB');
      }
    }
    const input = await readAgentInput(inputPath);
    const response = await respondAgentDelivery(input, {
      ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
    });
    if (jsonOutput) {
      stdout(json(response));
    } else {
      const deliveryID =
        typeof input === 'object' && input !== null && 'deliveryId' in input
          ? String(input.deliveryId)
          : '';
      stdout(`Response for ${deliveryID} accepted.\n`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return writeAgentError(
      stderr,
      jsonOutput || operation === 'next',
      agentErrorCode(error),
      message,
    );
  }
}

async function runChanges(
  inputDirectory: string,
  filePath: string | undefined,
  taskID: string,
  options: ReadOptions,
  stdout: (value: string) => void,
  signal?: AbortSignal,
): Promise<number> {
  const report = await buildDocumentationChanges(inputDirectory, {
    ...(options.repositoryRoot !== undefined ? { repositoryRoot: options.repositoryRoot } : {}),
    ...(options.base !== undefined ? { base: options.base } : {}),
    ...(options.branchBase !== undefined ? { branchBase: options.branchBase } : {}),
    ...(options.target !== undefined ? { target: options.target } : {}),
    ...(filePath !== undefined ? { file: filePath } : {}),
    ...(taskID ? { taskID } : {}),
    ...(options.tree ? { taskTree: true } : {}),
    ...(options.status !== undefined ? { status: options.status } : {}),
    ...(options.type !== undefined ? { entityType: options.type } : {}),
    ...(options.module !== undefined ? { module: options.module } : {}),
    ...(options.permanentOnly ? { permanentOnly: true } : {}),
    ...(options.includeAssets ? { forceIncludeAssets: true } : {}),
    ...(options.translationInput ? { translationInput: true } : {}),
    ...(signal ? { signal } : {}),
  });
  signal?.throwIfAborted();
  const content =
    options.format === 'json'
      ? json(report)
      : options.format === 'markdown'
        ? formatChangesMarkdown(report)
        : formatChangesText(report);

  if (options.output === undefined) {
    stdout(content);
  } else {
    await writeChangesOutput(options.output, content, signal);
    stdout(`Report saved: ${options.output}\n`);
  }

  return report.diagnostics.some((issue) => issue.severity === 'error') ? 1 : 0;
}

/** Thin transport: parse argv, call read-only application services, format one response. */
export async function runCLI(
  argv: readonly string[],
  stdout: (value: string) => void,
  stderr: (value: string) => void,
  signal?: AbortSignal,
  stdin?: NodeJS.ReadableStream,
): Promise<number> {
  if (signal?.aborted) {
    return interruptionExitCode(signal);
  }
  const command =
    argv[0] === 'changes' && argv[1] === 'file'
      ? 'changes-file'
      : argv[0] === 'task'
        ? `task-${argv[1] ?? ''}`
        : argv[0];
  if (command === 'version' || command === '--version' || command === '-V') {
    stdout(`${version}\n`);
    return 0;
  }
  if (argv[0] === 'capabilities' || (argv[0] === 'project' && argv[1] === 'info')) {
    try {
      const parser = new Command(
        argv[0] === 'project' ? 'toudocu project info' : 'toudocu capabilities',
      )
        .description(
          argv[0] === 'project'
            ? 'Discover the current project and its default documentation root.'
            : 'List the public CLI contract version and supported capabilities.',
        )
        .exitOverride()
        .configureOutput({ writeErr: () => {}, writeOut: stdout })
        .option('--format <format>', '', 'text')
        .allowExcessArguments(false);
      parser.parse([...argv.slice(argv[0] === 'project' ? 2 : 1)], { from: 'user' });
      const { format } = parser.opts<{ format: string }>();
      if (!['text', 'json'].includes(format)) throw new Error('--format must be text or json');
      const report =
        argv[0] === 'project'
          ? await discoverProject(cwd(), signal)
          : {
              schemaVersion: 1,
              version,
              cliContractVersion: 1,
              capabilities: [
                'project-info',
                'workspace-discovery',
                'task-candidates',
                'task-list',
                'task-context',
                'task-ready',
                'task-changes',
                'task-verify',
                'search',
                'changes',
                'check',
                'agent-feedback',
              ],
            };
      stdout(
        format === 'json'
          ? json(report)
          : Object.entries(report)
              .map(
                ([key, value]) =>
                  `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`,
              )
              .join('\n') + '\n',
      );
      return 0;
    } catch (error) {
      if (signal?.aborted) return interruptionExitCode(signal);
      if (error instanceof Error && 'code' in error && error.code === 'commander.helpDisplayed')
        return 0;
      stderr(
        json({
          schemaVersion: 1,
          error: {
            code: error instanceof ToudocuError ? error.code : 'INVALID_ARGUMENT',
            message: argumentError(error),
          },
        }),
      );
      return 1;
    }
  }
  if (argv[0] === 'agent') {
    return runAgentCLI(argv, stdout, stderr);
  }
  if (
    command !== undefined &&
    Object.hasOwn(help, command) &&
    (argv.includes('--help') || argv.includes('-h'))
  ) {
    stdout(help[command] ?? '');
    return 0;
  }
  if (!command || !Object.hasOwn(help, command)) {
    if (argv[0] === 'task') {
      stderr(
        'Error: usage: toudocu task init|list|ready|candidates|context|verify|archive|restore\n',
      );
      return 1;
    }
    stderr(
      `toudocu-ts: command ${command ?? '(missing command)'} is not implemented in migration stage 1\n`,
    );
    return 2;
  }
  const logger = createLogger({
    debug: hasDebugOption(argv),
    sink: stderr,
  });
  logger.debug('running CLI command', { command });
  let changesExecutionStarted = false;
  try {
    const parser = new Command(command)
      .helpOption(false)
      .allowExcessArguments(true)
      .exitOverride()
      .configureOutput({ writeErr: () => {}, writeOut: stdout })
      .showSuggestionAfterError(false)
      .option('--format <format>', '', 'text')
      .option('--base <revision>')
      .option('--branch-base <ref>')
      .option('--target <target>')
      .option('--status <status>')
      .option('--module <id>')
      .option('--type <type>')
      .option('--permanent-only')
      .option('--include-assets')
      .option('--translation-input')
      .option('--tree')
      .option('--dry-run')
      .option('--run')
      .option('--report <file>')
      .option('--timeout <duration>')
      .option('-o, --output <file>')
      .option('--stale-days <days>', '', '90')
      .option('--repository-root <dir>')
      .option('--repository-url <url>')
      .option('--repository-ref <ref>')
      .option('--agent <agent>')
      .option('--scope <scope>')
      .option('-t, --title <title>')
      .option('--area <area>')
      .option('--lang <language>')
      .option('--strict')
      .option('--clean')
      .option('--screen-map')
      .option('--no-screen-map')
      .option('--host <host>', '', '127.0.0.1')
      .option('--port <port>', '', '6419')
      .option('--no-update-check')
      .option('--parent <task>')
      .option('--limit <count>', '', '20')
      // Internal migration diagnostic mode; records are written to stderr only.
      .option('--debug')
      .option(
        '--exclude <paths>',
        '',
        (value: string, previous: string[]) => [
          ...previous,
          ...value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        ],
        [],
      );
    const argumentStart = command === 'changes-file' || argv[0] === 'task' ? 2 : 1;
    parser.parse([...argv.slice(argumentStart)], { from: 'user' });
    const options = parser.opts<ReadOptions>();
    const positional = parser.args;
    const query = command === 'search' ? (positional.shift() ?? '') : '';
    const filePath = command === 'changes-file' ? positional.shift() : undefined;
    const entityKind = command === 'scaffold' ? positional.shift() : undefined;
    const entityID = command === 'scaffold' ? positional.shift() : undefined;
    const requiresTaskID = [
      'task-ready',
      'task-tree',
      'task-context',
      'task-verify',
      'task-changes',
      'task-archive',
      'task-restore',
    ].includes(command);
    const taskID = requiresTaskID ? (positional.shift() ?? '') : '';
    const isChangesCommand = ['changes', 'changes-file', 'task-changes'].includes(command);
    if (command === 'changes-file' && !filePath) {
      throw new Error('usage: toudocu changes file PATH [docs-directory]');
    }
    if (requiresTaskID && !/^(?:TASK|BUG)-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$/u.test(taskID)) {
      throw new Error('work-item identifier must have the form TASK-AREA-NNN or BUG-AREA-NNN');
    }
    if (options.parent && command !== 'task-candidates' && command !== 'task-init') {
      throw new Error('--parent is available only for task init and task candidates');
    }
    if (options.parent && !/^TASK-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$/u.test(options.parent)) {
      throw new Error('--parent must have the form TASK-AREA-NNN');
    }
    if (positional.length > 1) {
      throw new Error(`unexpected positional argument: ${positional[1]}`);
    }
    if (!['text', 'json', ...(isChangesCommand ? ['markdown'] : [])].includes(options.format)) {
      throw new Error('--format must be text, json, or markdown for changes');
    }
    if (!/^\d+$/u.test(options.staleDays)) {
      throw new Error('--stale-days must be a non-negative number');
    }
    if (!/^\d+$/u.test(options.limit) || Number(options.limit) < 1 || Number(options.limit) > 100) {
      throw new Error('--limit must be a number from 1 to 100');
    }
    if (command !== 'search' && parser.getOptionValueSource('limit') === 'cli') {
      throw new Error('--limit is available only for search');
    }
    if (
      options.strict &&
      !['build', 'check', 'task-ready', 'task-candidates', 'task-list'].includes(command)
    ) {
      throw new Error('--strict is not available for this command');
    }
    if (options.clean && command !== 'build') {
      throw new Error('--clean is available only for build');
    }
    if ((options.screenMap || options.noScreenMap) && command !== 'build') {
      throw new Error('--screen-map and --no-screen-map are available only for build');
    }
    if (
      command !== 'serve' &&
      (parser.getOptionValueSource('host') === 'cli' ||
        parser.getOptionValueSource('port') === 'cli' ||
        parser.getOptionValueSource('updateCheck') === 'cli')
    ) {
      throw new Error('--host, --port, and --no-update-check are available only for serve');
    }
    if (command === 'serve' && (!/^\d+$/u.test(options.port) || Number(options.port) > 65_535)) {
      throw new Error('--port must be a number from 0 to 65535');
    }
    if (options.screenMap && options.noScreenMap) {
      throw new Error('--screen-map and --no-screen-map cannot be used together');
    }
    if (command === 'task-verify') {
      if (options.run && options.dryRun) {
        throw new Error('--dry-run and --run cannot be used together');
      }
      if (!options.run && !options.dryRun) {
        throw new Error('task verify requires exactly one mode: --dry-run or --run');
      }
      if (options.timeout !== undefined) {
        parseDurationMillis(options.timeout);
      }
      if (options.report !== undefined && !/\.json$/iu.test(options.report)) {
        throw new Error('--report must point to a JSON file');
      }
    } else if (
      options.report !== undefined ||
      options.timeout !== undefined ||
      options.run ||
      options.dryRun
    ) {
      throw new Error(
        '--dry-run, --run, --report, and --timeout are available only for task verify',
      );
    }
    const verifyTimeoutMs =
      command === 'task-verify' ? parseDurationMillis(options.timeout) : undefined;
    if (command === 'search' && !/[\p{L}\p{Nd}]/u.test(query)) {
      throw new Error('search query cannot be empty');
    }
    if (options.tree && command !== 'task-changes') {
      throw new Error('--tree is available only for task changes');
    }
    if (options.tree && !taskID.startsWith('TASK-')) {
      throw new Error('--tree is available only for TASK-* work items');
    }
    if (
      isChangesCommand &&
      (options.repositoryUrl !== undefined ||
        options.repositoryRef !== undefined ||
        options.title !== undefined ||
        options.exclude.length > 0)
    ) {
      throw new Error('--repository-root is the only repository option available for changes');
    }
    if (
      !isChangesCommand &&
      (options.base !== undefined ||
        options.branchBase !== undefined ||
        (options.target !== undefined && command !== 'task-verify') ||
        options.status !== undefined ||
        options.module !== undefined ||
        (options.type !== undefined && command !== 'task-init') ||
        options.permanentOnly ||
        options.includeAssets ||
        options.translationInput ||
        options.tree ||
        (options.output !== undefined && !['build', 'serve'].includes(command)))
    ) {
      throw new Error('--base and related options are available only for changes');
    }
    if (options.area !== undefined && command !== 'task-init') {
      throw new Error('--area is available only for task init');
    }
    if (options.lang !== undefined && command !== 'task-init' && command !== 'scaffold') {
      throw new Error('--lang is available only for task init and scaffold');
    }
    if (
      options.title !== undefined &&
      !['build', 'serve', 'task-init', 'scaffold'].includes(command)
    ) {
      throw new Error('--title is not available for this command');
    }
    if (command === 'task-init') {
      if (!options.area || !options.title || !options.type) {
        throw new Error('task init requires --area, --title, and --type');
      }
    }
    if (command === 'scaffold') {
      if (!entityKind || !entityID || !options.title) {
        throw new Error('scaffold requires an entity type, ID, and --title');
      }
    }
    if (isChangesCommand) {
      if (options.translationInput && options.permanentOnly) {
        throw new Error('--translation-input and --permanent-only cannot be used together');
      }
      if (options.base !== undefined && options.branchBase !== undefined) {
        throw new Error('--base and --branch-base cannot be used together');
      }
      if (options.output !== undefined) {
        options.output = resolve(options.output);
      }
      const inputDirectory = positional[0] ?? './docs';
      changesExecutionStarted = true;
      return await runChanges(inputDirectory, filePath, taskID, options, stdout, signal);
    }
    if (command === 'skill') {
      const operation = positional.shift();
      if (
        operation !== 'install' &&
        operation !== 'status' &&
        operation !== 'update' &&
        operation !== 'uninstall'
      ) {
        throw new ToudocuError(
          'SKILL_OPERATION_INVALID',
          `unsupported operation ${JSON.stringify(operation ?? '')}`,
        );
      }
      return await runSkill(operation, options, stdout, stderr, signal, stdin);
    }
    const now = new Date();
    if (command === 'task-init' || command === 'scaffold') {
      const writeProject = await loadTaskWriteProject(
        positional[0] ?? './docs',
        options.repositoryRoot,
        command === 'task-init' && options.parent !== undefined,
        signal,
      );
      if (command === 'task-init') {
        const render = await createTaskInit(
          writeProject,
          {
            area: options.area ?? '',
            title: options.title ?? '',
            type: options.type ?? '',
            ...(options.lang === undefined ? {} : { language: options.lang }),
            ...(options.parent === undefined ? {} : { parentID: options.parent }),
            date: formatLocalDate(now),
          },
          signal,
        );
        signal?.throwIfAborted();
        const report = buildTaskInitReport(render, version);
        stdout(options.format === 'json' ? json(report) : formatTaskInitText(report));
        return 0;
      }
      const render = await createScaffold(
        writeProject,
        {
          entityType: entityKind ?? '',
          id: entityID ?? '',
          title: options.title ?? '',
          ...(options.lang === undefined ? {} : { language: options.lang }),
          date: formatLocalDate(now),
        },
        signal,
      );
      signal?.throwIfAborted();
      const report = buildScaffoldReport(render, version);
      stdout(options.format === 'json' ? json(report) : formatScaffoldText(report));
      return 0;
    }
    const staleDays = Number(options.staleDays);
    const inputDirectory = positional[0] ?? './docs';
    const project = await loadProject(inputDirectory, {
      now,
      staleDays,
      excludes: options.exclude,
      ...(options.repositoryRoot !== undefined ? { repositoryRoot: options.repositoryRoot } : {}),
      ...(options.repositoryUrl !== undefined ? { repositoryUrl: options.repositoryUrl } : {}),
      ...(options.repositoryRef !== undefined ? { repositoryRef: options.repositoryRef } : {}),
      ...(signal ? { signal } : {}),
    });
    signal?.throwIfAborted();
    const versionIssue = project.issues.some((issue) =>
      ['DOCS_MIGRATION_REQUIRED', 'DOCUMENTATION_VERSION_UNSUPPORTED'].includes(issue.code),
    );
    const taskOptions = {
      version,
      strict: options.strict ?? false,
      pathStatus: (value: string, document: string) =>
        documentationImpactPathStatus(project, value, document),
    };
    if (command === 'task-verify') {
      const mode = options.run ? 'run' : 'dry-run';
      const verifyOptions = {
        ...taskOptions,
        mode,
        repositoryRoot: project.inventory.root,
        ...(options.target === undefined ? {} : { target: options.target }),
        ...(signal === undefined ? {} : { signal }),
      } as const;
      if (options.report !== undefined) {
        await validateTaskVerifyReportPath(options.report, project.snapshot.root);
      }
      const planned = planTaskVerification(project, taskID, verifyOptions);
      let commandNumber = 0;
      const report = await executeTaskVerification(
        project,
        taskID,
        verifyOptions,
        options.run
          ? async (taskCommand, repositoryRoot, runSignal) => {
              commandNumber += 1;
              if (options.format !== 'json') {
                stdout(`\n[${commandNumber}/${planned.commands.length}] ${taskCommand}\n`);
              }
              return runTaskVerificationCommand(taskCommand, repositoryRoot, {
                ...(verifyTimeoutMs === undefined ? {} : { timeoutMs: verifyTimeoutMs }),
                ...(runSignal === undefined ? {} : { signal: runSignal }),
                ...(options.format === 'json'
                  ? {}
                  : {
                      onStdout: (chunk: Buffer) => stdout(chunk.toString('utf8')),
                      onStderr: (chunk: Buffer) => stderr(chunk.toString('utf8')),
                    }),
              });
            }
          : undefined,
      );
      if (options.report !== undefined) {
        await writeTaskVerifyReport(options.report, json(report), project.snapshot.root, signal);
      }
      stdout(options.format === 'json' ? json(report) : formatTaskVerifyText(report));
      return report.status === 'blocked' || report.status === 'failed' ? 1 : 0;
    }
    if (command === 'task-context' && !versionIssue) {
      const report = buildTaskContext(project, taskID, {
        ...taskOptions,
        externalDocuments: await loadTaskExternalDocuments(project, taskID, signal),
      });
      stdout(options.format === 'json' ? json(report) : formatTaskContextText(report));
      return 0;
    }
    if (command === 'task-candidates' && !versionIssue) {
      const report = buildTaskCandidates(project, options.parent ?? '', taskOptions);
      stdout(options.format === 'json' ? json(report) : formatTaskCandidatesText(report));
      return 0;
    }
    if (command === 'task-list' && !versionIssue) {
      const report = buildTaskList(project, taskOptions);
      stdout(options.format === 'json' ? json(report) : formatTaskListText(report));
      return 0;
    }
    if (command === 'task-tree' && !versionIssue) {
      const report = buildTaskTree(project, taskID, taskOptions);
      stdout(options.format === 'json' ? json(report) : formatTaskTreeText(report));
      return 0;
    }
    if (command === 'task-ready' && !versionIssue) {
      const report = buildTaskReady(project, taskID, taskOptions);
      stdout(options.format === 'json' ? json(report) : formatTaskReadyText(report));
      return report.contractComplete ? 0 : 1;
    }
    if (['task-archive', 'task-restore'].includes(command) && !versionIssue) {
      const operation = command === 'task-archive' ? 'archive' : 'restore';
      const report = await moveTask(project, taskID, operation, {
        version,
        now,
        links: {
          repositoryRoot: project.inventory.root,
          documentRoot: project.snapshot.root,
          ...(options.repositoryUrl ? { repositoryUrl: options.repositoryUrl } : {}),
          repositoryRef: options.repositoryRef?.trim() || 'main',
          inventory: project.inventory.lookup,
        },
        validateMove: (sourcePath, destinationPath) =>
          validateTaskFileMove(project.snapshot.root, sourcePath, destinationPath),
        moveFile: (sourcePath, destinationPath, moveSignal) =>
          moveTaskFile(project.snapshot.root, sourcePath, destinationPath, moveSignal),
        ...(signal ? { signal } : {}),
      });
      stdout(options.format === 'json' ? json(report) : formatTaskMoveText(report));
      return report.status === 'blocked' ? 1 : 0;
    }
    if (command === 'search' && !versionIssue) {
      const report = searchDocumentation(project, query, Number(options.limit), version);
      stdout(options.format === 'json' ? json(report) : formatSearchText(report));
      return 0;
    }
    const report = buildProjectReport(project, {
      version,
      generatedAt: now,
      sourceDirectory: project.snapshot.root,
      staleDays,
      title: options.title ?? project.config.site.title,
    });
    if (command === 'build') {
      if (report.stats.errors || (options.strict && report.stats.warnings)) {
        stdout(
          `Documents: ${report.stats.documents}\nWarnings: ${report.stats.warnings}\nErrors: ${report.stats.errors}\n`,
        );
        return 1;
      }
      const { loadStaticBundle, renderRoute } = await import('@toudocu/web-app/renderer');
      const bundle = await loadStaticBundle();
      const snapshot = createPortalSnapshot(project, {
        version,
        taskReadiness: taskOptions,
        environment: 'static',
        sourceDirectory: project.snapshot.root,
        ...(options.title ? { title: options.title } : {}),
        screenMapEnabled: !options.noScreenMap,
      });
      const files = new Map([
        ...project.links.assets,
        ...project.screenAssets,
        ...project.branding,
      ]);
      const result = await buildStaticPortal({
        outputDirectory: resolve(options.output ?? './build/project-docs'),
        protectedRoots: [project.snapshot.root],
        clean: options.clean ?? false,
        snapshot,
        report,
        locale: project.locale.locale.toLowerCase().startsWith('ru') ? 'ru' : 'en',
        assetsDirectory: bundle.assetsDirectory,
        assetManifest: bundle.manifest,
        projectFiles: files,
        ...(signal ? { signal } : {}),
        renderRoute,
      });
      stdout(
        `\nDocumentation built.\n` +
          `Directory:      ${result.outputDirectory}\n` +
          `Pages:          ${result.pages}\n` +
          `Documents:      ${report.stats.documents}\n` +
          `Roadmap tasks:  ${report.stats.totalTasks}\n` +
          `Completed:      ${report.stats.completedTasks}\n` +
          `Warnings:       ${report.stats.warnings}\n` +
          `Errors:         ${report.stats.errors}\n` +
          `Home:           ${resolve(result.outputDirectory, 'index.html')}\n`,
      );
      return 0;
    }
    if (command === 'serve') {
      const { loadStaticBundle, renderServeShell } = await import('@toudocu/web-app/renderer');
      const bundle = await loadStaticBundle();
      const locale = project.locale.locale.toLowerCase().startsWith('ru') ? 'ru' : 'en';
      const agentConsoleEnabled = isLoopbackHost(options.host);
      const snapshotOptions = {
        version,
        taskReadiness: taskOptions,
        environment: 'serve' as const,
        sourceDirectory: project.snapshot.root,
        agentConsole: agentConsoleEnabled,
        terminal: agentConsoleEnabled,
        ...(options.title ? { title: options.title } : {}),
      };
      const loadOptions = {
        staleDays,
        excludes: options.exclude,
        ...(options.repositoryRoot ? { repositoryRoot: options.repositoryRoot } : {}),
        ...(options.repositoryUrl ? { repositoryUrl: options.repositoryUrl } : {}),
        ...(options.repositoryRef ? { repositoryRef: options.repositoryRef } : {}),
      };
      const editor = new EditorWorkspace(inputDirectory, loadOptions);
      const reviewOptions = {
        repositoryRoot: project.inventory.root,
        documentationRoot: project.snapshot.root,
      };
      const agentConsole = agentConsoleEnabled
        ? new AgentConsoleRuntime({
            cwd: project.inventory.root,
            providers: [
              new CodexProvider(),
              ...((await new OpenCodeProvider().available(project.inventory.root))
                ? [new OpenCodeProvider()]
                : []),
            ],
            skill: await codexSkillSetup(project.inventory.root),
            verifyTask: async (taskID, mode, verificationSignal) => {
              const current = await loadProject(inputDirectory, {
                ...loadOptions,
                now: new Date(),
                signal: verificationSignal,
              });
              return executeTaskVerification(
                current,
                taskID,
                {
                  version,
                  strict: options.strict ?? false,
                  mode,
                  repositoryRoot: current.inventory.root,
                  pathStatus: (value, document) =>
                    documentationImpactPathStatus(current, value, document),
                  signal: verificationSignal,
                },
                mode === 'run'
                  ? (command, repositoryRoot, runSignal) =>
                      runTaskVerificationCommand(command, repositoryRoot, {
                        ...(runSignal ? { signal: runSignal } : {}),
                      })
                  : undefined,
              );
            },
          })
        : undefined;
      const brandingFiles = new Map(project.branding);
      const projectFiles = new Map([...project.links.assets, ...project.screenAssets]);
      const instance = {
        instanceId: randomUUID(),
        projectRoot: await realpath(project.inventory.root),
        documentationRoot: await realpath(project.snapshot.root),
      };
      const server = createDocumentationServer({
        instance,
        initialSnapshot: createPortalSnapshot(project, snapshotOptions),
        rebuild: async (rebuildSignal) => {
          const rebuilt = await loadProject(inputDirectory, {
            now: new Date(),
            ...loadOptions,
            signal: rebuildSignal,
          });
          const snapshot = createPortalSnapshot(rebuilt, {
            ...snapshotOptions,
            taskReadiness: {
              strict: options.strict ?? false,
              pathStatus: (value: string, document: string) =>
                documentationImpactPathStatus(rebuilt, value, document),
            },
            sourceDirectory: rebuilt.snapshot.root,
          });
          brandingFiles.clear();
          for (const [path, source] of rebuilt.branding) brandingFiles.set(path, source);
          projectFiles.clear();
          for (const [path, source] of [...rebuilt.links.assets, ...rebuilt.screenAssets]) {
            projectFiles.set(path, source);
          }
          return snapshot;
        },
        watchPaths: [
          project.snapshot.root,
          resolve(project.inventory.root, '.toudocu'),
          resolve(project.inventory.root, 'CHANGELOG.md'),
          ...project.screenAssets.values(),
          ...project.branding.values(),
        ],
        assetsDirectory: bundle.assetsDirectory,
        brandingFiles,
        projectFiles,
        html: renderServeShell({
          locale,
          title: options.title ?? project.config.site.title,
          assetManifest: bundle.manifest,
        }),
        editor: {
          list: (requestSignal) => editor.list(requestSignal),
          read: (path, requestSignal) => editor.read(path, requestSignal),
          preview: async (input, requestSignal) =>
            previewEditorDocument(
              await editor.load(requestSignal, new Map([[input.path, input.content]])),
              input.path,
            ),
          validate: async (input, requestSignal) =>
            validateEditorDocument(
              await editor.load(requestSignal, new Map([[input.path, input.content]])),
              input.path,
            ),
          save: (input, requestSignal) => editor.save(input, requestSignal),
          create: (input, requestSignal) => editor.create(input, requestSignal),
        },
        changes: (query, requestSignal) =>
          buildDocumentationChanges(inputDirectory, {
            repositoryRoot: project.inventory.root,
            ...(query.base ? { base: query.base } : {}),
            ...(query.branchBase ? { branchBase: query.branchBase } : {}),
            ...(query.target ? { target: query.target } : {}),
            ...(query.type ? { entityType: query.type } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.module ? { module: query.module } : {}),
            ...(query.task ? { taskID: query.task } : {}),
            includeRenderedHTML: true,
            signal: requestSignal,
          }),
        repositoryReview: {
          list: (query, requestSignal) =>
            listRepositoryReviewFiles(project.inventory.root, query, requestSignal),
          read: (query, requestSignal) =>
            readRepositoryReviewFile(project.inventory.root, query, requestSignal),
        },
        discussions: {
          list: () => loadReviewState(reviewOptions),
          create: (input) => createReviewDiscussion(input, reviewOptions),
          message: (id, input) => createReviewMessage(id, input, reviewOptions),
          update: (id, input) => updateReviewDiscussion(id, input, reviewOptions),
          delete: (id, input) => deleteReviewDiscussion(id, input, reviewOptions),
          updateMessage: (id, messageId, input) =>
            updateReviewMessage(id, messageId, input, reviewOptions),
          deleteMessage: (id, messageId, input) =>
            deleteReviewMessage(id, messageId, input, reviewOptions),
        },
        ...(agentConsole ? { agentConsole } : {}),
        onError: (error) => stderr(`Rebuild failed: ${argumentError(error)}\n`),
      });
      let registration: Awaited<ReturnType<typeof registerServeInstance>> | undefined;
      try {
        const address = await server.app.listen({ host: options.host, port: Number(options.port) });
        stdout(`Documentation server started at ${address}\n`);
        registration = await registerServeInstance({
          ...instance,
          url: address,
          ...(signal ? { signal } : {}),
        });
        if (signal) {
          if (!signal.aborted) {
            await new Promise<void>((resolveAbort) =>
              signal.addEventListener('abort', () => resolveAbort(), { once: true }),
            );
          }
        } else {
          await new Promise<never>(() => undefined);
        }
      } finally {
        try {
          await server.close();
        } finally {
          await registration?.unregister();
        }
      }
      return signal?.aborted ? interruptionExitCode(signal) : 0;
    }
    if (options.format === 'json') {
      stdout(json(report));
    } else {
      stdout(
        `Documents: ${report.stats.documents}\nWarnings: ${report.stats.warnings}\nErrors: ${report.stats.errors}\n`,
      );
      for (const issue of report.issues) {
        stdout(
          issue.code === 'DOCS_MIGRATION_REQUIRED'
            ? `\n${issue.code}\n\nMigration: ${issue.migration}\nFile: ${issue.documentPath}\n`
            : `[${issue.severity.toUpperCase()}] ${issue.code} ${issue.documentPath ?? ''}${issue.line ? `:${issue.line}` : ''} — ${issue.message}\n`,
        );
      }
    }
    return report.stats.errors || (options.strict && report.stats.warnings) ? 1 : 0;
  } catch (error) {
    if (signal?.aborted) {
      return interruptionExitCode(signal);
    }
    logger.error(error, { command });
    stderr(`Error: ${argumentError(error)}\n`);
    if (changesExecutionStarted) {
      return changesExitCode(error);
    }
    if (['changes', 'changes-file', 'task-changes'].includes(command)) {
      return 2;
    }
    return error instanceof ToudocuError ? error.exitCode : 1;
  }
}

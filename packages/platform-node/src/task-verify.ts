import { lstat, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import { runProcess } from './process-runner.js';
import { assertSafeOutput, isInside, PathPolicy } from './filesystem/path-policy.js';
import { writeAtomically } from './filesystem/write.js';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const TASK_OUTPUT_LIMIT = 1 << 20;

export interface TaskCommandProcessOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
}

export async function validateTaskVerifyReportPath(
  output: string,
  documentationRoot: string,
): Promise<void> {
  const target = resolve(output);
  const safeTarget = await assertSafeOutput(target, []);
  if (safeTarget !== target || isInside(resolve(documentationRoot), target)) {
    throw new ToudocuError(
      'unsafe_output',
      '--report cannot overwrite the source documentation directory',
      { path: output },
    );
  }
  try {
    if ((await lstat(target)).isDirectory()) {
      throw new ToudocuError('invalid_path', '--report must point to a file, not a directory', {
        path: output,
      });
    }
  } catch (error) {
    if (error instanceof ToudocuError) {
      throw error;
    }
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  }
}

export async function writeTaskVerifyReport(
  output: string,
  content: string,
  documentationRoot: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await validateTaskVerifyReportPath(output, documentationRoot);
  const target = resolve(output);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const policy = await PathPolicy.create(parent, { allowHidden: true });
  if (policy.root !== parent) {
    throw new ToudocuError('unsafe_output', 'report parent changed to a symbolic link', {
      path: output,
    });
  }
  await validateTaskVerifyReportPath(output, documentationRoot);
  await writeAtomically(policy, basename(target), content, { kind: 'overwrite' }, signal);
}

function timestamps(startedAt: number): {
  startedAt: string;
  finishedAt: string;
  durationMillis: number;
} {
  const finishedAt = Date.now();
  return {
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMillis: Math.max(0, finishedAt - startedAt),
  };
}

function shellCommand(command: string): { executable: string; args: string[] } {
  if (process.platform === 'win32') {
    return { executable: process.env.ComSpec ?? 'cmd.exe', args: ['/S', '/C', command] };
  }
  return { executable: 'sh', args: ['-c', command] };
}

/** Execute one task command through the platform shell with bounded tail capture. */
export async function runTaskVerificationCommand(
  command: string,
  repositoryRoot: string,
  options: TaskCommandProcessOptions = {},
) {
  const started = Date.now();
  const shell = shellCommand(command);
  try {
    const result = await runProcess(shell.executable, shell.args, {
      cwd: repositoryRoot,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxOutputBytes: TASK_OUTPUT_LIMIT,
      continueOnOutputLimit: true,
      returnOnTermination: true,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.onStdout ? { onStdout: options.onStdout } : {}),
      ...(options.onStderr ? { onStderr: options.onStderr } : {}),
    });
    if (result.terminationError?.code === 'process_aborted') {
      throw result.terminationError;
    }
    const times = timestamps(started);
    const terminationCode = result.terminationError?.code;
    let status: 'passed' | 'failed' | 'start_error' | 'timed_out';
    if (terminationCode === 'process_timeout') {
      status = 'timed_out';
    } else if (result.exitCode === null) {
      status = 'start_error';
    } else if (result.exitCode === 0) {
      status = 'passed';
    } else {
      status = 'failed';
    }
    return {
      status,
      exitCode: status === 'passed' || status === 'failed' ? result.exitCode : null,
      stdout: result.stdout.toString('utf8'),
      stderr: result.stderr.toString('utf8'),
      stdoutTruncated: result.stdoutTruncated,
      stderrTruncated: result.stderrTruncated,
      ...times,
    };
  } catch (error) {
    if (error instanceof ToudocuError && error.code === 'process_aborted') {
      throw error;
    }
    const times = timestamps(started);
    return {
      status: 'start_error' as const,
      exitCode: null,
      stdout: '',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
      ...times,
    };
  }
}

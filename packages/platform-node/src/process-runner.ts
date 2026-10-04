import { spawn } from 'node:child_process';
import type { ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Writable } from 'node:stream';
import { ToudocuError } from '@toudocu/contracts';

const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_TIMEOUT_MS = 2_147_483_647;

export interface RunProcessOptions {
  cwd?: string;
  signal?: AbortSignal;
  maxOutputBytes?: number;
  continueOnOutputLimit?: boolean;
  returnOnTermination?: boolean;
  onStdout?: (chunk: Buffer) => void;
  onStderr?: (chunk: Buffer) => void;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface ProcessResult {
  stdout: Buffer;
  stderr: Buffer;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  terminationError?: ToudocuError;
}

export interface ManagedProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  readonly exited: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>;
  stop(): Promise<void>;
}

export interface StartProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

function failure(
  code: string,
  message: string,
  executable: string,
  exitCode: number,
  details?: unknown,
  cause?: unknown,
): ToudocuError {
  const options = { exitCode, path: executable, ...(details === undefined ? {} : { details }) };
  return new ToudocuError(code, message, cause === undefined ? options : { ...options, cause });
}

function validate(executable: string, args: readonly string[], options: RunProcessOptions): number {
  if (!executable || executable.includes('\0') || args.some((arg) => arg.includes('\0')))
    throw failure(
      'invalid_process_arguments',
      'process arguments contain a NUL byte',
      executable,
      2,
    );
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 0)
    throw failure(
      'invalid_process_options',
      'maxOutputBytes must be a non-negative integer',
      executable,
      2,
    );
  if (
    options.timeoutMs !== undefined &&
    (!Number.isSafeInteger(options.timeoutMs) ||
      options.timeoutMs < 0 ||
      options.timeoutMs > MAX_TIMEOUT_MS)
  )
    throw failure(
      'invalid_process_options',
      'timeoutMs must be a non-negative integer',
      executable,
      2,
    );
  return maxOutputBytes;
}

function killWindowsTree(pid: number): Promise<void> {
  if (!Number.isInteger(pid) || pid <= 0)
    return Promise.reject(new Error('process tree has no valid PID'));
  return new Promise((resolve, reject) => {
    let done = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (error?: Error): void => {
      if (done) return;
      done = true;
      if (timeout) clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    let killer: ReturnType<typeof spawn>;
    try {
      killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      finish(new Error('failed to start taskkill'));
      return;
    }
    killer.once('error', (error) => finish(error));
    killer.once('close', (code, signal) => {
      if (code === 0) finish();
      else
        finish(new Error(`taskkill exited with code ${code ?? `signal ${signal ?? 'unknown'}`}`));
    });
    timeout = setTimeout(() => {
      try {
        killer.kill('SIGKILL');
      } catch {
        // taskkill may already have exited while its close event is pending.
      }
      finish(new Error('taskkill timed out'));
    }, 1000);
  });
}

function killUnixGroup(pid: number, signal: NodeJS.Signals): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // The child can exit between close and cleanup; there is nothing left to kill.
  }
}

function cleanupFailure(reason: ToudocuError, cleanup: unknown): ToudocuError {
  const cleanupDetails = {
    message: cleanup instanceof Error ? cleanup.message : String(cleanup),
    ...(cleanup instanceof Error && 'code' in cleanup ? { code: cleanup.code } : {}),
  };
  const details =
    reason.details && typeof reason.details === 'object' && !Array.isArray(reason.details)
      ? { ...reason.details, cleanup: cleanupDetails }
      : { originalDetails: reason.details, cleanup: cleanupDetails };
  return failure(
    reason.code,
    reason.message,
    reason.path ?? '',
    reason.exitCode,
    details,
    reason.cause,
  );
}

/** Start one long-lived executable with piped stdio and process-tree cleanup. */
export function startProcess(
  executable: string,
  args: readonly string[] = [],
  options: StartProcessOptions = {},
): ManagedProcess {
  validate(executable, args, {});
  options.signal?.throwIfAborted();
  const child = spawn(executable, [...args], {
    cwd: options.cwd,
    env: options.env === undefined ? process.env : { ...process.env, ...options.env },
    shell: false,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (!child.stdin || !child.stdout || !child.stderr)
    throw failure('process_spawn_failed', `failed to open stdio for ${executable}`, executable, 1);

  let settled = false;
  let resolveExit!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void;
  let rejectExit!: (error: unknown) => void;
  const exited = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      resolveExit = resolve;
      rejectExit = reject;
    },
  );
  const finish = (exitCode: number | null, signal: NodeJS.Signals | null): void => {
    if (settled) return;
    settled = true;
    options.signal?.removeEventListener('abort', onAbort);
    resolveExit({ exitCode, signal });
  };
  const stop = async (): Promise<void> => {
    if (settled) return;
    if (process.platform === 'win32') {
      await killWindowsTree(child.pid ?? 0);
    } else {
      killUnixGroup(child.pid ?? 0, 'SIGTERM');
      const forceKill = setTimeout(() => killUnixGroup(child.pid ?? 0, 'SIGKILL'), 1000);
      await exited.finally(() => clearTimeout(forceKill));
      return;
    }
    await exited;
  };
  const onAbort = (): void => {
    void stop().catch(() => undefined);
  };
  child.once('error', (error) => {
    if (settled) return;
    settled = true;
    options.signal?.removeEventListener('abort', onAbort);
    rejectExit(
      failure(
        'process_spawn_failed',
        `failed to run ${executable}`,
        executable,
        1,
        undefined,
        error,
      ),
    );
  });
  child.once('close', finish);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  return { stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, exited, stop };
}

/** Run one executable without a shell, retaining bounded binary stdout/stderr. */
export async function runProcess(
  executable: string,
  args: readonly string[] = [],
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  const maxOutputBytes = validate(executable, args, options);
  if (options.signal?.aborted)
    return Promise.reject(
      failure(
        'process_aborted',
        'process was aborted before it started',
        executable,
        130,
        undefined,
        options.signal.reason,
      ),
    );

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(executable, [...args], {
      cwd: options.cwd,
      env: options.env === undefined ? process.env : { ...process.env, ...options.env },
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    return Promise.reject(
      failure(
        'process_spawn_failed',
        `failed to start ${executable}`,
        executable,
        1,
        undefined,
        error,
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let settled = false;
    let stopReason: ToudocuError | undefined;
    let cleanupReason: ToudocuError | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let termination: Promise<void> | undefined;
    let stopWatched = false;

    const cleanup = (): void => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer && !termination) clearTimeout(forceKillTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const stopTree = (): void => {
      if (process.platform === 'win32') {
        termination = killWindowsTree(child.pid ?? 0);
        return;
      }
      killUnixGroup(child.pid ?? 0, 'SIGTERM');
      termination = new Promise((resolve) => {
        forceKillTimer = setTimeout(() => {
          killUnixGroup(child.pid ?? 0, 'SIGKILL');
          resolve();
        }, 100);
      });
    };
    const finish = (exitCode: number | null = null, signal: NodeJS.Signals | null = null): void => {
      if (settled) return;
      settled = true;
      cleanup();
      if (stopReason && !options.returnOnTermination) {
        reject(cleanupReason ?? stopReason);
        return;
      }
      resolve({
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
        exitCode,
        signal,
        stdoutTruncated,
        stderrTruncated,
        ...(stopReason ? { terminationError: cleanupReason ?? stopReason } : {}),
      });
    };
    const waitForStop = (): void => {
      if (stopWatched) return;
      stopWatched = true;
      const done = (): void => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish();
      };
      if (!termination) {
        done();
        return;
      }
      void termination.then(done, (error) => {
        cleanupReason = cleanupFailure(stopReason!, error);
        try {
          child.kill('SIGKILL');
        } catch {
          // The child may have exited while taskkill was being attempted.
        }
        done();
      });
    };
    const stop = (reason: ToudocuError): void => {
      if (stopReason) return;
      stopReason = reason;
      stopTree();
      waitForStop();
    };
    const onAbort = (): void =>
      stop(
        failure(
          'process_aborted',
          'process was aborted',
          executable,
          130,
          undefined,
          options.signal?.reason,
        ),
      );
    const append = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      const size = stream === 'stdout' ? stdoutBytes : stderrBytes;
      if (size + chunk.length > maxOutputBytes) {
        if (options.continueOnOutputLimit) {
          const limit = maxOutputBytes;
          const target = stream === 'stdout' ? stdout : stderr;
          const retained = Buffer.concat(target);
          const combined = Buffer.concat([retained, chunk]);
          target.length = 0;
          target.push(limit === 0 ? Buffer.alloc(0) : combined.subarray(-limit));
          if (stream === 'stdout') {
            stdoutTruncated = true;
          } else {
            stderrTruncated = true;
          }
          if (stream === 'stdout') {
            stdoutBytes += chunk.length;
          } else {
            stderrBytes += chunk.length;
          }
          return;
        }
        stop(
          failure('process_output_limit', `${stream} exceeded the output limit`, executable, 1, {
            stream,
            maxOutputBytes,
          }),
        );
        return;
      }
      if (stream === 'stdout') {
        stdout.push(chunk);
        stdoutBytes += chunk.length;
      } else {
        stderr.push(chunk);
        stderrBytes += chunk.length;
      }
    };

    const emit = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      try {
        if (stream === 'stdout') {
          options.onStdout?.(chunk);
        } else {
          options.onStderr?.(chunk);
        }
      } catch (error) {
        stop(
          failure(
            'process_stream_failed',
            `${stream} output callback failed`,
            executable,
            1,
            undefined,
            error,
          ),
        );
      }
    };
    child.stdout.on('data', (chunk: Buffer) => {
      if (!stopReason) {
        emit('stdout', chunk);
        if (!stopReason) append('stdout', chunk);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (!stopReason) {
        emit('stderr', chunk);
        if (!stopReason) append('stderr', chunk);
      }
    });
    child.once('error', (error) => {
      if (settled) return;
      if (stopReason) return;
      cleanup();
      reject(
        failure(
          'process_spawn_failed',
          `failed to run ${executable}`,
          executable,
          1,
          undefined,
          error,
        ),
      );
      settled = true;
    });
    child.once('close', (exitCode, signal) => {
      if (settled) return;
      if (stopReason) return;
      finish(exitCode, signal);
    });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    if (options.timeoutMs && options.timeoutMs > 0)
      timeoutTimer = setTimeout(
        () =>
          stop(
            failure('process_timeout', `process exceeded ${options.timeoutMs}ms`, executable, 124),
          ),
        options.timeoutMs,
      );
  });
}

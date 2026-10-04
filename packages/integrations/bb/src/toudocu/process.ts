import { spawn } from 'node:child_process';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** No shell: every query and path remains a single argument. */
export function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let failure: Error | undefined;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const stop = (error: Error) => {
      failure = error;
      child.kill();
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    const abort = () => stop(new Error('Toudocu request cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new Error('Toudocu timed out after 30 seconds.')), 30_000);
    const collect = (chunks: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 4 * 1024 * 1024)
        stop(new Error('Toudocu output exceeds 4 MiB. Narrow the request.'));
      else chunks.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => {
      failure =
        'code' in error && error.code === 'ENOENT'
          ? new Error(
              'Toudocu is not installed on this workspace host. Install the Toudocu CLI and add toudocu to PATH.',
            )
          : error;
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (failure) reject(failure);
      else
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode: code ?? 1,
        });
    });
  });
}

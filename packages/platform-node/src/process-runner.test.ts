import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { runProcess } from './process-runner.js';

const node = process.execPath;

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`process ${pid} did not exit`);
}

describe('runProcess', () => {
  test('passes argv literally and captures both streams', async () => {
    const result = await runProcess(node, [
      '-e',
      "process.stdout.write(JSON.stringify(process.argv.slice(1))); process.stderr.write('warn')",
      'a; echo unsafe',
      'ümlaut',
    ]);
    expect(result.stdout.toString()).toBe(JSON.stringify(['a; echo unsafe', 'ümlaut']));
    expect(result.stderr.toString()).toBe('warn');
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
  });

  test('reports a bounded-output failure', async () => {
    await expect(
      runProcess(node, ['-e', "process.stdout.write('x'.repeat(10000))"], { maxOutputBytes: 128 }),
    ).rejects.toMatchObject({ code: 'process_output_limit', path: node });
  });

  test('retains the tail while continuing after the task output limit', async () => {
    const result = await runProcess(
      node,
      ['-e', "process.stdout.write('a'.repeat(20)); process.stdout.write('z'.repeat(20))"],
      {
        maxOutputBytes: 16,
        continueOnOutputLimit: true,
      },
    );
    expect(result.stdout.toString()).toBe('z'.repeat(16));
    expect(result.stdoutTruncated).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test('preserves startup failure details as a typed error cause', async () => {
    const executable = '/definitely-not-a-toudocu-executable';
    const error = await runProcess(executable).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: 'process_spawn_failed', path: executable });
    expect((error as { cause?: { code?: string } }).cause?.code).toBe('ENOENT');
  });

  test('cancels a running process', async () => {
    const controller = new AbortController();
    const promise = runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 20);
    await expect(promise).rejects.toMatchObject({ code: 'process_aborted', path: node });
  });

  test('waits for forced Unix process-group cleanup', async () => {
    if (process.platform === 'win32') return;
    const directory = await mkdtemp(join(tmpdir(), 'toudocu-process-'));
    const pidFile = join(directory, 'child.pid');
    const controller = new AbortController();
    let promise: Promise<unknown> | undefined;
    let descendantPid = 0;
    try {
      const source = [
        "const {spawn}=require('node:child_process');",
        `spawn(process.execPath,['-e',${JSON.stringify(
          `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setInterval(()=>{},1000)`,
        )}],{stdio:'ignore'}); setInterval(()=>{},1000);`,
      ].join('');
      promise = runProcess(node, ['-e', source], { signal: controller.signal });
      for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
          descendantPid = Number(await readFile(pidFile, 'utf8'));
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      expect(descendantPid).toBeGreaterThan(0);
      controller.abort();
      await expect(promise).rejects.toMatchObject({ code: 'process_aborted' });
      await waitForExit(descendantPid);
    } finally {
      controller.abort();
      await promise?.catch(() => undefined);
      if (descendantPid > 0) {
        try {
          process.kill(descendantPid, 'SIGKILL');
        } catch {
          // The descendant was already cleaned up.
        }
      }
      await rm(directory, { recursive: true, force: true });
    }
  });

  test('times out a running process', async () => {
    await expect(
      runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 20 }),
    ).rejects.toMatchObject({ code: 'process_timeout', path: node });
  });

  test('can return bounded output when a process times out', async () => {
    const result = await runProcess(node, ['-e', 'setInterval(() => {}, 1000)'], {
      maxOutputBytes: 16,
      continueOnOutputLimit: true,
      returnOnTermination: true,
      timeoutMs: 100,
    });
    expect(result.terminationError?.code).toBe('process_timeout');
    expect(result.stdout.toString()).toBe('');
    expect(result.stdoutTruncated).toBe(false);
  });

  test('turns an output callback failure into a typed termination', async () => {
    const result = await runProcess(node, ['-e', "process.stdout.write('output')"], {
      returnOnTermination: true,
      onStdout: () => {
        throw new Error('sink failed');
      },
    });
    expect(result.terminationError?.code).toBe('process_stream_failed');
  });

  test('rejects timer values that Node would clamp', async () => {
    await expect(runProcess(node, [], { timeoutMs: 2_147_483_648 })).rejects.toMatchObject({
      code: 'invalid_process_options',
      path: node,
    });
  });

  test('rejects before spawning an already-aborted process', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(
      runProcess(node, ['-e', 'process.exit(1)'], { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: 'process_aborted',
      path: node,
    });
  });
});

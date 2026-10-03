import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import {
  runTaskVerificationCommand,
  validateTaskVerifyReportPath,
  writeTaskVerifyReport,
} from './task-verify.js';

function nodeCommand(source: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`;
}

test('runs a harmless shell command and streams text output when requested', async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const result = await runTaskVerificationCommand(
    nodeCommand("process.stdout.write('out'); process.stderr.write('err')"),
    process.cwd(),
    {
      onStdout: (chunk) => stdout.push(chunk.toString()),
      onStderr: (chunk) => stderr.push(chunk.toString()),
    },
  );
  expect(result.status).toBe('passed');
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBe('out');
  expect(result.stderr).toBe('err');
  expect(stdout.join('')).toBe('out');
  expect(stderr.join('')).toBe('err');
});

test('retains the final output tail when output exceeds the limit', async () => {
  const result = await runTaskVerificationCommand(
    nodeCommand("process.stdout.write('a'.repeat(2_000_000)); process.stdout.write('END')"),
    process.cwd(),
  );
  expect(result.status).toBe('passed');
  expect(result.exitCode).toBe(0);
  expect(result.stdout.length).toBeLessThanOrEqual(1 << 20);
  expect(result.stdoutTruncated).toBe(true);
  expect(result.stdout.endsWith('END')).toBe(true);
});

test('propagates an aborted command instead of converting it to start_error', async () => {
  const controller = new AbortController();
  const pending = runTaskVerificationCommand(
    nodeCommand('setInterval(() => {}, 1000)'),
    process.cwd(),
    { signal: controller.signal },
  );
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'process_aborted' });
});

test('reports a timeout without rejecting the task command', async () => {
  const result = await runTaskVerificationCommand(
    nodeCommand('setInterval(() => {}, 1000)'),
    process.cwd(),
    { timeoutMs: 100 },
  );
  expect(result.status).toBe('timed_out');
  expect(result.exitCode).toBeNull();
});

test('reports a nonzero command as failed while retaining its exit code', async () => {
  const result = await runTaskVerificationCommand(
    nodeCommand("process.stderr.write('bad'); process.exit(7)"),
    process.cwd(),
  );
  expect(result.status).toBe('failed');
  expect(result.exitCode).toBe(7);
  expect(result.stderr).toBe('bad');
});

test('writes reports atomically only outside the documentation root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-report-'));
  const docs = join(root, 'docs');
  const outside = join(root, 'reports', 'verify.json');
  try {
    await mkdir(docs, { recursive: true });
    await writeTaskVerifyReport(outside, '{"status":"planned"}\n', docs);
    expect(await readFile(outside, 'utf8')).toBe('{"status":"planned"}\n');
    await expect(
      validateTaskVerifyReportPath(join(docs, 'verify.json'), docs),
    ).rejects.toMatchObject({
      code: 'unsafe_output',
      message: '--report cannot overwrite the source documentation directory',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

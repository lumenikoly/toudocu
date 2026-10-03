import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ProjectTerminal } from './session.js';

test('stops the platform shell and rejects operations after cleanup', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'toudocu-pty-'));
  const terminal = new ProjectTerminal(cwd);
  try {
    terminal.start();
    expect(terminal.snapshot().active).toBe(true);
    terminal.resize(80, 24);
    await terminal.close();
    expect(terminal.snapshot().active).toBe(false);
    expect(() => terminal.write('echo late\r')).toThrow(/not active/u);
  } finally {
    await terminal.close();
    await rm(cwd, { recursive: true, force: true });
  }
});

test('does not launch after cancellation', () => {
  const controller = new AbortController();
  controller.abort();
  const terminal = new ProjectTerminal(process.cwd());
  expect(() => terminal.start(controller.signal)).toThrow();
  expect(terminal.snapshot().active).toBe(false);
});

test('stops a running shell when its launch signal is cancelled', async () => {
  const controller = new AbortController();
  const terminal = new ProjectTerminal(process.cwd());
  terminal.start(controller.signal);
  controller.abort();
  await waitUntil(() => !terminal.snapshot().active);
  expect(terminal.snapshot().active).toBe(false);
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('terminal did not stop after cancellation');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

import { expect, test } from 'vitest';
import { mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { PortalState } from './state.js';
import { watchProject } from './watcher.js';

const snapshot = (name: string) => ({ project: { title: name } }) as PortalSnapshotV1;

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

test('rebuilds never overlap and a failed rebuild keeps the last good revision', async () => {
  const gates = [deferred(), deferred()];
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  const state = new PortalState(snapshot('old'), async () => {
    const call = calls++;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await gates[call]?.promise;
    active -= 1;
    if (call === 1) throw new Error('invalid project');
    return snapshot('new');
  });

  const first = state.requestRebuild();
  state.requestRebuild();
  state.requestRebuild();
  await Promise.resolve();
  expect(calls).toBe(1);
  gates[0]?.resolve();
  await first;
  expect(state.current).toMatchObject({ revision: 2, rebuilding: false });

  const failed = state.requestRebuild();
  await Promise.resolve();
  gates[1]?.resolve();
  await failed;
  expect(maximumActive).toBe(1);
  expect(state.current).toMatchObject({ revision: 2, lastError: 'invalid project' });
  expect(state.current.snapshot.project.title).toBe('new');
});

test('watcher coalesces an atomic rename burst', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-watch-'));
  const changed = deferred();
  let rebuilds = 0;
  const watcher = watchProject(
    [root],
    () => {
      rebuilds += 1;
      changed.resolve();
    },
    (error) => changed.reject(error),
    20,
  );
  try {
    await watcher.ready;
    const temporary = join(root, 'document.md.tmp');
    await writeFile(temporary, '# changed\n');
    await rename(temporary, join(root, 'document.md'));
    await changed.promise;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(rebuilds).toBe(1);
  } finally {
    await watcher.close();
    await rm(root, { recursive: true, force: true });
  }
});

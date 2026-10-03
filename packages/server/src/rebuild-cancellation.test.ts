import { expect, test } from 'vitest';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { PortalState } from './state.js';

const snapshot = (name: string) => ({ project: { title: name } }) as PortalSnapshotV1;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('closing aborts an active rebuild without publishing it', async () => {
  let rebuildSignal: AbortSignal | undefined;
  const started = deferred();
  const state = new PortalState(snapshot('old'), async (signal) => {
    rebuildSignal = signal;
    started.resolve();
    await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()));
    signal.throwIfAborted();
    return snapshot('new');
  });

  void state.requestRebuild();
  await started.promise;
  await state.close();

  expect(rebuildSignal?.aborted).toBe(true);
  expect(state.current).toMatchObject({ revision: 1, rebuilding: false });
  expect(state.current.snapshot.project.title).toBe('old');
});

test('request cancellation stops waiting without cancelling the shared rebuild', async () => {
  const finish = deferred();
  const state = new PortalState(snapshot('old'), async () => {
    await finish.promise;
    return snapshot('new');
  });
  const controller = new AbortController();
  const request = state.requestRebuild(controller.signal);
  const shared = state.requestRebuild();
  controller.abort(new Error('client disconnected'));

  await expect(request).rejects.toThrow('client disconnected');
  finish.resolve();
  await shared;
  expect(state.current.snapshot.project.title).toBe('new');
  await state.close();
});

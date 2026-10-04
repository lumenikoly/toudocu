import { afterEach, expect, test } from 'vitest';
import { installSignalHandlers } from './signals.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

test('signal handlers abort once and remove both listeners', () => {
  const controller = new AbortController();
  const listeners = new Map<NodeJS.Signals, () => void>();
  const target = {
    once(signal: NodeJS.Signals, listener: () => void): void {
      listeners.set(signal, listener);
    },
    removeListener(signal: NodeJS.Signals): void {
      listeners.delete(signal);
    },
  };
  const cleanup = installSignalHandlers(controller, target);
  cleanups.push(cleanup);

  expect(listeners.size).toBe(2);
  listeners.get('SIGINT')?.();

  expect(controller.signal.aborted).toBe(true);
  expect(controller.signal.reason).toMatchObject({ signal: 'SIGINT' });
  cleanup();
  expect(listeners.size).toBe(0);
});

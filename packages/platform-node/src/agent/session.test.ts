import { expect, test, vi } from 'vitest';
import type { AgentEvent, AgentLaunch, AgentSettings } from '@toudocu/contracts';
import { AgentConsoleRuntime } from './session.js';
import type { AgentProvider, AgentProviderSession } from './provider.js';

test('Agent Console keeps its session without UI subscribers and closes the provider', async () => {
  const listeners = new Set<(event: AgentEvent) => void>();
  const stop = vi.fn(async () => undefined);
  const turns: string[] = [];
  const settings = (launch: AgentLaunch): AgentSettings => ({
    launch,
    effectiveAccess: { known: false, unrestricted: false },
    capabilities: { steering: true, interrupt: true, approvals: true, readOnlyTurns: true },
  });
  const provider: AgentProvider = {
    name: 'fake',
    capabilities: { steering: true, interrupt: true, approvals: true, readOnlyTurns: true },
    start: async (launch) => {
      const session: AgentProviderSession = {
        settings: settings(launch),
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        startTurn: async (text) => {
          turns.push(text);
          return `turn-${turns.length}`;
        },
        steer: async () => undefined,
        interrupt: async () => undefined,
        approve: async () => undefined,
        stop,
      };
      return session;
    },
  };
  const runtime = new AgentConsoleRuntime({
    cwd: process.cwd(),
    providers: [provider],
    skill: { state: 'not-installed', diagnostic: 'optional' },
  });

  await runtime.start({ taskID: 'TASK-1' });
  expect(runtime.snapshot()).toMatchObject({ active: true, status: 'running' });
  expect(turns[0]).toContain('$toudocu Continue TASK-1');

  listeners.forEach((listener) =>
    listener({ type: 'turn_completed', turnID: 'turn-1', status: 'completed' }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(runtime.snapshot()).toMatchObject({ active: true, status: 'idle' });

  await runtime.close();
  expect(stop).toHaveBeenCalledOnce();
});

test('stops a provider when the initial task turn fails', async () => {
  const stop = vi.fn(async () => undefined);
  const provider = fakeProvider({
    stop,
    startTurn: async () => {
      throw new Error('turn failed');
    },
  });
  const runtime = testRuntime(provider);

  await expect(runtime.start({ taskID: 'TASK-1' })).rejects.toThrow('turn failed');
  expect(stop).toHaveBeenCalledOnce();
  expect(runtime.snapshot().active).toBe(false);
});

test('keeps a failed session when provider shutdown is unconfirmed', async () => {
  const provider = fakeProvider({
    stop: async () => {
      throw new Error('still running');
    },
    startTurn: async () => 'turn-1',
  });
  const runtime = testRuntime(provider);

  await runtime.start({});
  await expect(runtime.close()).rejects.toThrow('still running');
  expect(runtime.snapshot()).toMatchObject({
    active: true,
    status: 'failed',
    failure: 'provider_stop_unconfirmed',
  });
});

test('rolls back a session that starts after cancellation', async () => {
  let finishStart!: (session: AgentProviderSession) => void;
  let markStarted!: () => void;
  const providerStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const stop = vi.fn(async () => undefined);
  const provider: AgentProvider = {
    ...fakeProvider({ stop, startTurn: async () => 'turn-1' }),
    start: () =>
      new Promise<AgentProviderSession>((resolve) => {
        markStarted();
        finishStart = resolve;
      }),
  };
  const runtime = testRuntime(provider);
  const controller = new AbortController();
  const start = runtime.start({}, controller.signal);
  await providerStarted;
  controller.abort();
  finishStart(
    await fakeProvider({ stop, startTurn: async () => 'turn-1' }).start({
      cwd: process.cwd(),
      provider: 'fake',
      preset: 'default',
    }),
  );

  await expect(start).rejects.toThrow();
  expect(stop).toHaveBeenCalledOnce();
  expect(runtime.snapshot().active).toBe(false);
});

test('cleanup confirms provider shutdown before clearing a failed session', async () => {
  const stop = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('still running'))
    .mockResolvedValueOnce(undefined);
  const runtime = testRuntime(fakeProvider({ stop, startTurn: async () => 'turn-1' }));

  await runtime.start({});
  await expect(runtime.stop(false)).rejects.toThrow('still running');
  await runtime.cleanup();

  expect(stop).toHaveBeenCalledTimes(2);
  expect(runtime.snapshot().active).toBe(false);
});

test('rolls back a resumed session that completes after cancellation', async () => {
  let finishResume!: (session: AgentProviderSession) => void;
  let markStarted!: () => void;
  const resumeStarted = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const stop = vi.fn(async () => undefined);
  const base = fakeProvider({ stop, startTurn: async () => 'turn-1' });
  const provider: AgentProvider = {
    ...base,
    resume: () =>
      new Promise<AgentProviderSession>((resolve) => {
        markStarted();
        finishResume = resolve;
      }),
  };
  const runtime = testRuntime(provider);
  const controller = new AbortController();
  const resume = runtime.resume({ threadID: 'thread-1', provider: 'fake' }, controller.signal);
  await resumeStarted;
  controller.abort();
  finishResume(await base.start({ cwd: process.cwd(), provider: 'fake', preset: 'default' }));

  await expect(resume).rejects.toThrow();
  expect(stop).toHaveBeenCalledOnce();
  expect(runtime.snapshot().active).toBe(false);
});

function fakeProvider(options: {
  stop(): Promise<void>;
  startTurn(text: string): Promise<string>;
}): AgentProvider {
  return {
    name: 'fake',
    capabilities: { steering: false, interrupt: true, approvals: false, readOnlyTurns: false },
    start: async (launch) => ({
      settings: {
        launch,
        effectiveAccess: { known: false, unrestricted: false },
        capabilities: {
          steering: false,
          interrupt: true,
          approvals: false,
          readOnlyTurns: false,
        },
      },
      subscribe: () => () => undefined,
      startTurn: options.startTurn,
      steer: async () => undefined,
      interrupt: async () => undefined,
      approve: async () => undefined,
      stop: options.stop,
    }),
  };
}

function testRuntime(provider: AgentProvider): AgentConsoleRuntime {
  return new AgentConsoleRuntime({
    cwd: process.cwd(),
    providers: [provider],
    skill: { state: 'installed', diagnostic: 'ready' },
    preferenceStore: {
      load: async () => ({ launchPreset: 'default' }),
      save: async () => undefined,
    },
  });
}

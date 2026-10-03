import { expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentConsoleService } from './server.js';
import type { AgentConsoleState, AgentSessionState, PortalSnapshotV1 } from '@toudocu/contracts';
import { createDocumentationServer } from './server.js';

const terminal = { available: true, active: false };
const sessionState: AgentSessionState = { active: false, terminal };
const consoleState: AgentConsoleState = {
  schemaVersion: 1,
  setup: {
    availableProviders: ['test'],
    selectedProvider: 'test',
    preference: { launchPreset: 'default' },
    skill: { state: 'installed', diagnostic: 'ready' },
  },
  state: sessionState,
};

function fakeRuntime() {
  const close = vi.fn(async () => undefined);
  const start = vi.fn(async (_input: unknown, signal?: AbortSignal) => signal?.throwIfAborted());
  const runtime: AgentConsoleService = {
    setup: () => consoleState,
    snapshot: () => sessionState,
    subscribe: () => () => undefined,
    start,
    send: async () => undefined,
    interrupt: async () => undefined,
    approve: async () => undefined,
    cancelPending: async () => undefined,
    stop: async () => undefined,
    cleanup: async () => undefined,
    savePreference: async () => undefined,
    history: async () => [],
    resume: async () => undefined,
    startTerminal: async () => undefined,
    stopTerminal: async () => undefined,
    writeTerminal: () => undefined,
    resizeTerminal: () => undefined,
    interruptTerminal: () => undefined,
    close,
  };
  return { runtime, close, start };
}

test('Agent Console is same-origin only and closes with serve', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-agent-assets-'));
  const agent = fakeRuntime();
  const snapshot = { project: { title: 'test' } } as PortalSnapshotV1;
  const server = createDocumentationServer({
    initialSnapshot: snapshot,
    rebuild: async () => snapshot,
    assetsDirectory: assets,
    html: '<div id="root"></div>',
    agentConsole: agent.runtime,
  });
  try {
    await server.app.ready();
    const denied = await server.app.inject({ method: 'GET', url: '/_toudocu/api/agent-console/' });
    expect(denied.statusCode).toBe(403);

    const state = await server.app.inject({
      method: 'GET',
      url: '/_toudocu/api/agent-console/',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(state.json()).toEqual(consoleState);

    const rebound = await server.app.inject({
      method: 'GET',
      url: '/_toudocu/api/agent-console/',
      headers: { host: 'attacker.example', 'sec-fetch-site': 'same-origin' },
    });
    expect(rebound.statusCode).toBe(403);

    for (const host of ['127.evil.example', 'evil@localhost']) {
      const bypass = await server.app.inject({
        method: 'GET',
        url: '/_toudocu/api/agent-console/',
        headers: { host, 'sec-fetch-site': 'same-origin' },
      });
      expect(bypass.statusCode).toBe(403);
    }

    const socket = await server.app.injectWS('/_toudocu/api/agent-console/ws', {
      headers: { host: 'localhost', 'sec-fetch-site': 'same-origin' },
    });
    expect(socket.readyState).toBe(1);
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()));
    socket.terminate();
    await closed;
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
  }
  expect(agent.close).toHaveBeenCalledOnce();
});

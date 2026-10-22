import { expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TerminalService } from './server.js';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { createDocumentationServer } from './server.js';

const terminal = { available: true, active: false };

function fakeRuntime() {
  const close = vi.fn(async () => undefined);
  const start = vi.fn(async (signal?: AbortSignal) => signal?.throwIfAborted());
  const runtime: TerminalService = {
    snapshot: () => terminal,
    subscribe: () => () => undefined,
    start,
    stop: async () => undefined,
    write: vi.fn(),
    resize: vi.fn(),
    interrupt: vi.fn(),
    close,
  };
  return { runtime, close, start };
}

test('Project Terminal is same-origin only and closes with serve', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-terminal-assets-'));
  const runtime = fakeRuntime();
  const snapshot = { project: { title: 'test' } } as PortalSnapshotV1;
  const server = createDocumentationServer({
    initialSnapshot: snapshot,
    rebuild: async () => snapshot,
    assetsDirectory: assets,
    html: '<div id="root"></div>',
    terminal: runtime.runtime,
  });
  try {
    await server.app.ready();
    const denied = await server.app.inject({ method: 'GET', url: '/_toudocu/api/terminal/' });
    expect(denied.statusCode).toBe(403);

    const state = await server.app.inject({
      method: 'GET',
      url: '/_toudocu/api/terminal/',
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(state.json()).toEqual(terminal);

    const rebound = await server.app.inject({
      method: 'GET',
      url: '/_toudocu/api/terminal/',
      headers: { host: 'attacker.example', 'sec-fetch-site': 'same-origin' },
    });
    expect(rebound.statusCode).toBe(403);

    for (const host of ['127.evil.example', 'evil@localhost']) {
      const bypass = await server.app.inject({
        method: 'GET',
        url: '/_toudocu/api/terminal/',
        headers: { host, 'sec-fetch-site': 'same-origin' },
      });
      expect(bypass.statusCode).toBe(403);
    }

    const removed = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/agent-console/start',
      payload: {},
    });
    expect(removed.statusCode).toBe(404);
    const noHeader = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/terminal/start',
      payload: {},
      headers: { 'sec-fetch-site': 'same-origin' },
    });
    expect(noHeader.statusCode).toBe(400);
    const start = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/terminal/start',
      payload: {},
      headers: { 'sec-fetch-site': 'same-origin', 'x-toudocu-action': 'project-terminal-start' },
    });
    expect(start.statusCode).toBe(200);
    expect(runtime.start).toHaveBeenCalledOnce();
    const untrusted = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/terminal/start',
      payload: {},
      headers: { origin: 'http://attacker.example', 'x-toudocu-action': 'project-terminal-start' },
    });
    expect(untrusted.statusCode).toBe(403);
    expect(runtime.start).toHaveBeenCalledOnce();

    const socket = await server.app.injectWS('/_toudocu/api/terminal/ws', {
      headers: { host: 'localhost', 'sec-fetch-site': 'same-origin' },
    });
    expect(socket.readyState).toBe(1);
    socket.send(JSON.stringify({ action: 'terminal-input', text: 'pwd\r' }));
    await vi.waitFor(() => expect(runtime.runtime.write).toHaveBeenCalledWith('pwd\r'));
    socket.send(JSON.stringify({ action: 'terminal-resize', columns: 100, rows: 40 }));
    await vi.waitFor(() => expect(runtime.runtime.resize).toHaveBeenCalledWith(100, 40));
    const closed = new Promise<number>((resolve) => socket.once('close', (code) => resolve(code)));
    socket.send(JSON.stringify({ action: 'message', text: 'Start an agent' }));
    expect(await closed).toBe(1008);
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
  }
  expect(runtime.close).toHaveBeenCalledOnce();
});

import { expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { createDocumentationServer } from './server.js';

const snapshot = (name: string) => ({ project: { title: name } }) as PortalSnapshotV1;

test('serves one snapshot through the API and the SPA fallback', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-assets-'));
  await writeFile(join(assets, 'app.js'), 'export {};');
  const server = createDocumentationServer({
    initialSnapshot: snapshot('old'),
    rebuild: async () => snapshot('new'),
    assetsDirectory: assets,
    html: '<!doctype html><div id="root"></div>',
  });
  try {
    await server.app.ready();
    const initial = await server.app.inject({ method: 'GET', url: '/_toudocu/api/portal' });
    expect(initial.headers['x-toudocu-revision']).toBe('1');
    expect(initial.json()).toMatchObject({ project: { title: 'old' } });

    const denied = await server.app.inject({ method: 'POST', url: '/_toudocu/api/rebuild' });
    expect(denied.statusCode).toBe(400);
    const forbidden = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/rebuild',
      headers: { 'x-toudocu-action': 'rebuild' },
    });
    expect(forbidden.statusCode).toBe(403);
    const wrongScheme = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/rebuild',
      headers: {
        'x-toudocu-action': 'rebuild',
        origin: 'https://localhost:80',
        'sec-fetch-site': 'same-origin',
      },
    });
    expect(wrongScheme.statusCode).toBe(403);
    const conflictingMetadata = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/rebuild',
      headers: {
        'x-toudocu-action': 'rebuild',
        origin: 'http://localhost:80',
        'sec-fetch-site': 'cross-site',
      },
    });
    expect(conflictingMetadata.statusCode).toBe(403);
    const rebuilt = await server.app.inject({
      method: 'POST',
      url: '/_toudocu/api/rebuild',
      headers: { 'x-toudocu-action': 'rebuild', 'sec-fetch-site': 'same-origin' },
    });
    expect(rebuilt.json()).toMatchObject({ revision: 2, rebuilding: false });
    const current = await server.app.inject({ method: 'GET', url: '/_toudocu/api/portal' });
    expect(current.headers['x-toudocu-revision']).toBe('2');
    expect(current.json()).toMatchObject({ project: { title: 'new' } });

    expect((await server.app.inject({ method: 'GET', url: '/guides/start' })).body).toContain(
      'id="root"',
    );
    expect((await server.app.inject({ method: 'GET', url: '/assets/app.js' })).body).toBe(
      'export {};',
    );
    expect(
      (await server.app.inject({ method: 'GET', url: '/_toudocu/api/unknown' })).statusCode,
    ).toBe(404);
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
  }
});

test('client cancellation releases the request without cancelling the shared rebuild', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-assets-'));
  let finish!: () => void;
  let started!: () => void;
  const rebuildStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const rebuildFinished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const server = createDocumentationServer({
    initialSnapshot: snapshot('old'),
    rebuild: async () => {
      started();
      await rebuildFinished;
      return snapshot('new');
    },
    assetsDirectory: assets,
    html: '<div id="root"></div>',
  });
  try {
    const address = await server.app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const request = fetch(`${address}/_toudocu/api/rebuild`, {
      method: 'POST',
      headers: {
        'x-toudocu-action': 'rebuild',
        'sec-fetch-site': 'same-origin',
      },
      signal: controller.signal,
    });
    await rebuildStarted;
    controller.abort();
    await expect(request).rejects.toThrow();

    finish();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(server.state.current).toMatchObject({ revision: 2, rebuilding: false });
    expect(server.state.current.snapshot.project.title).toBe('new');
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
  }
});

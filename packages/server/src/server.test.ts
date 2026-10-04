import { expect, test } from 'vitest';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EditorFileResponse, PortalSnapshotV1 } from '@toudocu/contracts';
import { createDocumentationServer } from './server.js';

const snapshot = (name: string) => ({ project: { title: name } }) as PortalSnapshotV1;

const editorFile: EditorFileResponse = {
  schemaVersion: 1,
  revision: 'test-revision',
  file: {
    path: 'docs/example.md',
    language: 'markdown',
    size: 18,
    digest: 'digest',
    content: '# Source document\n',
    diagnostics: [],
  },
};

test('serves only registered branding files and rejects symlink escapes', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-branding-'));
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-private-'));
  await writeFile(join(assets, 'logo.svg'), '<svg/>');
  await writeFile(join(outside, 'private.svg'), 'private');
  await symlink(join(outside, 'private.svg'), join(assets, 'escaped.svg'));
  const server = createDocumentationServer({
    initialSnapshot: snapshot('branding'),
    rebuild: async () => snapshot('branding'),
    assetsDirectory: assets,
    brandingFiles: new Map([
      ['assets/branding/logo.svg', join(assets, 'logo.svg')],
      ['assets/branding/escaped.svg', join(assets, 'escaped.svg')],
    ]),
    html: '<div id="root"></div>',
  });
  try {
    const logo = await server.app.inject('/assets/branding/logo.svg');
    expect(logo.body).toBe('<svg/>');
    expect(logo.headers['content-type']).toContain('image/svg+xml');
    expect((await server.app.inject('/assets/branding/private.svg')).statusCode).toBe(404);
    expect((await server.app.inject('/assets/branding/escaped.svg')).statusCode).toBe(404);
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('serves only registered project previews and rejects mapped symlink escapes', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-preview-'));
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-preview-private-'));
  await writeFile(join(assets, 'site-screen-map.png'), 'preview-image');
  await writeFile(join(outside, 'private.png'), 'private');
  await symlink(join(outside, 'private.png'), join(assets, 'escaped.png'));
  const preview = join(assets, 'site-screen-map.png');
  const server = createDocumentationServer({
    initialSnapshot: snapshot('previews'),
    rebuild: async () => snapshot('previews'),
    assetsDirectory: assets,
    projectFiles: new Map([
      ['assets/screens/site-screen-map.png', preview],
      ['screens/previews/site-screen-map.png', preview],
      ['assets/screens/escaped.png', join(assets, 'escaped.png')],
    ]),
    html: '<div id="root"></div>',
  });
  try {
    for (const url of [
      '/assets/screens/site-screen-map.png',
      '/screens/previews/site-screen-map.png',
    ]) {
      const response = await server.app.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('preview-image');
    }
    expect((await server.app.inject('/assets/screens/unmapped.png')).statusCode).toBe(404);
    expect((await server.app.inject('/assets/screens/escaped.png')).statusCode).toBe(404);
  } finally {
    await server.close();
    await rm(assets, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

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

test('serves raw editor files as plain text', async () => {
  const assets = await mkdtemp(join(tmpdir(), 'toudocu-editor-'));
  const server = createDocumentationServer({
    initialSnapshot: snapshot('editor'),
    rebuild: async () => snapshot('editor'),
    assetsDirectory: assets,
    html: '<div id="root"></div>',
    editor: {
      list: async () => ({
        schemaVersion: 1,
        revision: editorFile.revision,
        files: [],
        templates: [],
      }),
      read: async () => editorFile,
      preview: async () => ({
        schemaVersion: 1,
        path: editorFile.file.path,
        html: '',
        diagnostics: [],
      }),
      validate: async () => ({ schemaVersion: 1, path: editorFile.file.path, diagnostics: [] }),
      save: async () => undefined,
      create: async () => editorFile.file.path,
    },
  });
  try {
    const response = await server.app.inject({
      method: 'GET',
      url: '/_toudocu/api/editor/file?raw=1&path=docs%2Fexample.md',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toBe(editorFile.file.content);
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

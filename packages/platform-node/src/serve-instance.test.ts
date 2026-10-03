import { expect, test } from 'vitest';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverServeInstance, registerServeInstance } from './serve-instance.js';

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test('registration discovers only the exact project and documentation roots', async () => {
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-serve-instance-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'toudocu-project-'));
  const worktreeRoot = await mkdtemp(join(tmpdir(), 'toudocu-worktree-'));
  const documentationRoot = join(projectRoot, 'docs');
  const worktreeDocumentationRoot = join(worktreeRoot, 'docs');
  const otherDocumentationRoot = join(projectRoot, 'other-docs');
  await Promise.all(
    [documentationRoot, worktreeDocumentationRoot, otherDocumentationRoot].map((path) =>
      mkdir(path),
    ),
  );
  const server = createServer((request, response) => {
    if (request.url === '/_toudocu/api/instance') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          instanceId: '11111111-1111-4111-8111-111111111111',
          projectRoot,
          documentationRoot,
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  const url = await listen(server);
  let unregister: (() => Promise<void>) | undefined;
  try {
    const registered = await registerServeInstance({
      projectRoot,
      documentationRoot,
      url,
      instanceId: '11111111-1111-4111-8111-111111111111',
      stateHome,
    });
    unregister = registered.unregister;
    expect(
      await discoverServeInstance({
        projectRoot,
        documentationRoot,
        stateHome,
      }),
    ).toEqual(registered.workspace);
    expect(
      await discoverServeInstance({
        projectRoot: worktreeRoot,
        documentationRoot: worktreeDocumentationRoot,
        stateHome,
      }),
    ).toBeNull();
    expect(
      await discoverServeInstance({
        projectRoot,
        documentationRoot: otherDocumentationRoot,
        stateHome,
      }),
    ).toBeNull();
  } finally {
    await unregister?.();
    await close(server);
    await rm(stateHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
    await rm(worktreeRoot, { recursive: true, force: true });
  }
});

test('discovery rejects a stale registration after its server closes', async () => {
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-serve-instance-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'toudocu-project-'));
  const documentationRoot = join(projectRoot, 'docs');
  await mkdir(documentationRoot);
  const server = createServer((request, response) => {
    if (request.url === '/_toudocu/api/instance') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          instanceId: '22222222-2222-4222-8222-222222222222',
          projectRoot,
          documentationRoot,
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  const url = await listen(server);
  try {
    const registration = await registerServeInstance({
      projectRoot,
      documentationRoot,
      url,
      instanceId: '22222222-2222-4222-8222-222222222222',
      stateHome,
    });
    expect(
      await discoverServeInstance({
        projectRoot,
        documentationRoot,
        stateHome,
      }),
    ).toEqual(registration.workspace);
    await close(server);
    expect(
      await discoverServeInstance({
        projectRoot,
        documentationRoot,
        stateHome,
      }),
    ).toBeNull();
    await registration.unregister();
  } finally {
    await close(server);
    await rm(stateHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('unregister removes its own record', async () => {
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-serve-instance-'));
  const projectRoot = await mkdtemp(join(tmpdir(), 'toudocu-project-'));
  const documentationRoot = join(projectRoot, 'docs');
  await mkdir(documentationRoot);
  const server = createServer((request, response) => {
    if (request.url === '/_toudocu/api/instance') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          instanceId: '33333333-3333-4333-8333-333333333333',
          projectRoot,
          documentationRoot,
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
  const url = await listen(server);
  try {
    const registration = await registerServeInstance({
      projectRoot,
      documentationRoot,
      url,
      instanceId: '33333333-3333-4333-8333-333333333333',
      stateHome,
    });
    await registration.unregister();
    expect(
      await discoverServeInstance({
        projectRoot,
        documentationRoot,
        stateHome,
      }),
    ).toBeNull();
  } finally {
    await close(server);
    await rm(stateHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

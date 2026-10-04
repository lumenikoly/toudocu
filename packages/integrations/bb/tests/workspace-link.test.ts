import { afterEach, expect, test, vi } from 'vitest';
import { reachableWorkspace } from '../src/toudocu/workspace-link.js';

const workspace = {
  instanceId: '11111111-1111-4111-8111-111111111111',
  projectRoot: '/repo',
  documentationRoot: '/repo/docs',
  url: 'http://127.0.0.1:4567',
};

afterEach(() => vi.unstubAllGlobals());

test('reachableWorkspace requires the local server to report the same identity', async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          instanceId: workspace.instanceId,
          projectRoot: workspace.projectRoot,
          documentationRoot: workspace.documentationRoot,
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal('fetch', fetch);
  await expect(reachableWorkspace(workspace)).resolves.toBe(true);
  expect(fetch.mock.calls[0]?.[0]).toEqual(new URL('http://127.0.0.1:4567/_toudocu/api/instance'));
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'omit', cache: 'no-store' });

  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            instanceId: '22222222-2222-4222-8222-222222222222',
            projectRoot: workspace.projectRoot,
            documentationRoot: workspace.documentationRoot,
          }),
          { status: 200 },
        ),
    ),
  );
  await expect(reachableWorkspace(workspace)).resolves.toBe(false);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('unreachable');
    }),
  );
  await expect(reachableWorkspace(workspace)).resolves.toBe(false);
});

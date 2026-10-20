// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServeApiDataSource, StaticBrowserDataSource } from '../app/data.js';
import { portalFixture } from './fixture.js';

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('portal data sources', () => {
  it.each([
    [
      'https://example.com/index.html',
      '_toudocu/portal.json',
      'https://example.com/_toudocu/portal.json',
    ],
    [
      'https://example.com/project/modules/deep/page.html',
      '../../_toudocu/portal.json',
      'https://example.com/project/_toudocu/portal.json',
    ],
  ])('loads shared static data relative to %s', async (base, path, endpoint) => {
    document.head.innerHTML = `<base href="${base}">`;
    document.body.innerHTML = `<script id="toudocu-portal-data" type="application/json" data-src="${path}"></script>`;
    const request = vi.fn<typeof fetch>(async () => Response.json(portalFixture()));
    await expect(new StaticBrowserDataSource(document, request).load()).resolves.toMatchObject({
      schemaVersion: 1,
      kind: 'portal',
    });
    expect(request).toHaveBeenCalledExactlyOnceWith(endpoint, {
      headers: { accept: 'application/json' },
    });
  });

  it('rejects failed, malformed and invalid shared snapshots', async () => {
    document.body.innerHTML =
      '<script id="toudocu-portal-data" data-src="_toudocu/portal.json"></script>';
    for (const response of [
      new Response('', { status: 404 }),
      new Response('not json'),
      Response.json({ schemaVersion: 999 }),
    ]) {
      const source = new StaticBrowserDataSource(document, async () => response);
      await expect(source.load()).rejects.toThrow('Failed to load static portal snapshot');
    }
  });

  it('validates embedded static data', async () => {
    document.body.innerHTML = `<script id="toudocu-portal-data" type="application/json">${JSON.stringify(portalFixture())}</script>`;
    await expect(new StaticBrowserDataSource(document).load()).resolves.toMatchObject({
      schemaVersion: 1,
      kind: 'portal',
    });
  });

  it('validates serve responses and reports HTTP failures', async () => {
    const ok = new ServeApiDataSource(
      '/portal',
      async () =>
        new Response(JSON.stringify(portalFixture('serve')), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await expect(ok.load()).resolves.toMatchObject({ capabilities: { mode: 'serve' } });

    const failed = new ServeApiDataSource('/portal', async () => new Response('', { status: 503 }));
    await expect(failed.load()).rejects.toThrow('status 503');
  });
});

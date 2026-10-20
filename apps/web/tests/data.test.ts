// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServeApiDataSource, StaticBrowserDataSource } from '../app/data.js';
import { portalFixture } from './fixture.js';

function staticFixture(endpoint: string) {
  const { pages, ...shared } = portalFixture();
  const index = { ...shared, kind: 'static-portal-index', pageDependencies: {} };
  const request = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url === endpoint) return Response.json(index);
    const search = pages.find((page) => page.kind === 'search');
    if (url === new URL('search.json', endpoint).href) return Response.json(search?.entries);
    const page = pages.find(
      (candidate) =>
        url ===
        new URL(`pages/${encodeURIComponent(encodeURIComponent(candidate.pageId))}.json`, endpoint)
          .href,
    );
    return page ? Response.json(page) : new Response('', { status: 404 });
  });
  return { index, pages, request };
}

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
  ])(
    'loads only the index and current page relative to %s, then caches lazy search',
    async (base, path, endpoint) => {
      document.head.innerHTML = `<base href="${base}">`;
      const fixture = staticFixture(endpoint);
      const task = fixture.pages.find((page) => page.kind === 'task');
      if (!task) throw new Error('task fixture is missing');
      document.body.innerHTML = `<script id="toudocu-portal-data" data-src="${path}" data-page="${task.pageId}"></script>`;
      const source = new StaticBrowserDataSource(document, fixture.request);
      const snapshot = await source.load();
      expect(snapshot.pages).toEqual([task]);
      expect(snapshot.documents.length).toBeGreaterThan(1);
      expect(fixture.request).toHaveBeenCalledTimes(2);
      expect(fixture.request).toHaveBeenNthCalledWith(1, endpoint, {
        headers: { accept: 'application/json' },
      });
      expect(fixture.request).toHaveBeenNthCalledWith(
        2,
        new URL(`pages/${encodeURIComponent(encodeURIComponent(task.pageId))}.json`, endpoint).href,
        { headers: { accept: 'application/json' } },
      );
      const [first, second] = await Promise.all([source.loadSearch(), source.loadSearch()]);
      expect(first).toEqual(second);
      expect(first.entries.length).toBeGreaterThan(0);
      expect(fixture.request).toHaveBeenCalledTimes(3);
      await source.loadSearch();
      expect(fixture.request).toHaveBeenCalledTimes(3);
    },
  );

  it('loads declared supporting pages and rejects a page from another route', async () => {
    const endpoint = 'https://example.com/_toudocu/portal.json';
    const fixture = staticFixture(endpoint);
    const home = fixture.pages.find((page) => page.kind === 'home')!;
    const guide = fixture.pages.find((page) => page.kind === 'document')!;
    Object.assign(fixture.index.pageDependencies, { [home.pageId]: [guide.pageId] });
    document.body.innerHTML = `<script id="toudocu-portal-data" data-src="${endpoint}" data-page="${home.pageId}"></script>`;
    const snapshot = await new StaticBrowserDataSource(document, fixture.request).load();
    expect(snapshot.pages).toEqual([home, guide]);

    const mismatch: typeof fetch = async (url) =>
      Response.json(String(url) === endpoint ? fixture.index : guide);
    await expect(new StaticBrowserDataSource(document, mismatch).load()).rejects.toThrow(
      'Failed to load',
    );
  });

  it('retries search after a failed request', async () => {
    const endpoint = 'https://example.com/_toudocu/portal.json';
    const fixture = staticFixture(endpoint);
    let failed = false;
    const request: typeof fetch = async (url, options) => {
      if (String(url).endsWith('/search.json') && !failed) {
        failed = true;
        return new Response('', { status: 503 });
      }
      return fixture.request(url, options);
    };
    document.body.innerHTML = `<script id="toudocu-portal-data" data-src="${endpoint}" data-page="home"></script>`;
    const source = new StaticBrowserDataSource(document, request);
    await source.load();
    await expect(source.loadSearch()).rejects.toThrow('status 503');
    await expect(source.loadSearch()).resolves.toMatchObject({ kind: 'search' });
  });

  it('rejects failed, malformed and invalid shared indexes', async () => {
    document.body.innerHTML =
      '<script id="toudocu-portal-data" data-src="_toudocu/portal.json" data-page="home"></script>';
    for (const response of [
      new Response('', { status: 404 }),
      new Response('not json'),
      Response.json({ schemaVersion: 999 }),
    ]) {
      await expect(
        new StaticBrowserDataSource(document, async () => response).load(),
      ).rejects.toThrow('Failed to load static portal snapshot');
    }
  });

  it('validates embedded development data', async () => {
    document.body.innerHTML = `<script id="toudocu-portal-data" type="application/json">${JSON.stringify(portalFixture())}</script>`;
    await expect(new StaticBrowserDataSource(document).load()).resolves.toMatchObject({
      schemaVersion: 1,
      kind: 'portal',
    });
  });

  it('validates serve responses and reports HTTP failures', async () => {
    const ok = new ServeApiDataSource('/portal', async () => Response.json(portalFixture('serve')));
    await expect(ok.load()).resolves.toMatchObject({ capabilities: { mode: 'serve' } });
    const failed = new ServeApiDataSource('/portal', async () => new Response('', { status: 503 }));
    await expect(failed.load()).rejects.toThrow('status 503');
  });
});

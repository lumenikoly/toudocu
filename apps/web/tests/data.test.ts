// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ServeApiDataSource, StaticBrowserDataSource } from '../app/data.js';
import { portalFixture } from './fixture.js';

describe('portal data sources', () => {
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

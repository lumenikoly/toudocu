import { describe, expect, it } from 'vitest';
import { renderRoute } from '../renderer/index.js';
import { portalFixture } from './fixture.js';

const assetManifest = { script: 'assets/client.js', styles: [] as const };

describe('static renderer appearance', () => {
  it('references one shared snapshot without embedding it in root or nested HTML', () => {
    const snapshot = portalFixture();
    const marker = 'snapshot-only-marker-'.repeat(10_000);
    const search = snapshot.pages.find((page) => page.kind === 'search');
    const entry = search?.kind === 'search' ? search.entries[0] : undefined;
    if (!entry) throw new Error('fixture search entry is missing');
    entry.text = marker;
    const home = snapshot.routes.find((route) => route.pageId === 'home');
    const nested = snapshot.routes.find((route) => route.outputPath.includes('/'));
    if (!home || !nested) throw new Error('fixture routes are missing');

    for (const route of [home, nested]) {
      const html = renderRoute({
        route,
        snapshot,
        runtime: { mode: 'static', locale: 'en' },
        assetManifest,
      });
      const depth = route.outputPath.split('/').length - 1;
      expect(html).toContain(`data-src="${'../'.repeat(depth)}_toudocu/portal.json"></script>`);
      expect(html).not.toContain(marker);
      expect(html).not.toContain('"schemaVersion":1');
      expect(html).toContain('data-toudocu-prerendered="true"');
      expect(html).toContain('Example project');
    }
  });

  it('emits configured appearance and defaults for legacy snapshots', () => {
    const legacy = portalFixture();
    const route = legacy.routes.find((candidate) => candidate.pageId === 'home');
    if (!route) throw new Error('home route is missing');

    const defaults = renderRoute({
      route,
      snapshot: legacy,
      runtime: { mode: 'static', locale: 'en' },
      assetManifest,
    });
    expect(defaults).toContain('data-site-theme="classic"');
    expect(defaults).toContain('data-color-scheme="system"');
    expect(defaults).toContain('data-accent="indigo"');
    expect(defaults).toContain('data-density="comfortable"');

    const configured = renderRoute({
      route,
      snapshot: {
        ...legacy,
        appearance: {
          theme: 'paper',
          colorScheme: 'dark',
          accent: 'teal',
          density: 'compact',
          logo: '',
          artwork: '',
        },
      },
      runtime: { mode: 'static', locale: 'en' },
      assetManifest,
    });
    expect(configured).toContain('data-site-theme="paper"');
    expect(configured).toContain('data-color-scheme="dark"');
    expect(configured).toContain('data-accent="teal"');
    expect(configured).toContain('data-density="compact"');
  });
});

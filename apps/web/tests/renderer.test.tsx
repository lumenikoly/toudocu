import { describe, expect, it } from 'vitest';
import { renderRoute } from '../renderer/index.js';
import { portalFixture } from './fixture.js';

const assetManifest = { script: 'assets/client.js', styles: [] as const };

describe('static renderer appearance', () => {
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

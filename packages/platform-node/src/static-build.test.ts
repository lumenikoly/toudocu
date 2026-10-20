import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { afterEach, expect, test } from 'vitest';
import { buildStaticPortal } from './static-build.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-static-build-'));
  temporary.push(root);
  const docs = join(root, 'docs');
  const output = join(root, 'site');
  const assets = join(root, 'prebuilt-assets');
  await mkdir(docs);
  await mkdir(output);
  await mkdir(assets);
  await writeFile(join(output, 'published.txt'), 'previous');
  await writeFile(join(assets, 'client.js'), 'client');
  const route = {
    pageId: 'home',
    href: 'index.html',
    outputPath: 'index.html',
    kind: 'home',
    availability: 'both',
    serveOnly: false,
  } as const;
  const snapshot = { pages: [{ pageId: 'home', route }] } as unknown as PortalSnapshotV1;
  return { root, docs, output, assets, route, snapshot };
}

test('writes a compact index and each payload once, replacing obsolete generated files without clean', async () => {
  const item = await fixture();
  const search = {
    kind: 'search',
    pageId: 'search',
    route: {
      ...item.route,
      pageId: 'search',
      kind: 'search',
      href: 'search.html',
      outputPath: 'search.html',
    },
    entries: [{ text: 'search-only-marker' }],
  };
  const snapshot = {
    ...item.snapshot,
    pages: [...item.snapshot.pages, search],
  } as unknown as PortalSnapshotV1;
  await mkdir(join(item.output, '_toudocu', 'pages'), { recursive: true });
  await mkdir(join(item.output, 'assets'));
  await writeFile(join(item.output, '_toudocu', 'pages', 'obsolete.json'), 'old snapshot');
  await writeFile(join(item.output, 'assets', 'old-hash.js'), 'old bundle');
  await buildStaticPortal({
    outputDirectory: item.output,
    protectedRoots: [item.docs],
    snapshot,
    report: {},
    locale: 'en',
    assetsDirectory: item.assets,
    assetManifest: { script: 'assets/client.js', styles: [] },
    renderRoute: () => '<html>prerendered</html>',
  });
  const index = await readFile(join(item.output, '_toudocu', 'portal.json'), 'utf8');
  expect(index).toContain('"kind":"static-portal-index"');
  expect(index).not.toContain('"pages":');
  expect(index).not.toContain('search-only-marker');
  expect(index).not.toContain('\n');
  expect(await readdir(join(item.output, '_toudocu', 'pages'))).toEqual(['home.json']);
  expect(await readFile(join(item.output, '_toudocu', 'pages', 'home.json'), 'utf8')).toBe(
    JSON.stringify(snapshot.pages[0]),
  );
  expect(await readFile(join(item.output, '_toudocu', 'search.json'), 'utf8')).toBe(
    JSON.stringify(search.entries),
  );
  expect(await readdir(join(item.output, 'assets'))).toEqual(['client.js']);
  expect(await readFile(join(item.output, 'published.txt'), 'utf8')).toBe('previous');
});

test('keeps the published output when rendering fails', async () => {
  const item = await fixture();
  await expect(
    buildStaticPortal({
      outputDirectory: item.output,
      protectedRoots: [item.docs],
      clean: true,
      snapshot: item.snapshot,
      report: {},
      locale: 'en',
      assetsDirectory: item.assets,
      assetManifest: { script: 'assets/client.js', styles: [] },
      renderRoute: () => {
        throw new Error('render failed');
      },
    }),
  ).rejects.toThrow('render failed');

  expect(await readFile(join(item.output, 'published.txt'), 'utf8')).toBe('previous');
  expect((await readdir(item.root)).some((name) => name.includes('.site.staging-'))).toBe(false);
});

test('cancellation removes staging and preserves the published output', async () => {
  const item = await fixture();
  const controller = new AbortController();

  await expect(
    buildStaticPortal({
      outputDirectory: item.output,
      protectedRoots: [item.docs],
      snapshot: item.snapshot,
      report: {},
      locale: 'en',
      assetsDirectory: item.assets,
      assetManifest: { script: 'assets/client.js', styles: [] },
      signal: controller.signal,
      renderRoute: () => {
        controller.abort();
        return '<html></html>';
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });

  expect(await readFile(join(item.output, 'published.txt'), 'utf8')).toBe('previous');
  expect((await readdir(item.root)).some((name) => name.includes('.site.staging-'))).toBe(false);
});

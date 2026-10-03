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

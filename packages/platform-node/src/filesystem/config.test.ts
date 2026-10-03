import { afterEach, expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sectionTypes } from '@toudocu/core';
import { loadSiteConfig, selectLocaleProfile } from './config.js';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function project(config?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-config-'));
  temporary.push(root);
  await mkdir(join(root, '.toudocu'));
  if (config !== undefined) await writeFile(join(root, '.toudocu/config.yml'), config);
  return root;
}
function profile(locale: string, root: string): string {
  return `  ${locale}:\n    root: ${root}\n    sections:\n${sectionTypes.map((section) => `      ${section}: ${section}`).join('\n')}\n`;
}
const config = (roots = ['docs', 'docs-en']): string =>
  `documentationVersion: 3\nproject:\n  defaultLocale: ru\nlocales:\n${profile('ru', roots[0] ?? 'docs')}${profile('en', roots[1] ?? 'docs-en')}`;

test('missing config returns legacy defaults; configured roots are selected without reading their contents', async () => {
  const bare = await loadSiteConfig(await project());
  expect(bare.config.documentationVersion).toBe(1);
  const root = await project(config());
  // The trees need not exist to validate configuration. No translation content is read.
  const loaded = await loadSiteConfig(root);
  expect(selectLocaleProfile(loaded, join(root, 'docs'))).toMatchObject({
    locale: 'ru',
    root: join(root, 'docs'),
    excludedRoots: [join(root, 'docs-en')],
  });
  expect(() => selectLocaleProfile(loaded, root)).toThrow(/input root must match/);
});

test('rejects overlapping, escaping and symlink locale roots', async () => {
  for (const roots of [
    ['docs', 'docs/en'],
    ['../outside', 'docs-en'],
    ['docs', 'docs'],
  ]) {
    await expect(loadSiteConfig(await project(config(roots)))).rejects.toThrow();
  }
  const root = await project(config());
  await symlink(tmpdir(), join(root, 'docs'), 'dir');
  await expect(loadSiteConfig(root)).rejects.toThrow(/symbolic links/);
});

test('rejects incomplete profiles and empty titles when selected', async () => {
  await expect(
    loadSiteConfig(await project(config().replace('      modules: modules\n', ''))),
  ).rejects.toThrow(/every built-in section/);
  const root = await project(config().replace('      modules: modules', '      modules: ""'));
  const loaded = await loadSiteConfig(root);
  expect(() => selectLocaleProfile(loaded, join(root, 'docs'))).toThrow(/non-empty/);
});

test('branding assets remain within regular non-symlink files under .toudocu/assets', async () => {
  const root = await project('site:\n  logo: assets/logo.png\n');
  await mkdir(join(root, '.toudocu/assets'));
  await writeFile(join(root, '.toudocu/assets/logo.png'), 'fixture');
  expect((await loadSiteConfig(root)).branding.get('assets/branding/logo.png')).toBe(
    join(root, '.toudocu/assets/logo.png'),
  );
  for (const path of ['../secret.png', 'assets/../secret.png', 'assets/missing.png']) {
    await writeFile(join(root, '.toudocu/config.yml'), `site:\n  logo: ${path}\n`);
    await expect(loadSiteConfig(root)).rejects.toThrow();
  }
  await symlink(join(root, '.toudocu/assets/logo.png'), join(root, '.toudocu/assets/link.png'));
  await writeFile(join(root, '.toudocu/config.yml'), 'site:\n  logo: assets/link.png\n');
  await expect(loadSiteConfig(root)).rejects.toThrow(/symbolic links/);
});

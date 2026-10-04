import { expect, test } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readRepositoryInventory, scopePattern } from './inventory.js';

test('inventory prunes peer locales and symlink trees; scope globs retain Go semantics', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-inventory-'));
  try {
    await mkdir(join(root, 'src/deep'), { recursive: true });
    await mkdir(join(root, 'docs-en'));
    for (const path of [
      'src/a.ts',
      'src/b.ts',
      'src/.hidden.ts',
      'src/deep/c.ts',
      'src/{a,b}.ts',
      'docs-en/private.md',
    ])
      await writeFile(join(root, path), '');
    await symlink(join(root, 'docs-en'), join(root, 'linked'), 'dir');
    const inventory = await readRepositoryInventory(root, {
      excludedRoots: [join(root, 'docs-en')],
    });
    expect(inventory.exists('.')).toBe(true);
    expect(inventory.exists('src')).toBe(true);
    expect(inventory.exists('../outside')).toBe(false);
    expect(inventory.exists('docs-en')).toBe(false);
    expect(inventory.lookup(join(root, 'linked/private.md'))?.safe).toBe(false);
    expect(inventory.matches('src/**.ts')).toEqual([
      'src/.hidden.ts',
      'src/a.ts',
      'src/b.ts',
      'src/{a,b}.ts',
    ]);
    expect(inventory.matches('src/{a,b}.ts')).toEqual(['src/{a,b}.ts']);
    expect(inventory.matches('src/[^a].ts')).toEqual(['src/b.ts']);
    expect(inventory.matches('src/[bad')).toEqual([]);
    expect([...inventory.entries.keys()].some((path) => path.startsWith('docs-en'))).toBe(false);
    await expect(readRepositoryInventory(root, { signal: AbortSignal.abort() })).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scope matching preserves Unicode runes and Go character-class failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-inventory-unicode-'));
  try {
    await mkdir(join(root, 'unicode'), { recursive: true });
    await writeFile(join(root, 'unicode/é.ts'), '');
    await writeFile(join(root, 'unicode/𐀀.ts'), '');
    await writeFile(join(root, 'unicode/.ts'), '');
    await writeFile(join(root, 'unicode/a.ts'), '');
    await writeFile(join(root, 'unicode/a-.ts'), '');
    const inventory = await readRepositoryInventory(root);

    expect(inventory.matches('unicode/?.ts')).toEqual([
      'unicode/a.ts',
      'unicode/é.ts',
      'unicode/.ts',
      'unicode/𐀀.ts',
    ]);
    expect(inventory.matches('unicode/[z-a].ts')).toEqual([]);
    expect(inventory.matches('unicode/[a-].ts')).toEqual([]);
    expect(inventory.matches('unicode/[unterminated.ts')).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scope matching supports Go backslash escapes for literal metacharacters', () => {
  const pattern = scopePattern(String.raw`src/\*.ts`);
  expect(pattern?.test('src/*.ts')).toBe(true);
  expect(pattern?.test('src/a.ts')).toBe(false);
});

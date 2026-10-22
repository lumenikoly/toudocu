import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { readRepositoryInventory } from './filesystem/inventory.js';
import { readRepositoryPath } from './repository-links.js';

test('repository browsing excludes private paths, other locales and symlinks on every read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-repository-links-'));
  const signal = new AbortController().signal;
  try {
    await mkdir(join(root, 'src', 'translated'), { recursive: true });
    await mkdir(join(root, 'src', '.storybook'));
    for (const path of ['file.ts', '.env', '.env.example', '.storybook/preview.ts'])
      await writeFile(join(root, 'src', path), path);
    await symlink(join(root, 'src/file.ts'), join(root, 'src/link.ts'));
    const inventory = await readRepositoryInventory(root, {
      excludedRoots: [join(root, 'src/translated')],
    });
    expect(await readRepositoryPath(inventory, 'src', signal)).toEqual([
      '.env.example',
      '.storybook/',
      'file.ts',
    ]);
    expect((await readRepositoryPath(inventory, 'src/.env.example', signal)).toString()).toBe(
      '.env.example',
    );
    for (const path of ['src/.env', '../private', 'src/link.ts', 'src/translated'])
      await expect(readRepositoryPath(inventory, path, signal)).rejects.toThrow();
    await rm(join(root, 'src/.storybook'), { recursive: true });
    await symlink(root, join(root, 'src/.storybook'));
    await expect(
      readRepositoryPath(inventory, 'src/.storybook/preview.ts', signal),
    ).rejects.toThrow();
    expect(await readRepositoryPath(inventory, 'src', signal)).toEqual(['.env.example', 'file.ts']);
    await expect(readRepositoryPath(inventory, 'src', AbortSignal.abort())).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

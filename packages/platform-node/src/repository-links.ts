import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isAllowedRepositoryPath } from '@toudocu/core';
import { ToudocuError } from '@toudocu/contracts';
import { PathPolicy } from './filesystem/path-policy.js';
import type { ProjectInventory } from './project.js';

export async function readRepositoryPath(
  inventory: ProjectInventory,
  path: string,
  signal: AbortSignal,
): Promise<Buffer | string[]> {
  signal.throwIfAborted();
  if (!isAllowedRepositoryPath(path))
    throw new ToudocuError('path_forbidden', 'repository path is not allowed', { path });
  const entry = inventory.lookup(resolve(inventory.root, path));
  if (!entry) throw new ToudocuError('file_not_found', 'repository entry not found', { path });
  if (!entry.safe) throw new ToudocuError('path_forbidden', 'unsafe repository entry', { path });
  const policy = await PathPolicy.create(inventory.root, { allowHidden: true });
  if (entry.kind === 'directory') {
    const directory = await policy.resolveDirectory(path);
    const entries: string[] = [];
    for (const child of await readdir(directory, { withFileTypes: true })) {
      signal.throwIfAborted();
      const childPath = `${path}/${child.name}`;
      if (
        (child.isFile() || child.isDirectory()) &&
        isAllowedRepositoryPath(childPath) &&
        inventory.lookup(resolve(inventory.root, childPath))?.safe
      )
        entries.push(child.name + (child.isDirectory() ? '/' : ''));
    }
    return entries.sort();
  }
  const file = await policy.resolveFile(path);
  if ((await lstat(file)).size > 2 * 1024 * 1024)
    throw new ToudocuError('content_too_large', 'content exceeds 2 MiB', { path });
  return readFile(file, { signal });
}

import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import { PathPolicy, isMissing } from './path-policy.js';

export function contentDigest(content: Uint8Array | string): string {
  return createHash('sha256').update(content).digest('hex');
}

type WriteMode =
  { kind: 'create' } | { kind: 'replace'; expectedDigest: string } | { kind: 'overwrite' };

const pendingWrites = new Map<string, Promise<void>>();

/** Publish complete contents; create mode never overwrites an existing target. */
export async function writeAtomically(
  policy: PathPolicy,
  path: string,
  content: Uint8Array | string,
  mode: WriteMode,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const target = await policy.resolveFile(path, mode.kind !== 'replace');
  const previous = pendingWrites.get(target);
  let release = (): void => {};
  const pending = new Promise<void>((done) => {
    release = done;
  });
  pendingWrites.set(target, pending);
  try {
    await previous;
    signal?.throwIfAborted();
    return await publish(policy, path, target, content, mode, signal);
  } finally {
    release();
    if (pendingWrites.get(target) === pending) {
      pendingWrites.delete(target);
    }
  }
}

async function publish(
  policy: PathPolicy,
  path: string,
  target: string,
  content: Uint8Array | string,
  mode: WriteMode,
  signal?: AbortSignal,
): Promise<string> {
  const parent = dirname(target);
  let current = policy.root;
  for (const part of relative(policy.root, parent).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new ToudocuError('path_forbidden', 'write directory is unsafe', { path });
    }
  }
  const checkRevision = async (): Promise<void> => {
    if (mode.kind !== 'replace') {
      return;
    }
    const latest = await readFile(await policy.resolveFile(path));
    if (!mode.expectedDigest || contentDigest(latest) !== mode.expectedDigest) {
      throw new ToudocuError('stale_file', 'file changed since it was read', { path });
    }
  };
  await checkRevision();
  let permissions = 0o644;
  if (mode.kind === 'replace') {
    permissions = (await lstat(target)).mode & 0o777;
  }
  if (mode.kind === 'overwrite') {
    try {
      permissions = (await lstat(target)).mode & 0o777;
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
      permissions = 0o600;
    }
  }
  const temporary = join(parent, `.toudocu-write-${randomUUID()}`);
  const handle = await open(temporary, 'wx', permissions);
  try {
    await handle.writeFile(content);
    await handle.chmod(permissions);
    await handle.sync();
    await handle.close();
    signal?.throwIfAborted();
    await policy.resolveFile(path, mode.kind !== 'replace');
    await checkRevision();
    if (mode.kind === 'create') {
      await link(temporary, target);
    } else {
      await rename(temporary, target);
    }
    return contentDigest(content);
  } finally {
    await handle.close();
    try {
      await unlink(temporary);
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }
}

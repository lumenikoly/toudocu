import { link, lstat, mkdir, unlink } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import { isMissing, PathPolicy } from './filesystem/path-policy.js';

function unsafeMove(message: string, cause?: unknown): ToudocuError {
  return new ToudocuError('unsafe-task-move', message, { cause });
}

function relativeMovePath(root: string, target: string): string {
  return relative(root, target).split(sep).join('/');
}

async function ensureParentDirectory(policy: PathPolicy, parent: string): Promise<void> {
  const parts = relative(policy.root, parent).split(sep).filter(Boolean);
  let current = policy.root;
  for (const part of parts) {
    current = join(current, part);
    try {
      await mkdir(current);
    } catch (error) {
      const exists = error instanceof Error && 'code' in error && error.code === 'EEXIST';
      if (!exists) {
        throw error;
      }
    }
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw unsafeMove('The task destination contains an unsafe directory.');
    }
  }
}

export async function validateTaskFileMove(
  root: string,
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const policy = await PathPolicy.create(root, { allowHidden: true });
  try {
    await policy.resolveFile(sourcePath);
  } catch (error) {
    const sourceEntry = join(policy.root, sourcePath);
    try {
      const sourceInfo = await lstat(sourceEntry);
      if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
        throw unsafeMove('source task must be a regular file', error);
      }
    } catch (sourceError) {
      if (sourceError instanceof ToudocuError) {
        throw sourceError;
      }
      if (!isMissing(sourceError)) {
        throw sourceError;
      }
    }
    throw unsafeMove(error instanceof Error ? error.message : String(error), error);
  }
  policy.validate(destinationPath);
  const destinationEntry = join(policy.root, destinationPath);
  try {
    await lstat(destinationEntry);
    throw unsafeMove(
      `destination file already exists: ${relativeMovePath(policy.root, destinationEntry)}`,
    );
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  let destination: string;
  try {
    destination = await policy.resolveFile(destinationPath, true);
  } catch (error) {
    if (error instanceof ToudocuError && error.code === 'file_not_found') {
      throw error;
    }
    throw unsafeMove('move path escapes the documentation directory', error);
  }
  try {
    await lstat(destination);
    throw unsafeMove(
      `destination file already exists: ${relativeMovePath(policy.root, destination)}`,
    );
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

/** Move one task inode without overwriting and roll back a failed unlink. */
export async function moveTaskFile(
  root: string,
  sourcePath: string,
  destinationPath: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  await validateTaskFileMove(root, sourcePath, destinationPath);
  const policy = await PathPolicy.create(root, { allowHidden: true });
  const source = await policy.resolveFile(sourcePath);
  let destination = await policy.resolveFile(destinationPath, true);
  signal?.throwIfAborted();
  await ensureParentDirectory(policy, dirname(destination));
  signal?.throwIfAborted();
  await validateTaskFileMove(root, sourcePath, destinationPath);
  destination = await policy.resolveFile(destinationPath, true);
  try {
    await link(source, destination);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw unsafeMove(
        `destination file already exists: ${relativeMovePath(policy.root, destination)}`,
        error,
      );
    }
    throw error;
  }

  try {
    signal?.throwIfAborted();
    await unlink(source);
  } catch (error) {
    try {
      await unlink(destination);
    } catch (rollbackError) {
      throw new ToudocuError('task-move-rollback-failed', 'Could not roll back the task move.', {
        cause: rollbackError,
        details: { originalError: error instanceof Error ? error.message : String(error) },
      });
    }
    throw error;
  }
}

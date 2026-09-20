import { mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import { assertSafeOutput, PathPolicy } from '../filesystem/path-policy.js';
import { writeAtomically } from '../filesystem/write.js';

export async function writeChangesOutput(
  output: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const target = resolve(output);
  const safeTarget = await assertSafeOutput(target, []);
  if (safeTarget !== target) {
    throw new ToudocuError('unsafe_output', 'output path contains a symbolic link', {
      path: output,
    });
  }

  signal?.throwIfAborted();
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const policy = await PathPolicy.create(parent, { allowHidden: true });
  await writeAtomically(policy, basename(target), content, { kind: 'overwrite' }, signal);
}

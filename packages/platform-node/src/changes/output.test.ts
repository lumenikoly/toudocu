import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeChangesOutput } from './output.js';

const temporaryRoots: string[] = [];

async function makeSymlink(target: string, path: string, type: 'file' | 'dir'): Promise<boolean> {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['EACCES', 'ENOTSUP', 'EPERM'].includes(String(error.code))
    ) {
      return false;
    }
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-changes-output-'));
  temporaryRoots.push(root);
  return root;
}

describe('writeChangesOutput', () => {
  it('creates parent directories and atomically replaces a report', async () => {
    const root = await temporaryRoot();
    const output = join(root, 'reports', 'changes.json');

    await writeChangesOutput(output, 'first\n');
    await writeChangesOutput(output, 'second\n');

    await expect(readFile(output, 'utf8')).resolves.toBe('second\n');
  });

  it('uses private permissions for new reports and preserves existing permissions', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const root = await temporaryRoot();
    const output = join(root, 'changes.json');

    await writeChangesOutput(output, 'first\n');
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    await chmod(output, 0o640);
    await writeChangesOutput(output, 'second\n');

    expect((await stat(output)).mode & 0o777).toBe(0o640);
  });

  it('rejects a path through a symbolic-link directory', async () => {
    const root = await temporaryRoot();
    const actual = join(root, 'actual');
    const linked = join(root, 'linked');
    await mkdir(actual);
    if (!(await makeSymlink(actual, linked, 'dir'))) {
      return;
    }

    await expect(writeChangesOutput(join(linked, 'changes.json'), '{}\n')).rejects.toMatchObject({
      code: 'unsafe_output',
    });
  });

  it('rejects a symbolic-link output target', async () => {
    const root = await temporaryRoot();
    const actual = join(root, 'actual.json');
    const linked = join(root, 'linked.json');
    await writeFile(actual, 'old\n');
    if (!(await makeSymlink(actual, linked, 'file'))) {
      return;
    }

    await expect(writeChangesOutput(linked, 'new\n')).rejects.toMatchObject({
      code: 'unsafe_output',
    });
  });

  it('does not create output after cancellation', async () => {
    const root = await temporaryRoot();
    const output = join(root, 'cancelled', 'changes.json');

    await expect(writeChangesOutput(output, '{}\n', AbortSignal.abort())).rejects.toThrow();
    await expect(readFile(output, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

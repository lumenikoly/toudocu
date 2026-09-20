import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, test } from 'vitest';
import { ToudocuError } from '@toudocu/contracts';
import { moveTaskFile, validateTaskFileMove } from './task-archive.js';

const temporaryRoots = new Set<string>();

async function fixture(): Promise<{ root: string; source: string; destination: string }> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-task-move-'));
  temporaryRoots.add(root);
  await mkdir(join(root, 'work'), { recursive: true });
  const source = 'work/TASK-AUTH-021.md';
  const destination = 'work/archive/2031/TASK-AUTH-021.md';
  await writeFile(join(root, source), 'unchanged\n');
  return { root, source, destination };
}

afterEach(async () => {
  for (const root of temporaryRoots) {
    await rm(root, { recursive: true, force: true });
  }
  temporaryRoots.clear();
});

test('moves the same bytes and restores them without overwriting', async () => {
  const value = await fixture();
  await moveTaskFile(value.root, value.source, value.destination);

  expect(await readFile(join(value.root, value.destination), 'utf8')).toBe('unchanged\n');
  await expect(lstat(join(value.root, value.source))).rejects.toMatchObject({ code: 'ENOENT' });

  await moveTaskFile(value.root, value.destination, value.source);
  expect(await readFile(join(value.root, value.source), 'utf8')).toBe('unchanged\n');
});

test('rejects a duplicate destination before changing the source', async () => {
  const value = await fixture();
  await mkdir(join(value.root, 'work/archive/2031'), { recursive: true });
  await writeFile(join(value.root, value.destination), 'existing\n');

  await expect(
    validateTaskFileMove(value.root, value.source, value.destination),
  ).rejects.toMatchObject({
    code: 'unsafe-task-move',
    message: `destination file already exists: ${value.destination}`,
  });
  expect(await readFile(join(value.root, value.source), 'utf8')).toBe('unchanged\n');
});

test('reports a missing source as an unsafe move without creating a destination', async () => {
  const value = await fixture();

  await expect(
    moveTaskFile(value.root, 'work/missing.md', value.destination),
  ).rejects.toMatchObject({ code: 'unsafe-task-move' });
  await expect(lstat(join(value.root, value.destination))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

test('rejects a symlinked archive directory', async () => {
  const value = await fixture();
  const outside = join(value.root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(value.root, 'work/archive'));

  await expect(validateTaskFileMove(value.root, value.source, value.destination)).rejects.toSatisfy(
    (error: unknown) => error instanceof ToudocuError && error.code === 'unsafe-task-move',
  );
  expect(await readFile(join(value.root, value.source), 'utf8')).toBe('unchanged\n');
});

test('uses the legacy source message for a symlinked task file', async () => {
  const value = await fixture();
  const outside = join(value.root, 'outside.md');
  await writeFile(outside, 'outside\n');
  await rm(join(value.root, value.source));
  await symlink(outside, join(value.root, value.source));

  await expect(
    validateTaskFileMove(value.root, value.source, value.destination),
  ).rejects.toMatchObject({
    code: 'unsafe-task-move',
    message: 'source task must be a regular file',
  });
});

test('honors an already-aborted move without creating the destination', async () => {
  const value = await fixture();
  const controller = new AbortController();
  controller.abort();

  await expect(
    moveTaskFile(value.root, value.source, value.destination, controller.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(await readFile(join(value.root, value.source), 'utf8')).toBe('unchanged\n');
  await expect(lstat(join(value.root, value.destination))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

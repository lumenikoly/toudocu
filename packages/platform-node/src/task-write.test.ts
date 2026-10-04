import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScaffold, createTaskInit, type TaskWriteProject } from './task-write.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function project(): Promise<TaskWriteProject> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-task-write-'));
  temporary.push(root);
  return {
    locale: { root, locale: 'ru' },
    parentIDs: new Set(['TASK-DOCS-001']),
  };
}

test('allocates from work files and defaults the creation language to English', async () => {
  const taskProject = await project();
  await mkdir(join(taskProject.locale.root, 'work'));
  await writeFile(
    join(taskProject.locale.root, 'work', 'TASK-DOCS-001-existing.md'),
    '# Existing\n',
  );
  await writeFile(
    join(taskProject.locale.root, 'work', 'metadata.md'),
    '<!-- toudocu\nid: TASK-DOCS-004-recorded\n-->\n# Metadata\n',
  );
  await writeFile(join(taskProject.locale.root, 'TASK-DOCS-020-outside-work.md'), '# Other\n');

  const render = await createTaskInit(taskProject, {
    area: 'DOCS',
    title: 'New task',
    type: 'Feature',
    date: '2026-09-19',
  });

  expect(render.id).toBe('TASK-DOCS-005');
  expect(render.language).toBe('en');
  expect(render.content).toContain('## Result');
  expect(await readFile(join(taskProject.locale.root, render.path), 'utf8')).toBe(render.content);
});

test('rejects a missing parent before writing', async () => {
  const taskProject = await project();
  await expect(
    createTaskInit(taskProject, {
      area: 'DOCS',
      title: 'Child task',
      type: 'Feature',
      parentID: 'TASK-DOCS-999',
      date: '2026-09-19',
    }),
  ).rejects.toThrow('parent task TASK-DOCS-999 not found');
  await expect(
    readFile(join(taskProject.locale.root, 'work', 'TASK-DOCS-001.md')),
  ).rejects.toThrow();
});

test('does not follow a symbolic work root', async () => {
  const taskProject = await project();
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-task-write-outside-'));
  temporary.push(outside);
  try {
    await symlink(outside, join(taskProject.locale.root, 'work'), 'dir');
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      !['EACCES', 'EPERM', 'ENOTSUP'].includes(String(error.code))
    ) {
      throw error;
    }
    return;
  }

  await expect(
    createTaskInit(taskProject, {
      area: 'DOCS',
      title: 'Unsafe task',
      type: 'Feature',
      date: '2026-09-19',
    }),
  ).rejects.toMatchObject({ code: 'path_forbidden' });
});

test('creates a typed scaffold using the same atomic writer', async () => {
  const taskProject = await project();
  const render = await createScaffold(taskProject, {
    entityType: 'module',
    id: 'MOD-EXAMPLE',
    title: 'Example module',
    date: '2026-09-19',
  });

  expect(render.path).toBe('modules/MOD-EXAMPLE.md');
  expect(await readFile(join(taskProject.locale.root, render.path), 'utf8')).toBe(render.content);
});

test('does not overwrite an existing scaffold file', async () => {
  const taskProject = await project();
  await mkdir(join(taskProject.locale.root, 'modules'));
  const path = join(taskProject.locale.root, 'modules', 'MOD-EXAMPLE.md');
  await writeFile(path, 'existing\n');

  await expect(
    createScaffold(taskProject, {
      entityType: 'module',
      id: 'MOD-EXAMPLE',
      title: 'Replacement',
      date: '2026-09-19',
    }),
  ).rejects.toThrow(`file already exists: ${path}`);
  expect(await readFile(path, 'utf8')).toBe('existing\n');
});

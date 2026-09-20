import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, vi } from 'vitest';
import { loadProject } from './project.js';
import { loadTaskExternalDocuments } from './task-context.js';

const mockState = vi.hoisted(() => ({
  originalReadFile: undefined as typeof import('node:fs/promises').readFile | undefined,
}));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  mockState.originalReadFile = actual.readFile;
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

const sections = [
  'architecture',
  'modules',
  'use-cases',
  'flows',
  'screens',
  'decisions',
  'contracts',
  'quality',
  'runbooks',
  'reference',
  'work',
  'drafts',
  'guides',
] as const;

function config(): string {
  return [
    'documentationVersion: 3',
    'site:',
    '  title: Test project',
    'project:',
    '  defaultLocale: en',
    'locales:',
    '  en:',
    '    root: docs-en',
    '    sections:',
    ...sections.map((section) => `      ${section}: ${section}`),
    '  other:',
    '    root: docs-other',
    '    sections:',
    ...sections.map((section) => `      ${section}: ${section}`),
    '',
  ].join('\n');
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-task-context-'));
  await mkdir(join(root, 'docs-en', 'architecture'), { recursive: true });
  await mkdir(join(root, 'docs-en', 'work'), { recursive: true });
  await mkdir(join(root, 'docs-other'), { recursive: true });
  await mkdir(join(root, '.toudocu'));
  await writeFile(join(root, '.toudocu', 'config.yml'), config());
  await writeFile(join(root, 'docs-en', 'index.md'), '# Project\n');
  await writeFile(join(root, 'docs-en', 'architecture', 'overview.md'), '# Architecture\n');
  await writeFile(
    join(root, 'docs-en', 'work', 'TASK-EXT-001.md'),
    [
      '<!-- toudocu',
      'id: TASK-EXT-001',
      'status: ready',
      'taskType: research',
      '-->',
      '# Task',
      '',
      '<!-- toudocu:section documentation-impact -->',
      '## Documentation impact',
      '',
      'Read `external.md`.',
      '',
    ].join('\n'),
  );
  await writeFile(join(root, 'external.md'), '# External\n\nPlain Markdown.\n');
  await writeFile(join(root, 'docs-other', 'private.md'), '# Other locale\n');
  return root;
}

test('loads only safe declared files outside the selected locale', async () => {
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-task-context-outside-'));
  let linkCreated = false;
  try {
    await writeFile(join(outside, 'secret.md'), '# Secret\n');
    try {
      await symlink(join(outside, 'secret.md'), join(root, 'link.md'));
      linkCreated = true;
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        ['EACCES', 'ENOTSUP', 'EPERM'].includes(String(error.code))
      ))
        throw error;
    }
    const project = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      now: new Date('2026-09-19T00:00:00Z'),
    });
    const item = project.knowledge.workItems[0]!;
    item.documentationPaths.push('index.md', 'docs-other/private.md', '../secret.md');
    if (linkCreated) item.documentationPaths.push('link.md');
    const documents = await loadTaskExternalDocuments(project, 'TASK-EXT-001');
    expect([...documents.keys()]).toEqual(['external.md']);
    expect(documents.get('external.md')).toMatchObject({
      sourcePath: 'external.md',
      type: 'document',
      content: '# External\n\nPlain Markdown.\n',
    });
    expect(documents.get('external.md')?.modifiedAt).toEqual(
      (await stat(join(root, 'external.md'))).mtime,
    );
    expect(await readFile(join(root, 'docs-other', 'private.md'), 'utf8')).toBe('# Other locale\n');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('rejects context loading for a draft or unknown task', async () => {
  const root = await fixture();
  try {
    const project = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });
    const item = project.knowledge.workItems[0]!;
    project.index.byPath.get(item.document)!.metadata.status = 'draft';
    await expect(loadTaskExternalDocuments(project, 'TASK-EXT-001')).rejects.toMatchObject({
      code: 'invalid-task-context-state',
    });
    await expect(loadTaskExternalDocuments(project, 'TASK-MISSING')).rejects.toMatchObject({
      code: 'task-selection-failed',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('propagates cancellation after the final external document read', async () => {
  const root = await fixture();
  const controller = new AbortController();
  let readStartedResolve: (() => void) | undefined;
  const readStarted = new Promise<void>((resolve) => {
    readStartedResolve = resolve;
  });
  let finishRead: (() => void) | undefined;
  const readFileMock = vi.mocked(fs.readFile);
  try {
    const project = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });
    const externalPath = resolve(root, 'external.md');
    readFileMock.mockImplementation(async (path, options) => {
      if (resolve(String(path)) !== externalPath) {
        return mockState.originalReadFile!(path, options);
      }
      readStartedResolve?.();
      await new Promise<void>((resolve) => {
        finishRead = resolve;
      });
      return '# External\n\nPlain Markdown.\n';
    });
    const pending = loadTaskExternalDocuments(project, 'TASK-EXT-001', controller.signal);
    await readStarted;
    controller.abort(new Error('cancelled during final read'));
    finishRead?.();

    await expect(pending).rejects.toThrow('cancelled during final read');
  } finally {
    readFileMock.mockImplementation(mockState.originalReadFile!);
    await rm(root, { recursive: true, force: true });
  }
});

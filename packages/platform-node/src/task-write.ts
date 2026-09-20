import {
  documentationVersionDiagnostic,
  parseMarkdown,
  renderScaffold,
  renderTaskInit,
} from '@toudocu/core';
import { ToudocuError } from '@toudocu/contracts';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isMissing, PathPolicy } from './filesystem/path-policy.js';
import { loadSiteConfig, selectLocaleProfile } from './filesystem/config.js';
import { writeAtomically } from './filesystem/write.js';
import { loadProject } from './project.js';

export interface TaskWriteProject {
  locale: {
    root: string;
    locale: string;
  };
  parentIDs: ReadonlySet<string>;
}

async function sourceEntries(project: TaskWriteProject, signal?: AbortSignal) {
  const result: { sourcePath: string; metadataID?: string }[] = [];
  const policy = await PathPolicy.create(project.locale.root, { allowHidden: true });
  const visit = async (relativeDirectory: string): Promise<void> => {
    signal?.throwIfAborted();
    let directory: string;
    try {
      directory = await policy.resolveDirectory(relativeDirectory, true);
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw error;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (entry.isSymbolicLink()) {
        continue;
      }
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) {
        continue;
      }
      const sourcePath = relativePath.replaceAll('\\', '/');
      const safePath = await policy.resolveFile(sourcePath);
      const content = await readFile(safePath, { encoding: 'utf8', signal });
      const metadataID = parseMarkdown(content, sourcePath).analysis.metadata.find(
        (item) => item.key === 'id',
      )?.value;
      result.push({
        sourcePath,
        ...(metadataID === undefined ? {} : { metadataID }),
      });
    }
  };
  await visit('work');
  return result;
}

function isExistingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

async function createFile(
  project: TaskWriteProject,
  path: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  const policy = await PathPolicy.create(project.locale.root, { allowHidden: true });
  await writeAtomically(policy, path, content, { kind: 'create' }, signal);
}

export async function createTaskInit(
  project: TaskWriteProject,
  input: {
    area: string;
    title: string;
    type: string;
    language?: string;
    parentID?: string;
    date: string;
  },
  signal?: AbortSignal,
) {
  const language = input.language ?? 'en';
  const parentExists = input.parentID ? project.parentIDs.has(input.parentID) : undefined;
  let entries = await sourceEntries(project, signal);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const render = renderTaskInit({
      ...input,
      language,
      entries,
      ...(parentExists === undefined ? {} : { parentExists }),
    });
    try {
      await createFile(project, render.path, render.content, signal);
      return render;
    } catch (error) {
      if (!isExistingFileError(error)) {
        throw error;
      }
      entries = await sourceEntries(project, signal);
    }
  }
  throw new Error('could not allocate a free work-item identifier after concurrent changes');
}

export async function createScaffold(
  project: TaskWriteProject,
  input: {
    entityType: string;
    id: string;
    title: string;
    language?: string;
    date: string;
  },
  signal?: AbortSignal,
) {
  const render = renderScaffold({
    ...input,
    language: input.language ?? 'en',
  });
  try {
    await createFile(project, render.path, render.content, signal);
  } catch (error) {
    if (isExistingFileError(error)) {
      throw new ToudocuError(
        'file_exists',
        `file already exists: ${resolve(project.locale.root, render.path)}`,
        { path: render.path, cause: error },
      );
    }
    throw error;
  }
  return render;
}

export async function loadTaskWriteProject(
  inputRoot: string,
  repositoryRoot: string | undefined,
  includeParentModel: boolean,
  signal?: AbortSignal,
): Promise<TaskWriteProject> {
  signal?.throwIfAborted();
  const input = resolve(inputRoot);
  const repository = resolve(repositoryRoot ?? dirname(input));
  const loaded = await loadSiteConfig(repository, signal);
  const locale = selectLocaleProfile(loaded, input);
  const version = documentationVersionDiagnostic(loaded.config);
  if (version) {
    throw new ToudocuError(version.code, version.message, { path: '.toudocu/config.yml' });
  }
  try {
    await PathPolicy.create(locale.root, { allowHidden: true });
  } catch (error) {
    if (isMissing(error)) {
      throw new Error(`documentation directory not found: ${input}`);
    }
    throw error;
  }
  const project: TaskWriteProject = {
    locale: { root: locale.root, locale: locale.locale },
    parentIDs: new Set(),
  };
  if (includeParentModel) {
    const model = await loadProject(inputRoot, {
      ...(repositoryRoot === undefined ? {} : { repositoryRoot }),
      ...(signal === undefined ? {} : { signal }),
    });
    project.parentIDs = new Set(model.knowledge.workItems.map((item) => item.id));
  }
  return project;
}

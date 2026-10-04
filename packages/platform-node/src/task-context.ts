import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { createDocument, findWorkItem, type Document } from '@toudocu/core';
import { ToudocuError } from '@toudocu/contracts';
import { isInside, PathPolicy } from './filesystem/path-policy.js';
import type { LoadedProject } from './project.js';

/** Load only explicitly declared Markdown context outside the selected locale root. */
export async function loadTaskExternalDocuments(
  project: LoadedProject,
  taskID: string,
  signal?: AbortSignal,
): Promise<Map<string, Document>> {
  signal?.throwIfAborted();
  const item = findWorkItem(project, taskID);
  const status = project.index.byPath.get(item.document)?.metadata.status ?? '';
  if (!['ready', 'in-progress', 'blocked', 'done'].includes(status))
    throw new ToudocuError(
      'invalid-task-context-state',
      'task context is available only for Ready, In Progress, Blocked, or Done tasks',
    );

  const repositoryRoot = project.inventory.root;
  const policy = await PathPolicy.create(repositoryRoot, { allowHidden: true });
  const documents = new Map<string, Document>();

  for (const rawPath of item.documentationPaths) {
    signal?.throwIfAborted();
    const path = rawPath.trim().replaceAll('\\', '/');
    if (!path) {
      continue;
    }
    try {
      policy.validate(path);
    } catch {
      continue;
    }
    const absolute = resolve(repositoryRoot, path);
    if (!isInside(repositoryRoot, absolute) || isInside(project.snapshot.root, absolute)) {
      continue;
    }
    const sourcePath = relative(repositoryRoot, absolute).replaceAll('\\', '/');
    if (!sourcePath || sourcePath.startsWith('../') || isAbsolute(sourcePath)) {
      continue;
    }
    if (project.index.byPath.has(sourcePath)) {
      continue;
    }
    const entry = project.inventory.lookup(absolute);
    if (!entry?.safe || entry.kind !== 'file') {
      continue;
    }

    try {
      const file = await policy.resolveFile(path);
      const metadata = await stat(file);
      if (!metadata.isFile()) {
        continue;
      }
      const content = signal
        ? await readFile(file, { encoding: 'utf8', signal })
        : await readFile(file, 'utf8');
      const document = createDocument(
        { sourcePath, content, modifiedAt: metadata.mtime },
        { now: metadata.mtime, staleDays: 0 },
      );
      documents.set(sourcePath, document);
    } catch {
      signal?.throwIfAborted();
      // Legacy task context skips missing, unreadable, and changed unsafe paths.
    }
  }
  signal?.throwIfAborted();
  return documents;
}

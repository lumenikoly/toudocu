import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { PathPolicy, isInside } from './path-policy.js';

export interface SourceFile {
  sourcePath: string;
  content: string;
  modifiedAt: Date;
}
export interface OpenAPISourceFile {
  sourcePath: string;
  content: string | Uint8Array;
  modifiedAt: Date;
}
export interface SourceIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  documentPath: string;
}
export interface SourceSnapshot {
  root: string;
  markdown: SourceFile[];
  openAPI: OpenAPISourceFile[];
  issues: SourceIssue[];
}
const defaultExcludes = [
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
];

/** Read a single selected tree; peer locale roots are pruned before traversal. */
export async function readSourceSnapshot(
  root: string,
  options: {
    excludedRoots?: readonly string[];
    excludeMarkdown?: readonly string[];
    excludes?: readonly string[];
    overlay?: ReadonlyMap<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<SourceSnapshot> {
  const policy = await PathPolicy.create(root, { allowHidden: true });
  const snapshot: SourceSnapshot = { root: policy.root, markdown: [], openAPI: [], issues: [] };
  const excludes = new Set(
    [...defaultExcludes, ...(options.excludes ?? [])]
      .map((value) => value.trim().replaceAll('\\', '/'))
      .filter(Boolean),
  );
  const issue = (
    severity: SourceIssue['severity'],
    code: string,
    message: string,
    documentPath: string,
  ): void => {
    snapshot.issues.push({ severity, code, message, documentPath });
  };
  const message = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted();
    let entries;
    try {
      // Revalidate parents before reading; never deliberately follow directory symlinks.
      if (directory) await policy.resolveDirectory(directory);
      entries = await readdir(join(policy.root, directory), { withFileTypes: true });
    } catch (error) {
      issue(
        'error',
        'directory-read-failed',
        `Could not read directory: ${message(error)}`,
        directory || '.',
      );
      return;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      const absolute = join(policy.root, path);
      if (options.excludeMarkdown?.includes(path)) continue;
      if (options.excludedRoots?.some((excluded) => isInside(excluded, absolute))) continue;
      let info;
      try {
        info = await lstat(absolute);
      } catch (error) {
        issue('warning', 'file-stat-failed', `Could not inspect file: ${message(error)}`, path);
        continue;
      }
      const markdown = /\.md$/i.test(entry.name);
      if (info.isSymbolicLink()) {
        if (markdown) issue('warning', 'ignored-symlink', 'Markdown symbolic link ignored.', path);
        continue;
      }
      if (info.isDirectory()) {
        if (!entry.name.startsWith('.') && !excludes.has(entry.name) && !excludes.has(path))
          await walk(path);
        continue;
      }
      const openAPI =
        path.startsWith('contracts/') && /\.openapi\.(?:json|ya?ml)$/i.test(entry.name);
      if (!info.isFile() || (!markdown && !openAPI)) continue;
      try {
        const safe = await policy.resolveFile(path);
        const overlay = options.overlay?.get(path);
        if (markdown) {
          const content =
            overlay ??
            (await readFile(safe, {
              encoding: 'utf8',
              ...(options.signal ? { signal: options.signal } : {}),
            }));
          snapshot.markdown.push({ sourcePath: path, content, modifiedAt: info.mtime });
        } else {
          const content =
            overlay ??
            (await readFile(safe, {
              ...(options.signal ? { signal: options.signal } : {}),
            }));
          snapshot.openAPI.push({ sourcePath: path, content, modifiedAt: info.mtime });
        }
      } catch (error) {
        options.signal?.throwIfAborted();
        issue('error', 'file-read-failed', `Could not read file: ${message(error)}`, path);
      }
    }
  };
  if (!options.excludedRoots?.some((excluded) => relative(excluded, policy.root) === ''))
    await walk('');
  return snapshot;
}

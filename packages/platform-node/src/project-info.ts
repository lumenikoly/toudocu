import { lstat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ProjectInfoV1Schema, ToudocuError, type ProjectInfoV1 } from '@toudocu/contracts';
import { loadSiteConfig } from './filesystem/config.js';
import { discoverServeInstance } from './serve-instance.js';

/** Discovery reads configuration, never compiles or traverses documentation. */
export async function discoverProject(start: string, signal?: AbortSignal): Promise<ProjectInfoV1> {
  let root = resolve(start);
  for (;;) {
    signal?.throwIfAborted();
    const configPath = join(root, '.toudocu/config.yml');
    try {
      await lstat(configPath);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
      const parent = dirname(root);
      if (parent === root)
        throw new ToudocuError(
          'PROJECT_NOT_FOUND',
          'No .toudocu/config.yml found in this directory or its parents.',
        );
      root = parent;
      continue;
    }
    const loaded = await loadSiteConfig(root, signal);
    const documentationRoot = loaded.localeRoots.get(loaded.config.project.defaultLocale);
    if (!documentationRoot)
      throw new ToudocuError(
        'LOCALE_ROOT_NOT_CONFIGURED',
        'Default documentation locale is not configured.',
      );
    return ProjectInfoV1Schema.parse({
      schemaVersion: 1,
      projectRoot: loaded.repositoryRoot,
      documentationRoot,
      configPath,
      project: {
        id: basename(loaded.repositoryRoot),
        title: loaded.config.site.title || basename(loaded.repositoryRoot),
      },
      workspace: await discoverServeInstance({
        projectRoot: loaded.repositoryRoot,
        documentationRoot,
        ...(signal ? { signal } : {}),
      }),
    });
  }
}

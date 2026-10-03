import { lstat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  buildDocumentIndex,
  compileDocumentIndex,
  documentationVersionDiagnostic,
  type CompiledProject,
  type Document,
  type DocumentIndex,
  type DocumentSource,
  type SiteConfig,
} from '@toudocu/core';
import type { Issue } from '@toudocu/contracts';
import {
  loadSiteConfig,
  selectLocaleProfile,
  type LoadedConfig,
  type SelectedLocale,
} from './filesystem/config.js';
import { isMissing, isInside, PathPolicy } from './filesystem/path-policy.js';
import { readRepositoryInventory, type InventoryEntry } from './filesystem/inventory.js';
import { readSourceSnapshot, type SourceIssue, type SourceSnapshot } from './filesystem/sources.js';

export interface LoadProjectOptions {
  repositoryRoot?: string;
  now?: Date;
  staleDays?: number;
  excludes?: readonly string[];
  overlay?: ReadonlyMap<string, string>;
  signal?: AbortSignal;
  repositoryUrl?: string;
  repositoryRef?: string;
}

export interface ProjectInventory {
  root: string;
  entries: ReadonlyMap<string, InventoryEntry>;
  lookup(absolutePath: string): InventoryEntry | undefined;
  exists(relativePath: string): boolean;
  matches(pattern: string): readonly string[];
}

export interface LoadedProject extends CompiledProject {
  config: SiteConfig;
  locale: SelectedLocale;
  snapshot: SourceSnapshot;
  inventory: ProjectInventory;
  branding: ReadonlyMap<string, string>;
  screenAssets: ReadonlyMap<string, string>;
}

interface PreviewAsset {
  status: 'found' | 'missing' | 'symlink' | 'outside';
  outputPath?: string;
  extension?: string;
}

interface ScreenAssets {
  previews: Map<string, PreviewAsset>;
  components: Map<string, 'found' | 'missing' | 'outside'>;
  files: Map<string, string>;
}

interface HotspotInput {
  screen: string;
  transition: string;
  x: number;
  y: number;
  width: number;
  height: number;
  allowDuplicate?: boolean;
}

function issueFromSource(issue: SourceIssue): Issue {
  return { ...issue };
}

function issueMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function projectChangelogIssue(message: string): Issue {
  return {
    severity: 'warning',
    code: 'project-changelog-unavailable',
    message,
    documentPath: 'CHANGELOG.md',
  };
}

async function readProjectChangelog(
  repositoryRoot: string,
  signal: AbortSignal | undefined,
): Promise<{ source?: DocumentSource; issues: Issue[] }> {
  const sourcePath = 'CHANGELOG.md';
  const absolute = join(repositoryRoot, sourcePath);
  let info;
  try {
    info = await lstat(absolute);
  } catch (error) {
    if (isMissing(error)) {
      return { issues: [] };
    }
    return {
      issues: [
        projectChangelogIssue(
          `Could not inspect the repository-root CHANGELOG.md: ${issueMessage(error)}`,
        ),
      ],
    };
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    return {
      issues: [
        projectChangelogIssue(
          'The repository-root CHANGELOG.md must be a regular file; the changelog page is hidden.',
        ),
      ],
    };
  }
  try {
    const policy = await PathPolicy.create(repositoryRoot, { allowHidden: true });
    const safe = await policy.resolveFile(sourcePath);
    const content = await readFile(safe, {
      encoding: 'utf8',
      ...(signal ? { signal } : {}),
    });
    return {
      source: { sourcePath, content, modifiedAt: info.mtime },
      issues: [],
    };
  } catch (error) {
    signal?.throwIfAborted();
    return {
      issues: [
        projectChangelogIssue(
          `Could not read the repository-root CHANGELOG.md: ${issueMessage(error)}`,
        ),
      ],
    };
  }
}

function projectChangelogTitle(locale: string): string {
  return locale.toLowerCase().split('-')[0] === 'ru'
    ? 'Журнал изменений проекта'
    : 'Project changelog';
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    (error instanceof Error && 'code' in error && error.code === code) ||
    (typeof error === 'object' && error !== null && 'code' in error && error.code === code)
  );
}

function sourcePathFor(absolute: string, root: string): string {
  return relative(root, absolute).replaceAll('\\', '/');
}

function cleanAssetValue(value: string): string {
  return value.trim().replace(/^`|`$/gu, '');
}

function unsafeAssetPath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  return (
    !value ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) ||
    /[?#\r\n]/u.test(value)
  );
}

function assetOutput(
  absolute: string,
  documentRoot: string,
  repositoryRoot: string,
): string | undefined {
  if (isInside(documentRoot, absolute)) return sourcePathFor(absolute, documentRoot);
  if (isInside(repositoryRoot, absolute))
    return `_screen-assets/${sourcePathFor(absolute, repositoryRoot)}`;
  return undefined;
}

function assetTarget(value: string, document: Document, documentRoot: string): string {
  const documentPath = resolve(documentRoot, document.sourcePath);
  return resolve(dirname(documentPath), value.replaceAll('\\', '/'));
}

function makeScreenAssets(
  documents: readonly Document[],
  documentRoot: string,
  repositoryRoot: string,
  inventory: ProjectInventory,
): ScreenAssets {
  const result: ScreenAssets = { previews: new Map(), components: new Map(), files: new Map() };
  const screenDocuments = documents.filter((document) => document.type === 'screen');
  const addPreview = (document: Document, raw: string): void => {
    const value = cleanAssetValue(raw);
    if (!value || value === '—' || unsafeAssetPath(value)) return;
    const target = assetTarget(value, document, documentRoot);
    const extension = value.match(/\.[^.\/]+$/u)?.[0]?.toLowerCase() ?? '';
    const targetInside = isInside(repositoryRoot, target);
    const entry = targetInside ? inventory.lookup(target) : undefined;
    const fact: PreviewAsset = { status: 'missing', extension };
    if (!targetInside) fact.status = 'outside';
    else if (entry?.safe === false) fact.status = 'symlink';
    else if (!entry || entry.kind !== 'file') fact.status = entry ? 'outside' : 'missing';
    else {
      const outputPath = assetOutput(target, documentRoot, repositoryRoot);
      if (outputPath) {
        fact.status = 'found';
        fact.outputPath = outputPath;
        result.files.set(outputPath, target);
      } else fact.status = 'outside';
    }
    result.previews.set(`${document.sourcePath}\0${value}`, fact);
  };
  for (const document of screenDocuments) {
    addPreview(document, document.metadata.preview ?? '');
    for (const table of document.tables) {
      if (table.kind !== 'states') continue;
      const previewColumn = table.columns.indexOf('preview');
      if (previewColumn < 0) continue;
      for (const row of table.rows) addPreview(document, row.cells[previewColumn] ?? '');
    }
    const component = cleanAssetValue(document.metadata.component ?? '');
    if (component && !unsafeAssetPath(component)) {
      const target = resolve(repositoryRoot, component.replaceAll('\\', '/'));
      if (!isInside(repositoryRoot, target)) result.components.set(component, 'outside');
      else {
        const entry = inventory.lookup(target);
        result.components.set(component, entry?.safe ? 'found' : entry ? 'outside' : 'missing');
      }
    }
  }
  return result;
}

async function readHotspots(
  root: string,
  overlay: ReadonlyMap<string, string> | undefined,
  signal: AbortSignal | undefined,
): Promise<{ items: HotspotInput[]; issues: Issue[] }> {
  const path = 'screens/hotspots.json';
  let source: string | undefined = overlay?.get(path);
  if (source === undefined) {
    const policy = await PathPolicy.create(root, { allowHidden: true });
    try {
      const file = await policy.resolveFile(path);
      source = await readFile(file, { encoding: 'utf8', ...(signal ? { signal } : {}) });
    } catch (error) {
      if (isMissing(error) || hasErrorCode(error, 'file_not_found'))
        return { items: [], issues: [] };
      return {
        items: [],
        issues: [
          {
            severity: 'error',
            code: 'hotspots-read-failed',
            message: issueMessage(error),
            documentPath: path,
          },
        ],
      };
    }
  }
  try {
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('root must be an object');
    const items: HotspotInput[] = [];
    for (const [screen, rawItems] of Object.entries(value)) {
      if (!Array.isArray(rawItems)) throw new Error(`hotspots for ${screen} must be an array`);
      for (const raw of rawItems) {
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.transition !== 'string' ||
          !['x', 'y', 'width', 'height'].every(
            (key) => typeof raw[key] === 'number' && Number.isFinite(raw[key]),
          ) ||
          (raw.allowDuplicate !== undefined && typeof raw.allowDuplicate !== 'boolean')
        )
          throw new Error(`invalid hotspot for ${screen}`);
        items.push({
          screen,
          transition: raw.transition,
          x: raw.x,
          y: raw.y,
          width: raw.width,
          height: raw.height,
          ...(raw.allowDuplicate === undefined ? {} : { allowDuplicate: raw.allowDuplicate }),
        });
      }
    }
    return { items, issues: [] };
  } catch (error) {
    return {
      items: [],
      issues: [
        {
          severity: 'error',
          code: 'invalid-hotspots-json',
          message: `Invalid hotspots JSON: ${issueMessage(error)}.`,
          documentPath: path,
        },
      ],
    };
  }
}

export async function loadProject(
  inputRoot: string,
  options: LoadProjectOptions = {},
): Promise<LoadedProject> {
  options.signal?.throwIfAborted();
  const input = resolve(inputRoot);
  const repositoryRoot = resolve(options.repositoryRoot ?? dirname(input));
  const now = options.now ? new Date(options.now.getTime()) : new Date();
  const staleDays =
    options.staleDays === undefined || options.staleDays < 0 ? 90 : options.staleDays;
  const loaded = await loadSiteConfig(repositoryRoot);
  const locale = selectLocaleProfile(loaded, input);
  const version = documentationVersionDiagnostic(loaded.config);
  if (version) {
    const emptyIndex: DocumentIndex = {
      documents: [],
      byPath: new Map(),
      collections: new Map(),
      directories: new Set(),
      healthOutputPath: 'health.html',
      issues: [],
    };
    const emptyInventory: ProjectInventory = {
      root: loaded.repositoryRoot,
      entries: new Map([['.', { kind: 'directory', safe: true }]]),
      lookup: () => undefined,
      exists: () => false,
      matches: () => [],
    };
    const compiled = compileDocumentIndex(emptyIndex, {
      now,
      staleDays,
      links: { repositoryRoot: loaded.repositoryRoot, documentRoot: locale.root },
      repository: emptyInventory,
      sourceIssues: [
        {
          severity: 'error',
          code: version.code,
          message: version.message,
          ...(version.migration ? { migration: version.migration } : {}),
          documentPath: '.toudocu/config.yml',
        },
      ],
    });
    return {
      ...compiled,
      config: loaded.config,
      locale,
      snapshot: { root: locale.root, markdown: [], openAPI: [], issues: [] },
      inventory: emptyInventory,
      branding: loaded.branding,
      screenAssets: new Map(),
    };
  }
  const projectChangelog = await readProjectChangelog(loaded.repositoryRoot, options.signal);
  const snapshot = await readSourceSnapshot(locale.root, {
    excludedRoots: locale.excludedRoots,
    ...(locale.root === loaded.repositoryRoot ? { excludeMarkdown: ['CHANGELOG.md'] } : {}),
    ...(options.excludes ? { excludes: options.excludes } : {}),
    ...(options.overlay ? { overlay: options.overlay } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const inventory = await readRepositoryInventory(loaded.repositoryRoot, {
    excludedRoots: locale.excludedRoots,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const index = buildDocumentIndex(snapshot.markdown, { now, staleDays });
  const screenAssets = makeScreenAssets(index.documents, snapshot.root, inventory.root, inventory);
  const hotspots = await readHotspots(snapshot.root, options.overlay, options.signal);
  const sourceIssues: Issue[] = [
    ...snapshot.issues.map(issueFromSource),
    ...projectChangelog.issues,
    ...hotspots.issues,
  ];
  const compiled = compileDocumentIndex(index, {
    now,
    staleDays,
    links: {
      repositoryRoot: inventory.root,
      documentRoot: snapshot.root,
      ...(options.repositoryUrl
        ? { repositoryUrl: options.repositoryUrl.replace(/\/+$/u, '') }
        : {}),
      repositoryRef: options.repositoryRef?.trim() || 'main',
      inventory: inventory.lookup,
    },
    repository: {
      ...inventory,
      documentationPath: (candidate, sourcePath) => {
        const value = candidate.trim().replaceAll('\\', '/');
        if (!value || /[*?[]/u.test(value) || value.includes('://')) return undefined;
        const candidates = [
          resolve(inventory.root, value),
          resolve(
            value.startsWith('../') ? dirname(resolve(snapshot.root, sourcePath)) : snapshot.root,
            value,
          ),
        ];
        for (const absolute of candidates) {
          const entry = inventory.lookup(absolute);
          if (!entry?.safe || entry.kind !== 'file') continue;
          if (isInside(snapshot.root, absolute)) return sourcePathFor(absolute, snapshot.root);
          if (isInside(inventory.root, absolute)) return sourcePathFor(absolute, inventory.root);
        }
        return undefined;
      },
    },
    screens: { assets: screenAssets, hotspots: hotspots.items },
    openAPI: snapshot.openAPI,
    ...(projectChangelog.source
      ? {
          projectChangelog: projectChangelog.source,
          projectChangelogTitle: projectChangelogTitle(locale.locale),
        }
      : {}),
    sourceIssues,
    localization: { locale: locale.locale, profile: locale.profile },
  });
  return {
    ...compiled,
    config: loaded.config,
    locale,
    snapshot,
    inventory,
    branding: loaded.branding,
    screenAssets: screenAssets.files,
  };
}

export type { LoadedConfig, SelectedLocale };

/** Resolve impact paths from the inventory; inspect only existence for escaping targets. */
export function documentationImpactPathStatus(
  project: LoadedProject,
  value: string,
  document: string,
): 'found' | 'missing' | 'outside' | 'absolute' {
  if (isAbsolute(value)) return 'absolute';
  let unsafe = false;
  for (const base of [
    project.inventory.root,
    project.snapshot.root,
    dirname(resolve(project.snapshot.root, document)),
  ]) {
    const path = resolve(base, value);
    const entry = project.inventory.lookup(path);
    if (entry?.safe) return 'found';
    // Match the legacy diagnostic without opening contents outside the root:
    // nonexistent targets are missing; existing escaping targets are unsafe.
    if (entry || (!isInside(project.inventory.root, path) && existsSync(path))) unsafe = true;
  }
  return unsafe ? 'outside' : 'missing';
}

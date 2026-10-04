import type { Issue } from '@toudocu/contracts';
import type { Link } from '../markdown/model.js';
import { naturalCompare, type DocumentIndex } from './project.js';
import type { Document } from './document.js';

const activeAssetExtensions = new Set([
  '.html',
  '.htm',
  '.xhtml',
  '.js',
  '.mjs',
  '.cjs',
  '.svg',
  '.svgz',
  '.xml',
]);
const safeImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp']);
const reservedOutputAssets = new Set([
  'assets/manifest.json',
  'assets/portal.css',
  'assets/portal.js',
  'assets/screen-map.css',
  'assets/screen-map.js',
  'assets/playable-flow.css',
  'assets/playable-flow.js',
  'assets/mermaid.tiny.js',
  'assets/mermaid.LICENSE.txt',
  'assets/favicon.svg',
  'assets/serve.css',
  'assets/serve.js',
  'assets/editor.css',
  'assets/editor.js',
  'assets/changes.css',
  'assets/changes.js',
  'assets/api-docs.js',
  'assets/swagger-ui.css',
  'assets/swagger-ui-bundle.js',
  'assets/swagger-ui-standalone-preset.js',
  'assets/codemirror.js',
  'assets/codemirror.LICENSE.txt',
  'assets/codemirror.checksums.txt',
  'data/search-index.json',
  'data/navigation.json',
  'data/relations.json',
  'data/screens.json',
  'data/use-cases/index.json',
  'report.json',
]);

export interface LinkInventoryEntry {
  kind: 'file' | 'directory';
  /** False means the adapter found a symlink/escape or another unsafe target. */
  safe: boolean;
}

/** Filesystem knowledge supplied by an adapter; core never calls the filesystem. */
export type LinkInventory = (absolutePath: string) => LinkInventoryEntry | undefined;

export interface LinkResolutionOptions {
  repositoryRoot: string;
  documentRoot: string;
  repositoryUrl?: string;
  repositoryRef?: string;
  inventory?: LinkInventory;
}

export interface ResolvedLink extends Link {
  href: string;
  external: boolean;
  broken: boolean;
  blocked: boolean;
  brokenAnchor: boolean;
  repositoryEscape: boolean;
  repositoryAsset: boolean;
  activeAsset: boolean;
  unsafeImage: boolean;
  repositoryPath?: string;
  repositoryKind?: 'blob' | 'tree';
  assetPath?: string;
  generatedTarget?: string;
  targetDocumentPath?: string;
}

export interface LinkResolutionResult {
  linksByPath: Map<string, ResolvedLink[]>;
  assets: Map<string, string>;
  issues: Issue[];
}

export interface ModuleUseCaseLinks {
  moduleToUseCases: Map<string, string[]>;
  useCaseToModules: Map<string, string[]>;
  issues: Issue[];
}

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

function normalizePath(value: string): string {
  const source = normalizeSlashes(value);
  const absolute = source.startsWith('/');
  const result: string[] = [];
  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (result.length > 0 && result.at(-1) !== '..') result.pop();
      else if (!absolute) result.push(part);
      continue;
    }
    result.push(part);
  }
  const joined = result.join('/');
  return absolute ? `/${joined}`.replace(/\/$/u, '') || '/' : joined || '.';
}

function joinPath(base: string, child: string): string {
  return normalizePath(`${normalizeSlashes(base).replace(/\/$/u, '')}/${child}`);
}

function directoryPath(value: string): string {
  const normalized = normalizePath(value);
  const slash = normalized.lastIndexOf('/');
  return slash < 0 ? '.' : normalized.slice(0, slash) || '/';
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizePath(root);
  const normalizedCandidate = normalizePath(candidate);
  if (normalizedRoot === '/') return normalizedCandidate.startsWith('/');
  return (
    normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`)
  );
}

function relativePath(root: string, candidate: string): string | undefined {
  if (!isInside(root, candidate)) return undefined;
  const normalizedRoot = normalizePath(root);
  const normalizedCandidate = normalizePath(candidate);
  return normalizedCandidate === normalizedRoot
    ? ''
    : normalizedCandidate.slice(normalizedRoot.length + 1);
}

function splitLinkDestination(destination: string): { path: string; query: string; hash: string } {
  let value = destination.trim();
  const hashIndex = value.indexOf('#');
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : '';
  if (hashIndex >= 0) value = value.slice(0, hashIndex);
  const queryIndex = value.indexOf('?');
  const query = queryIndex >= 0 ? value.slice(queryIndex) : '';
  if (queryIndex >= 0) value = value.slice(0, queryIndex);
  return { path: value, query, hash };
}

function decodePathSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function destinationHasScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/iu.test(value);
}

function isExternalDestination(value: string): boolean {
  return value.startsWith('//') || destinationHasScheme(value);
}

function allowedExternalProtocol(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.startsWith('http:') ||
    lower.startsWith('https:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    value.startsWith('//')
  );
}

function hasControl(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? ''}`,
  );
}

function encodePathSegments(value: string): string {
  return normalizeSlashes(value).split('/').map(encodePathSegment).join('/');
}

function relativeUrl(fromOutputPath: string, toOutputPath: string): string {
  const fromParts = normalizeSlashes(directoryPath(fromOutputPath))
    .split('/')
    .filter((part) => part && part !== '.');
  const toParts = normalizeSlashes(toOutputPath).split('/').filter(Boolean);
  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  )
    shared++;
  const prefix = Array.from({ length: fromParts.length - shared }, () => '..');
  const result = [...prefix, ...toParts.slice(shared)].join('/');
  return result || toParts.at(-1) || '';
}

function anchorExists(document: Document, hash: string): boolean {
  if (!hash || hash === '#') return true;
  const decoded = decodePathSafely(hash.slice(1));
  const candidate = slugify(decoded);
  return document.headings.some((heading) => heading.id === decoded || heading.id === candidate);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{Nd}\s_-]/gu, '')
      .trim()
      .replace(/[\s_-]+/gu, '-')
      .replace(/^-|-$/gu, '') || 'section'
  );
}

function findDirectoryIndexTarget(
  index: DocumentIndex,
  normalizedTarget: string,
): { documentPath?: string; generatedTarget?: string } {
  const target = normalizedTarget.replace(/^\.\//u, '').replace(/\/$/u, '');
  const withIndex = target ? `${target}/index.md` : 'index.md';
  if (index.byPath.has(withIndex)) return { documentPath: withIndex };
  if (index.directories.has(target))
    return { generatedTarget: target ? `${target}/index.html` : 'index.html' };
  return {};
}

function newResolvedLink(link: Link): ResolvedLink {
  return {
    ...link,
    href: link.destination,
    external: false,
    broken: false,
    blocked: false,
    brokenAnchor: false,
    repositoryEscape: false,
    repositoryAsset: false,
    activeAsset: false,
    unsafeImage: false,
  };
}

function linkIssue(document: Document, link: Link, result: ResolvedLink): Issue | undefined {
  if (!result.blocked && !result.broken) return undefined;
  let message = result.broken
    ? `Broken link: ${link.destination}${result.brokenAnchor ? ' (anchor not found)' : ''}`
    : 'Unsafe link was blocked.';
  if (result.blocked) {
    if (result.activeAsset) message = 'Link to an active HTML/JavaScript file was blocked.';
    else if (result.unsafeImage) message = 'Image format is not allowed for safe embedding.';
    else if (result.repositoryAsset)
      message =
        'A resource outside the documentation cannot be embedded or opened without a repository URL.';
  }
  return {
    severity: document.type === 'architecture' ? 'error' : 'warning',
    code: result.broken ? 'broken-link' : 'blocked-link',
    message,
    documentPath: document.sourcePath,
    line: link.range.start.line,
  };
}

function resolveLink(
  index: DocumentIndex,
  sourceDocument: Document,
  link: Link,
  options: LinkResolutionOptions,
  assets: Map<string, string>,
): ResolvedLink {
  const result = newResolvedLink(link);
  const destination = link.destination.trim();
  if (!destination) {
    result.href = '#';
    return result;
  }

  const decodedDestination = decodePathSafely(destination);
  if (hasControl(destination) || hasControl(decodedDestination)) {
    result.blocked = true;
    result.href = '#';
    return result;
  }
  const externalDestination = isExternalDestination(destination)
    ? destination
    : isExternalDestination(decodedDestination)
      ? decodedDestination
      : undefined;
  if (externalDestination) {
    result.external = true;
    if (!allowedExternalProtocol(externalDestination)) {
      result.blocked = true;
      result.href = '#';
    }
    return result;
  }

  const { path: pathPart, query, hash } = splitLinkDestination(destination);
  if (!pathPart && hash) {
    result.href = hash;
    result.targetDocumentPath = sourceDocument.sourcePath;
    result.brokenAnchor = !anchorExists(sourceDocument, hash);
    result.broken = result.brokenAnchor;
    return result;
  }
  const decodedPath = normalizeSlashes(decodePathSafely(pathPart));
  if (
    pathPart.startsWith('/') ||
    pathPart.startsWith('\\') ||
    /^[a-z]:[\\/]/iu.test(pathPart) ||
    decodedPath.startsWith('/') ||
    decodedPath.startsWith('\\')
  ) {
    result.blocked = true;
    result.href = '#';
    return result;
  }

  const sourceAbsolute = joinPath(options.documentRoot, sourceDocument.sourcePath);
  const absoluteTarget = joinPath(directoryPath(sourceAbsolute), decodedPath);
  if (!isInside(options.repositoryRoot, absoluteTarget)) {
    result.blocked = true;
    result.repositoryEscape = true;
    result.href = '#';
    return result;
  }

  const targetDocumentPath = relativePath(options.documentRoot, absoluteTarget);
  if (targetDocumentPath === undefined) {
    result.repositoryPath = relativePath(options.repositoryRoot, absoluteTarget) ?? absoluteTarget;
    const info = options.inventory?.(absoluteTarget);
    if (!info) {
      result.broken = true;
      return result;
    }
    if (!info.safe) {
      result.blocked = true;
      result.repositoryEscape = true;
      result.href = '#';
      return result;
    }
    if (link.image || !options.repositoryUrl) {
      result.blocked = true;
      result.repositoryAsset = true;
      result.href = '#';
      return result;
    }
    result.repositoryKind = info.kind === 'directory' ? 'tree' : 'blob';
    result.external = true;
    const repositoryUrl = options.repositoryUrl.replace(/\/$/u, '');
    result.href = `${repositoryUrl}/${result.repositoryKind}/${encodePathSegment(options.repositoryRef ?? 'main')}/${encodePathSegments(result.repositoryPath)}${query}${hash}`;
    return result;
  }

  const targetPath = targetDocumentPath;
  const hasTrailingSlash = decodedPath.endsWith('/');
  const targetName = targetPath.slice(targetPath.lastIndexOf('/') + 1);
  const dot = targetName.lastIndexOf('.');
  const extension = dot >= 0 ? targetName.slice(dot).toLowerCase() : '';
  let resolvedDocumentPath: string | undefined;
  let generatedTarget: string | undefined;
  if (hasTrailingSlash) {
    ({ documentPath: resolvedDocumentPath, generatedTarget } = findDirectoryIndexTarget(
      index,
      targetPath,
    ));
  } else if (extension === '.md') {
    resolvedDocumentPath = index.byPath.has(targetPath) ? targetPath : undefined;
  } else if (!extension) {
    if (index.byPath.has(targetPath)) resolvedDocumentPath = targetPath;
    else if (index.byPath.has(`${targetPath}.md`)) resolvedDocumentPath = `${targetPath}.md`;
    else
      ({ documentPath: resolvedDocumentPath, generatedTarget } = findDirectoryIndexTarget(
        index,
        targetPath,
      ));
  }
  if (resolvedDocumentPath) {
    const targetDocument = index.byPath.get(resolvedDocumentPath);
    if (targetDocument) {
      result.targetDocumentPath = targetDocument.sourcePath;
      result.brokenAnchor = Boolean(hash && !anchorExists(targetDocument, hash));
      result.broken = result.brokenAnchor;
      result.href = `${relativeUrl(sourceDocument.outputPath, targetDocument.outputPath)}${query}${hash}`;
      return result;
    }
  }
  if (generatedTarget) {
    result.generatedTarget = generatedTarget;
    result.href = `${relativeUrl(sourceDocument.outputPath, generatedTarget)}${query}${hash}`;
    return result;
  }

  const info = options.inventory?.(absoluteTarget);
  if (!info) {
    result.broken = true;
    return result;
  }
  if (!info.safe) {
    result.blocked = true;
    result.repositoryEscape = true;
    result.href = '#';
    return result;
  }
  if (info.kind !== 'file') {
    result.broken = true;
    return result;
  }
  if (activeAssetExtensions.has(extension)) {
    result.blocked = true;
    result.activeAsset = true;
    result.href = '#';
    return result;
  }
  if (link.image && !safeImageExtensions.has(extension)) {
    result.blocked = true;
    result.unsafeImage = true;
    result.href = '#';
    return result;
  }
  const outputAssetPath = reservedOutputAssets.has(targetPath)
    ? `_files/${targetPath}`
    : targetPath;
  assets.set(outputAssetPath, absoluteTarget);
  result.assetPath = outputAssetPath;
  result.href = `${relativeUrl(sourceDocument.outputPath, outputAssetPath)}${query}${hash}`;
  return result;
}

/** Resolve one document against the original index after a hypothetical path move. */
export function resolveDocumentLinks(
  index: DocumentIndex,
  sourceDocument: Document,
  options: LinkResolutionOptions,
): ResolvedLink[] {
  const assets = new Map<string, string>();
  return sourceDocument.links.map((link) =>
    resolveLink(index, sourceDocument, link, options, assets),
  );
}

/** Resolve links without reading files; adapters provide inventory/symlink facts. */
export function resolveLinks(
  index: DocumentIndex,
  options: LinkResolutionOptions,
): LinkResolutionResult {
  const linksByPath = new Map<string, ResolvedLink[]>();
  const assets = new Map<string, string>();
  const issues: Issue[] = [];
  for (const document of index.documents) {
    const resolved = document.links.map((link) =>
      resolveLink(index, document, link, options, assets),
    );
    linksByPath.set(document.sourcePath, resolved);
    for (const link of resolved) {
      const issue = linkIssue(document, link, link);
      if (issue) issues.push(issue);
    }
  }
  return { linksByPath, assets, issues };
}

function relationId(document: Document): string {
  return document.metadata.id?.trim() || document.sourcePath;
}

function canonicalText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}

/** Connect module/use-case documents from links and the `module` metadata field. */
export function connectUseCasesAndModules(
  index: DocumentIndex,
  linksByPath: ReadonlyMap<string, readonly ResolvedLink[]>,
): ModuleUseCaseLinks {
  const modules = [...(index.collections.get('module') ?? [])];
  const useCases = [...(index.collections.get('use-case') ?? [])];
  const moduleByName = new Map<string, Document>();
  for (const module of modules) {
    moduleByName.set(canonicalText(module.title), module);
    const id = module.metadata.id?.trim();
    if (id) moduleByName.set(canonicalText(id), module);
  }
  const moduleToUseCases = new Map<string, string[]>(
    modules.map((module) => [relationId(module), []]),
  );
  const useCaseToModules = new Map<string, string[]>(
    useCases.map((useCase) => [relationId(useCase), []]),
  );
  const byPath = index.byPath;
  for (const useCase of useCases) {
    const related = new Set<Document>();
    for (const link of linksByPath.get(useCase.sourcePath) ?? []) {
      const target = link.targetDocumentPath ? byPath.get(link.targetDocumentPath) : undefined;
      if (target?.type === 'module') related.add(target);
    }
    for (const module of modules) {
      const links = linksByPath.get(module.sourcePath) ?? [];
      if (links.some((link) => link.targetDocumentPath === useCase.sourcePath)) related.add(module);
    }
    const metadataModule = useCase.metadata.module?.trim();
    if (metadataModule) {
      const module = moduleByName.get(canonicalText(metadataModule));
      if (module) related.add(module);
    }
    const sorted = [...related].sort((left, right) =>
      naturalCompare(left.sourcePath, right.sourcePath),
    );
    const useCaseId = relationId(useCase);
    useCaseToModules.set(useCaseId, sorted.map(relationId));
    for (const module of sorted) {
      const moduleId = relationId(module);
      moduleToUseCases.get(moduleId)?.push(useCaseId);
    }
  }
  const issues: Issue[] = [];
  for (const module of modules) {
    const id = relationId(module);
    const related = moduleToUseCases.get(id) ?? [];
    related.sort((left, right) => naturalCompare(left, right));
    if (related.length === 0)
      issues.push({
        severity: 'warning',
        code: 'module-without-use-case',
        message: 'Module is not linked to any use case.',
        documentPath: module.sourcePath,
      });
  }
  return { moduleToUseCases, useCaseToModules, issues };
}

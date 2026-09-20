import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import {
  addChangeSummary,
  buildDocumentationChange,
  buildTaskImpact,
  coalesceEntityRenames,
  declaredTaskDocumentation,
  documentationVersionDiagnostic,
  naturalCompare,
  parseMarkdown,
  classifyChangePath,
  taskScopePaths,
  type MarkdownAnalysis,
} from '@toudocu/core';
import { ChangeSetReportV1Schema, ToudocuError, type ChangeSetReportV1 } from '@toudocu/contracts';
import { loadSiteConfig, selectLocaleProfile } from '../filesystem/config.js';
import { isInside, isMissing, PathPolicy } from '../filesystem/path-policy.js';
import { scopePattern } from '../filesystem/inventory.js';
import { openGitRepository, type GitSide } from '../git/repository.js';
import { buildAssetDiffMetadata } from './assets.js';

type Change = ChangeSetReportV1['changes'][number];
type Issue = Change['diagnostics'][number];
type AssetDiffMetadata = NonNullable<Change['asset']>;
type ChangeSide = ChangeSetReportV1['comparison']['base'];

interface ParsedMarkdownSide {
  analysis: MarkdownAnalysis;
  source: string;
  path: string;
}

export interface AssetMetadataRequest {
  path: string;
  oldPath: string;
  status: string;
  oldContent: Uint8Array;
  newContent: Uint8Array;
}

export type AssetMetadataResolver = (
  request: AssetMetadataRequest,
) => AssetDiffMetadata | undefined | Promise<AssetDiffMetadata | undefined>;

export interface DocumentationChangesOptions {
  inputDirectory?: string;
  repositoryRoot?: string;
  base?: string;
  target?: string;
  branchBase?: string;
  file?: string;
  taskID?: string;
  taskTree?: boolean;
  status?: string;
  entityType?: string;
  module?: string;
  permanentOnly?: boolean;
  renameSimilarity?: number;
  maxSourceDiffBytes?: number;
  maxRenderedFileBytes?: number;
  includeTaskArtifacts?: boolean;
  includeAssets?: boolean;
  forceIncludeAssets?: boolean;
  translationInput?: boolean;
  semanticDiff?: boolean;
  renderedDiff?: boolean;
  includeRenderedHTML?: boolean;
  excludes?: readonly string[];
  omitSourceDiff?: boolean;
  assetMetadata?: AssetMetadataResolver;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface TaskSide {
  id: string;
  path: string;
  side: ParsedMarkdownSide;
}

interface TaskSelection {
  taskPath: string;
  tasks: TaskSide[];
}

const stableEntityID =
  /\b(?:UC|FLOW|SC|TR|MOD|ADR|TASK|BUG|BR|INV|CONTRACT)-[A-Z0-9][A-Z0-9-]*\b/gu;

/** Build a change report using repository-local, read-only Git operations. */
export async function buildDocumentationChanges(
  inputRootOrOptions: string | DocumentationChangesOptions,
  suppliedOptions: DocumentationChangesOptions = {},
): Promise<ChangeSetReportV1> {
  const inputRoot =
    typeof inputRootOrOptions === 'string' ? inputRootOrOptions : inputRootOrOptions.inputDirectory;
  const options = typeof inputRootOrOptions === 'string' ? suppliedOptions : inputRootOrOptions;
  if (!inputRoot) {
    throw new ToudocuError('invalid_path', 'an input documentation directory is required');
  }
  options.signal?.throwIfAborted();
  const initialRepository = await openGitRepository(inputRoot, {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
  const configRoot = await resolveConfigurationRoot(
    initialRepository.root,
    initialRepository.docsRoot,
    options,
  );
  const loaded = await loadSiteConfig(configRoot);
  const version = documentationVersionDiagnostic(loaded.config);
  if (version) {
    return migrationReport(version);
  }

  const settings = changeSettings(
    loaded.config.changes,
    options,
    initialRepository.docsRelative,
    configRoot,
    initialRepository.root,
  );
  const repository = await openGitRepository(inputRoot, {
    ...(options.signal ? { signal: options.signal } : {}),
    similarity: settings.renameSimilarity,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
  });
  selectLocaleProfile(loaded, repository.docsRoot);
  const base = await resolveBase(repository, settings.base, settings.branchBase);
  const target = await resolveTarget(repository, settings.target);
  const comparison = { base: base.side, target: target.side };
  const repositoryState = await repository.repositoryState();
  const allChanges = await repository.changes(base.git, target.git);
  const report: ChangeSetReportV1 = {
    schemaVersion: 1,
    repository: repositoryState,
    comparison,
    changeSetDigest: '',
    summary: emptySummary(),
    changes: [],
    diagnostics: [],
  };
  const parsedSides = new Map<string, ParsedMarkdownSide>();

  for (const file of allChanges) {
    options.signal?.throwIfAborted();
    if (!selectedFile(file, settings)) {
      continue;
    }
    const classification = classifyChangePath(repository.docsRelative, file.path);
    if (!includedChange(classification, file.path, settings)) {
      continue;
    }
    const built = await buildChange(repository, base.git, target.git, file, settings);
    report.changes.push(built.change);
    addChangeSummary(report.summary, built.change);
    rememberSides(parsedSides, built, file.status);
  }

  coalesceEntityRenames(report, parsedSides);
  report.summary = rebuildSummary(report.changes);

  let taskSelection: TaskSelection | undefined;
  if (settings.taskID) {
    taskSelection = await loadTaskSelection(
      repository,
      target.git,
      settings.taskID,
      settings.taskTree,
    );
    const taskImpact = await buildImpact(
      repository,
      target.git,
      report,
      taskSelection,
      repository.docsRelative,
    );
    report.taskImpact = taskImpact;
  }

  applyFilters(report, settings, taskSelection, repository.docsRelative);
  const normalized = normalizeReport(report);
  normalized.changeSetDigest = digestReport(normalized);
  return normalized;
}

interface ChangeSettings {
  base: string;
  target: string;
  branchBase: string;
  file: string;
  taskID: string;
  taskTree: boolean;
  status: string;
  entityType: string;
  module: string;
  permanentOnly: boolean;
  renameSimilarity: number;
  maxSourceDiffBytes: number;
  maxRenderedFileBytes: number;
  includeTaskArtifacts: boolean;
  includeAssets: boolean;
  excludes: string[];
  omitSourceDiff: boolean;
  semanticDiff: boolean;
  renderedDiff: boolean;
  includeRenderedHTML: boolean;
  assetMetadata: AssetMetadataResolver | undefined;
  signal: AbortSignal | undefined;
  timeoutMs: number | undefined;
}

function changeSettings(
  config: {
    defaultBaseRef: string;
    maxSourceDiffBytes: number;
    maxRenderedFileBytes: number;
    includeTaskArtifacts: boolean;
    includeAssets: boolean;
    semanticDiff: boolean;
    renderedDiff: boolean;
    exclude: string[];
    renameSimilarity: number;
  },
  options: DocumentationChangesOptions,
  docsRel: string,
  configRoot: string,
  repositoryRoot: string,
): ChangeSettings {
  const translationExcludes = [
    `${docsRel.replace(/\/+$/u, '')}/generated/**`,
    `${docsRel.replace(/\/+$/u, '')}/cache/**`,
  ];
  const translationInput = options.translationInput === true;
  const configuredExcludes = translationInput
    ? translationExcludes
    : options.excludes !== undefined
      ? [...options.excludes]
      : [...config.exclude];
  const configRelative = relative(repositoryRoot, configRoot).replaceAll('\\', '/');
  const excludes = translationInput
    ? configuredExcludes
    : configuredExcludes.map((pattern) =>
        configRelative && configRelative !== '.'
          ? `${configRelative}/${pattern.replaceAll('\\', '/')}`
          : pattern,
      );
  return {
    base: options.base?.trim() || config.defaultBaseRef || 'HEAD',
    target: options.target?.trim() || 'working-tree',
    branchBase: options.branchBase?.trim() ?? '',
    file: normalizeOptionPath(options.file) ?? '',
    taskID: options.taskID?.trim() ?? '',
    taskTree: options.taskTree === true,
    status: options.status?.trim() ?? '',
    entityType: options.entityType?.trim() ?? '',
    module: options.module?.trim() ?? '',
    permanentOnly: options.permanentOnly === true,
    renameSimilarity: options.renameSimilarity ?? config.renameSimilarity,
    maxSourceDiffBytes: options.maxSourceDiffBytes || config.maxSourceDiffBytes,
    maxRenderedFileBytes: options.maxRenderedFileBytes || config.maxRenderedFileBytes,
    includeTaskArtifacts: options.translationInput
      ? true
      : (options.includeTaskArtifacts ?? config.includeTaskArtifacts),
    includeAssets: options.translationInput
      ? true
      : options.forceIncludeAssets
        ? true
        : (options.includeAssets ?? config.includeAssets),
    excludes,
    omitSourceDiff: options.omitSourceDiff === true,
    semanticDiff: options.semanticDiff ?? config.semanticDiff,
    renderedDiff: options.renderedDiff ?? config.renderedDiff,
    includeRenderedHTML: options.includeRenderedHTML === true,
    assetMetadata:
      options.assetMetadata ??
      ((request) => buildAssetDiffMetadata(request.oldContent, request.newContent, request.status)),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  };
}

async function resolveConfigurationRoot(
  repositoryRoot: string,
  docsRoot: string,
  options: DocumentationChangesOptions,
): Promise<string> {
  const root = resolve(options.repositoryRoot ?? repositoryRoot);
  if (!isInside(repositoryRoot, root) || !isInside(root, docsRoot)) {
    throw new ToudocuError(
      'invalid_repository_root',
      'repository root must be inside the Git root and contain the documentation root',
      { path: root },
    );
  }
  return (await PathPolicy.create(root, { allowHidden: true })).root;
}

async function resolveBase(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  baseRef: string,
  branchBase?: string,
): Promise<{ git: GitSide; side: ChangeSide }> {
  let ref = baseRef;
  let resolved = '';
  if (branchBase) {
    let merge: string;
    try {
      merge = await repository.mergeBase(branchBase, 'HEAD');
    } catch (error) {
      throw new ToudocuError(
        'git-merge-base-not-found',
        `merge-base for ${JSON.stringify(branchBase)} and HEAD not found`,
        { cause: error, exitCode: 2 },
      );
    }
    ref = `merge-base(${branchBase}, HEAD)`;
    resolved = merge;
  } else if (baseRef !== 'index') {
    resolved = await repository.resolveCommit(baseRef);
  }
  const side: ChangeSide = {
    type: baseRef === 'index' && !branchBase ? 'index' : 'commit',
    ...(ref ? { revision: ref } : {}),
    ...(resolved ? { resolved } : {}),
    displayRef: ref,
  };
  const git: GitSide = side.type === 'index' ? { type: 'index' } : { type: 'commit', resolved };
  return { git, side };
}

async function resolveTarget(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  targetRef: string,
): Promise<{ git: GitSide; side: ChangeSide }> {
  if (targetRef === 'working-tree' || targetRef === 'index') {
    return {
      git: { type: targetRef },
      side: { type: targetRef, displayRef: targetRef },
    };
  }
  let resolved: string;
  try {
    resolved = await repository.resolveCommit(targetRef);
  } catch (error) {
    throw new ToudocuError(
      'git-target-not-found',
      `git revision ${JSON.stringify(targetRef)} not found`,
      { cause: error, exitCode: 2 },
    );
  }
  const displayRef = targetRef === 'HEAD' ? 'HEAD' : targetRef;
  return {
    git: { type: 'commit', resolved },
    side: { type: 'commit', revision: displayRef, resolved, displayRef },
  };
}

async function buildChange(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  base: GitSide,
  target: GitSide,
  file: {
    status: string;
    path: string;
    oldPath?: string;
    state: Change['gitState'];
  },
  settings: ChangeSettings,
): Promise<{
  change: Change;
  oldSide?: ParsedMarkdownSide;
  newSide?: ParsedMarkdownSide;
}> {
  const oldPath = file.oldPath || file.path;
  const oldVersion = await readVersion(repository, base, file.status, oldPath, true);
  const newVersion = await readVersion(repository, target, file.status, file.path, false);
  let patch: Uint8Array | undefined;
  let patchError: unknown;
  const totalBytes = oldVersion.content.byteLength + newVersion.content.byteLength;
  const binary = isBinaryContent(oldVersion.content) || isBinaryContent(newVersion.content);
  const maxBytes = settings.maxSourceDiffBytes > 0 ? settings.maxSourceDiffBytes : 2 * 1024 * 1024;
  if (!binary && totalBytes <= maxBytes) {
    try {
      patch = await repository.diff(base, target, file);
    } catch (error) {
      patchError = error;
    }
  }
  const classification = classifyChangePath(repository.docsRelative, file.path);
  const asset =
    classification === 'asset' && settings.assetMetadata
      ? await settings.assetMetadata({
          path: file.path,
          oldPath,
          status: file.status,
          oldContent: oldVersion.content,
          newContent: newVersion.content,
        })
      : undefined;
  const result = buildDocumentationChange(
    {
      status: file.status,
      path: file.path,
      ...(file.oldPath ? { oldPath: file.oldPath } : {}),
      gitState: publicGitState(file.state),
      docsRel: repository.docsRelative,
      oldContent: oldVersion.content,
      newContent: newVersion.content,
      ...(patch ? { patch } : {}),
      ...(patchError !== undefined ? { patchError } : {}),
      ...(oldVersion.error !== undefined ? { oldContentError: oldVersion.error } : {}),
      ...(newVersion.error !== undefined ? { newContentError: newVersion.error } : {}),
      ...(asset !== undefined ? { asset } : {}),
    },
    {
      maxSourceDiffBytes: settings.maxSourceDiffBytes,
      maxRenderedFileBytes: settings.maxRenderedFileBytes,
      omitSourceDiff: settings.omitSourceDiff,
      renderedDiff: settings.renderedDiff,
      semanticDiff: settings.semanticDiff,
    },
  );
  if (settings.includeRenderedHTML && result.change.renderedDiffAvailable) {
    result.change.renderedBefore = parseMarkdown(result.oldSide?.source ?? '', oldPath).render();
    result.change.renderedAfter = parseMarkdown(result.newSide?.source ?? '', file.path).render();
  }
  return result;
}

function publicGitState(state: Change['gitState']): Change['gitState'] {
  return {
    staged: state.staged,
    unstaged: state.unstaged,
    untracked: state.untracked,
    ...(state.committedInBranch ? { committedInBranch: true } : {}),
  };
}

async function readVersion(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  side: GitSide,
  status: string,
  path: string,
  old: boolean,
): Promise<{ content: Uint8Array; error?: unknown }> {
  const omittedSide =
    (old && (status === 'added' || status === 'untracked')) || (!old && status === 'deleted');
  if (omittedSide) {
    return { content: new Uint8Array() };
  }
  try {
    return { content: await repository.content(side, path) };
  } catch (error) {
    if (isAbsent(error)) {
      return { content: new Uint8Array() };
    }
    return { content: new Uint8Array(), error };
  }
}

function rememberSides(
  map: Map<string, ParsedMarkdownSide>,
  result: { oldSide?: ParsedMarkdownSide; newSide?: ParsedMarkdownSide },
  status: string,
): void {
  if (status === 'deleted') {
    if (result.oldSide) map.set(result.oldSide.path, result.oldSide);
    return;
  }
  if (status === 'added' || status === 'untracked') {
    if (result.newSide) map.set(result.newSide.path, result.newSide);
    return;
  }
  if (result.oldSide) map.set(result.oldSide.path, result.oldSide);
  if (result.newSide) map.set(result.newSide.path, result.newSide);
}

function selectedFile(file: { path: string; oldPath?: string }, settings: ChangeSettings): boolean {
  return !settings.file || settings.file === file.path || settings.file === file.oldPath;
}

function includedChange(classification: string, path: string, settings: ChangeSettings): boolean {
  if (!settings.includeTaskArtifacts && classification === 'work-artifact') {
    return false;
  }
  if (!settings.includeAssets && classification === 'asset') {
    return false;
  }
  return !excludedPath(path, settings.excludes);
}

function excludedPath(path: string, patterns: readonly string[]): boolean {
  const normalized = path.replaceAll('\\', '/');
  return patterns.some((pattern) => {
    const value = pattern.trim().replaceAll('\\', '/');
    if (!value) {
      return false;
    }
    const prefix = value.replace(/\*+$/u, '');
    return (
      (prefix !== '' && normalized.startsWith(prefix)) ||
      Boolean(scopePattern(value)?.test(normalized))
    );
  });
}

async function loadTaskSelection(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  target: GitSide,
  taskID: string,
  tree: boolean,
): Promise<TaskSelection> {
  if (tree && !taskID.startsWith('TASK-')) {
    throw new ToudocuError(
      'task-selection-failed',
      '--tree is available only for TASK-* work items',
    );
  }
  const documents = await repository.taskDocuments(target, tree ? undefined : taskID);
  const root = documents.get(taskID);
  if (!root) {
    throw new ToudocuError('task-selection-failed', `task ${taskID} not found`);
  }
  const selected = [taskID];
  if (tree) {
    const children = new Map<string, string[]>();
    for (const [id, task] of documents) {
      if (!id.startsWith('TASK-')) {
        continue;
      }
      const side = parseTaskSide(task.content, task.path);
      const parent = side.analysis.metadata.find((item) => item.key === 'parentTask')?.value.trim();
      if (parent) children.set(parent, [...(children.get(parent) ?? []), id]);
    }
    const seen = new Set(selected);
    const addChildren = (parent: string): void => {
      const ids = [...(children.get(parent) ?? [])].sort(naturalCompare);
      for (const id of ids) {
        if (seen.has(id)) {
          continue;
        }
        seen.add(id);
        selected.push(id);
        addChildren(id);
      }
    };
    addChildren(taskID);
  }
  const tasks = selected.map((id) => {
    const document = documents.get(id);
    if (!document) {
      throw new ToudocuError('task-selection-failed', `task ${id} not found`);
    }
    return { id, path: document.path, side: parseTaskSide(document.content, document.path) };
  });
  return { taskPath: root.path, tasks };
}

function parseTaskSide(content: Uint8Array, path: string): ParsedMarkdownSide {
  const source = new TextDecoder('utf-8', { fatal: false }).decode(content);
  return { source, path, analysis: parseMarkdown(source, path).analysis };
}

async function buildImpact(
  repository: Awaited<ReturnType<typeof openGitRepository>>,
  target: GitSide,
  report: ChangeSetReportV1,
  selection: TaskSelection,
  docsRel: string,
): Promise<NonNullable<ChangeSetReportV1['taskImpact']>> {
  const paths = new Set<string>();
  for (const task of selection.tasks) {
    for (const path of declaredTaskDocumentation(task.side.analysis, task.path, docsRel)) {
      paths.add(path);
    }
  }
  const existing = new Set<string>();
  for (const path of paths) {
    try {
      await repository.content(target, path);
      existing.add(path);
    } catch (error) {
      if (!isAbsent(error)) {
        throw error;
      }
    }
  }
  const root = selection.tasks[0]!;
  return buildTaskImpact(report, root.id, {
    task: root,
    selectedTasks: selection.tasks.slice(1),
    docsRel,
    pathExists: existing,
    scopeMatch: (pattern, path) => Boolean(scopePattern(pattern)?.test(path)),
  });
}

function applyFilters(
  report: ChangeSetReportV1,
  settings: ChangeSettings,
  selection: TaskSelection | undefined,
  docsRel: string,
): void {
  const taskPaths = new Set<string>();
  const taskEntities = new Set<string>();
  if (selection) {
    for (const task of selection.tasks) {
      taskPaths.add(task.path);
      for (const path of declaredTaskDocumentation(task.side.analysis, task.path, docsRel)) {
        taskPaths.add(path);
      }
      for (const path of taskScopePaths(task.side.analysis)) {
        taskPaths.add(path);
      }
      for (const match of task.side.source.matchAll(stableEntityID)) {
        taskEntities.add(match[0]!);
      }
    }
  }
  report.changes = report.changes.filter((change) => {
    if (settings.file && settings.file !== change.path && settings.file !== change.oldPath)
      return false;
    if (settings.status && settings.status !== change.status) {
      return false;
    }
    if (settings.permanentOnly && change.classification !== 'permanent-documentation') {
      return false;
    }
    if (settings.entityType && !hasEntityType(change, settings.entityType)) {
      return false;
    }
    if (settings.module && !changeContainsValue(change, settings.module)) {
      return false;
    }
    if (selection && !relatedToTask(change, taskPaths, taskEntities)) {
      return false;
    }
    return true;
  });
  report.summary = rebuildSummary(report.changes);
}

function hasEntityType(change: Change, type: string): boolean {
  return [...change.entitiesBefore, ...change.entitiesAfter].some((entity) => entity.type === type);
}

function changeContainsValue(change: Change, value: string): boolean {
  const needle = value.toLowerCase();
  if (change.path.toLowerCase().includes(needle)) {
    return true;
  }
  for (const entity of [...change.entitiesBefore, ...change.entitiesAfter]) {
    if (`${entity.id ?? ''} ${entity.title ?? ''}`.toLowerCase().includes(needle)) {
      return true;
    }
  }
  return change.semanticChanges.some((item) => item.summary.toLowerCase().includes(needle));
}

function relatedToTask(
  change: Change,
  paths: ReadonlySet<string>,
  entities: ReadonlySet<string>,
): boolean {
  if (paths.has(change.path) || paths.has(change.oldPath ?? '')) {
    return true;
  }
  if (
    [...change.entitiesBefore, ...change.entitiesAfter].some(
      (entity) => entity.id && entities.has(entity.id),
    )
  ) {
    return true;
  }
  if (
    change.relationChanges.some(
      (relation) =>
        (relation.source.id && entities.has(relation.source.id)) ||
        (relation.target.id && entities.has(relation.target.id)),
    )
  ) {
    return true;
  }
  return false;
}

function emptySummary(): ChangeSetReportV1['summary'] {
  return {
    files: {
      added: 0,
      modified: 0,
      deleted: 0,
      renamed: 0,
      copied: 0,
      typeChanged: 0,
      untracked: 0,
    },
    lines: { added: 0, deleted: 0 },
    entities: {},
    classifications: {},
  };
}

function rebuildSummary(changes: readonly Change[]): ChangeSetReportV1['summary'] {
  const summary = emptySummary();
  for (const change of changes) {
    addChangeSummary(summary, change);
  }
  return summary;
}

function digestReport(report: ChangeSetReportV1): string {
  const normalized = normalizeReport(report);
  const copy = { ...normalized, changeSetDigest: '' };
  const json = goJSON(copy);
  return `sha256:${createHash('sha256').update(json).digest('hex')}`;
}

function normalizeReport(report: ChangeSetReportV1): ChangeSetReportV1 {
  if (report.summary.entities !== null) {
    report.summary.entities = sortedMap(report.summary.entities);
  }
  if (report.summary.classifications !== null) {
    report.summary.classifications = sortedMap(report.summary.classifications);
  }
  const normalized = ChangeSetReportV1Schema.parse(report);
  canonicalizeSemanticValues(normalized.changes);
  if (normalized.taskImpact) {
    canonicalizeSemanticValues(normalized.taskImpact.taskChanges);
  }
  return normalized;
}

function canonicalizeSemanticValues(changes: readonly Change[]): void {
  for (const change of changes) {
    for (const semantic of change.semanticChanges) {
      if (semantic.before !== undefined) {
        semantic.before = canonicalJSONValue(semantic.before);
      }
      if (semantic.after !== undefined) {
        semantic.after = canonicalJSONValue(semantic.after);
      }
    }
  }
}

function canonicalJSONValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJSONValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.includes('type') && keys.every((key) => ['id', 'type', 'title'].includes(key))) {
    return Object.fromEntries(
      ['id', 'type', 'title']
        .filter((key) => key in record)
        .map((key) => [key, canonicalJSONValue(record[key])]),
    );
  }
  return Object.fromEntries(
    keys.sort(compareUTF8).map((key) => [key, canonicalJSONValue(record[key])]),
  );
}

function goJSON(report: ChangeSetReportV1): string {
  const summaryMaps = report.summary;
  const summary = {
    ...report.summary,
    entities: sortedMap(summaryMaps.entities ?? {}),
    classifications: sortedMap(summaryMaps.classifications ?? {}),
  };
  const ordered = { ...report, summary };
  return JSON.stringify(ordered)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function sortedMap(values: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => compareUTF8(left, right)),
  );
}

function compareUTF8(left: string, right: string): number {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) {
      return (a[index] ?? 0) - (b[index] ?? 0);
    }
  }
  return a.length - b.length;
}

function migrationReport(issue: {
  code: string;
  message: string;
  migration?: string;
}): ChangeSetReportV1 {
  const report = {
    schemaVersion: 1 as const,
    repository: { root: '', dirty: false },
    comparison: { base: { type: '' }, target: { type: '' } },
    changeSetDigest: '',
    summary: {
      files: {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        copied: 0,
        typeChanged: 0,
        untracked: 0,
      },
      lines: { added: 0, deleted: 0 },
      entities: null,
      classifications: null,
    },
    changes: [],
    diagnostics: [
      {
        severity: 'error' as const,
        code: issue.code,
        message: issue.message,
        ...(issue.migration ? { migration: issue.migration } : {}),
        documentPath: '.toudocu/config.yml',
      },
    ],
  };
  return report;
}

function normalizeOptionPath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value.replaceAll('\\', '/');
}

function isAbsent(error: unknown): boolean {
  return isMissing(error) || (error instanceof ToudocuError && error.code === 'file_not_found');
}

function isBinaryContent(content: Uint8Array): boolean {
  if (content.includes(0)) {
    return true;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(content);
    return false;
  } catch {
    return true;
  }
}

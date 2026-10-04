import type { ChangeSetReportV1 } from '@toudocu/contracts';
import { classifyDocument } from '../documents/document.js';
import { parseMarkdown, type MarkdownDocument } from '../markdown/parse.js';
import type { MarkdownAnalysis } from '../markdown/model.js';
import { openAPIDiff } from './openapi.js';
import { mermaidBlockDiff } from './mermaid.js';
import { classifyChangePath, countPatchLines, parseSourceDiffHunks } from './patch.js';
import { renderedSectionDiff } from './sections.js';
import { buildScreenDiffMetadata } from './screen.js';
import { relationMarkdownDiff, semanticMarkdownDiff, type ParsedMarkdownSide } from './semantic.js';

type Change = ChangeSetReportV1['changes'][number];
type Issue = Change['diagnostics'][number];
type ChangeEntity = Change['entitiesBefore'][number];
type AssetDiffMetadata = NonNullable<Change['asset']>;

export interface DocumentChangeInput {
  status: string;
  path: string;
  oldPath?: string;
  gitState: Change['gitState'];
  docsRel: string;
  oldContent: Uint8Array;
  newContent: Uint8Array;
  patch?: Uint8Array;
  patchError?: unknown;
  oldContentError?: unknown;
  newContentError?: unknown;
  diagnostics?: readonly Issue[];
  asset?: AssetDiffMetadata;
}

export interface DocumentChangeOptions {
  maxSourceDiffBytes?: number;
  maxRenderedFileBytes?: number;
  omitSourceDiff?: boolean;
  renderedDiff?: boolean;
  semanticDiff?: boolean;
}

export interface DocumentChangeResult {
  change: Change;
  oldSide?: ParsedMarkdownSide;
  newSide?: ParsedMarkdownSide;
}

const defaultMaxBytes = 2 * 1024 * 1024;
const unicodeWhiteSpace =
  '[\\t-\\r \\u0085\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]';
const trimUnicodeWhiteSpace = new RegExp(`^${unicodeWhiteSpace}+|${unicodeWhiteSpace}+$`, 'gu');

/** Build one public change without performing Git, filesystem, or asset I/O. */
export function buildDocumentationChange(
  input: DocumentChangeInput,
  options: DocumentChangeOptions = {},
): DocumentChangeResult {
  const oldPath = input.oldPath || input.path;
  const classification = classifyChangePath(input.docsRel, input.path);
  const oldSize = input.oldContent.byteLength;
  const newSize = input.newContent.byteLength;
  const binary = isBinaryContent(input.oldContent) || isBinaryContent(input.newContent);
  const change = createChange(input, classification, binary);

  addSize(change, oldSize, newSize);
  addContentErrors(change, input);
  if (input.asset !== undefined) {
    change.asset = input.asset;
  }

  buildSourceDiff(change, input, options);

  if (extension(input.path) === '.md' && !binary) {
    return buildMarkdownChange(change, input, options, oldPath);
  }

  if (isOpenAPIPath(input.path) && !binary) {
    const parsedSides = buildOpenAPIChange(change, input, oldPath);
    return { change, ...parsedSides };
  }

  return { change };
}

function createChange(input: DocumentChangeInput, classification: string, binary: boolean): Change {
  const change: Change = {
    status: input.status,
    path: input.path,
    gitState: input.gitState,
    lines: { added: 0, deleted: 0 },
    binary,
    classification,
    entitiesBefore: [],
    entitiesAfter: [],
    sourceDiffAvailable: false,
    renderedDiffAvailable: false,
    semanticDiffAvailable: false,
    sourceDiffHunks: [],
    renderedSections: [],
    mermaidBlocks: [],
    semanticChanges: [],
    relationChanges: [],
    diagnostics: [...(input.diagnostics ?? [])],
  };

  if (input.oldPath) {
    change.oldPath = input.oldPath;
  }
  return change;
}

function addSize(change: Change, oldSize: number, newSize: number): void {
  if (oldSize > 0) {
    change.oldSize = oldSize;
  }
  if (newSize > 0) {
    change.newSize = newSize;
  }
}

function addContentErrors(change: Change, input: DocumentChangeInput): void {
  if (input.oldContentError !== undefined) {
    const diagnostic: Issue = {
      severity: 'warning',
      code: 'change-old-version-missing',
      message: errorMessage(input.oldContentError),
    };
    if (input.oldPath) {
      diagnostic.documentPath = input.oldPath;
    }
    change.diagnostics.push(diagnostic);
  }
  if (input.newContentError !== undefined) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'change-new-version-missing',
      message: errorMessage(input.newContentError),
      documentPath: input.path,
    });
  }
}

function buildSourceDiff(
  change: Change,
  input: DocumentChangeInput,
  options: DocumentChangeOptions,
): void {
  if (change.binary) {
    change.diagnostics.push({
      severity: 'info',
      code: 'git-binary-diff-unavailable',
      message: 'Text diff is unavailable for a binary file.',
      documentPath: input.path,
    });
    return;
  }

  let maxBytes = options.maxSourceDiffBytes;
  if (maxBytes === undefined || maxBytes <= 0) {
    maxBytes = defaultMaxBytes;
  }
  if (input.oldContent.byteLength + input.newContent.byteLength > maxBytes) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'change-file-too-large',
      message: 'Full diff is disabled by the size limit.',
      documentPath: input.path,
    });
    return;
  }

  if (input.patchError !== undefined) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'git-command-failed',
      message: errorMessage(input.patchError),
      documentPath: input.path,
    });
    return;
  }

  if (input.patch === undefined) {
    return;
  }

  const patch = decodeUtf8(input.patch);
  if (patch === undefined) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'git-command-failed',
      message: 'Patch is not valid UTF-8.',
      documentPath: input.path,
    });
    return;
  }

  change.sourceDiffAvailable = true;
  change.lines = countPatchLines(patch);
  if (!options.omitSourceDiff && patch) {
    change.sourceDiff = patch;
    change.sourceDiffHunks = parseSourceDiffHunks(patch);
  }
}

function buildMarkdownChange(
  change: Change,
  input: DocumentChangeInput,
  options: DocumentChangeOptions,
  oldPath: string,
): DocumentChangeResult {
  const oldSide = parseMarkdownSide(input.oldContent, oldPath);
  const newSide = parseMarkdownSide(input.newContent, input.path);
  const oldAnalysis = oldSide.analysis;
  const newAnalysis = newSide.analysis;

  change.diagnostics.push(...markdownPolicyDiagnostics(oldAnalysis, oldPath, 'Old version'));
  change.diagnostics.push(...markdownPolicyDiagnostics(newAnalysis, input.path, 'New version'));
  change.entitiesBefore = entitiesFromMarkdown(input.oldContent, oldPath, oldAnalysis);
  change.entitiesAfter = entitiesFromMarkdown(input.newContent, input.path, newAnalysis);

  const oldSemanticValid = markdownSemanticValid(input.oldContent, oldAnalysis);
  const newSemanticValid = markdownSemanticValid(input.newContent, newAnalysis);
  if (!oldSemanticValid) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'semantic-old-version-invalid',
      message:
        'The old Markdown version is invalid for semantic diff; source diff remains available.',
      documentPath: oldPath,
    });
  }
  if (!newSemanticValid) {
    change.diagnostics.push({
      severity: 'warning',
      code: 'semantic-new-version-invalid',
      message:
        'The new Markdown version is invalid for semantic diff; source diff remains available.',
      documentPath: input.path,
    });
  }

  if (differentEntityIDs(change.entitiesBefore, change.entitiesAfter)) {
    change.diagnostics.push({
      severity: 'info',
      code: 'possible-entity-id-change',
      message:
        'A stable ID changed; the entities are distinct until a relationship is declared explicitly.',
      documentPath: input.path,
    });
  }

  if (firstEntityType(change.entitiesBefore, change.entitiesAfter) === 'screen') {
    change.screen = buildScreenDiffMetadata(
      input.oldContent.byteLength > 0 ? oldAnalysis : undefined,
      input.newContent.byteLength > 0 ? newAnalysis : undefined,
    );
  }

  const renderedLimit = options.maxRenderedFileBytes ?? defaultMaxBytes;
  change.renderedDiffAvailable =
    options.renderedDiff === true &&
    input.oldContent.byteLength + input.newContent.byteLength <= renderedLimit;
  [change.renderedSections, change.diagnostics] = renderedSectionDiff(
    oldAnalysis,
    newAnalysis,
    oldPath,
    input.path,
    change.diagnostics,
  );
  [change.mermaidBlocks, change.diagnostics] = mermaidBlockDiff(
    oldAnalysis,
    newAnalysis,
    oldPath,
    input.path,
    change.diagnostics,
  );

  if (options.semanticDiff === true && oldSemanticValid && newSemanticValid) {
    change.semanticChanges = semanticMarkdownDiff(
      oldSide,
      newSide,
      change.entitiesBefore,
      change.entitiesAfter,
    );
    change.relationChanges = relationMarkdownDiff(
      oldSide.source,
      newSide.source,
      change.entitiesBefore,
      change.entitiesAfter,
    );
    change.semanticDiffAvailable = true;
  }

  return { change, oldSide, newSide };
}

function buildOpenAPIChange(
  change: Change,
  input: DocumentChangeInput,
  oldPath: string,
): Pick<DocumentChangeResult, 'oldSide' | 'newSide'> {
  const oldSource = decodeUtf8(input.oldContent);
  const newSource = decodeUtf8(input.newContent);
  if (oldSource === undefined || newSource === undefined) {
    return {};
  }

  const result = openAPIDiff(oldSource, newSource, oldPath, input.path);
  change.semanticChanges = result.changes;
  change.semanticDiffAvailable = result.available;
  change.diagnostics.push(...result.diagnostics);
  if (!result.available) {
    return {};
  }

  change.entitiesBefore = [contractEntity(oldPath)];
  change.entitiesAfter = [contractEntity(input.path)];
  return {
    oldSide: parseMarkdownSide(input.oldContent, oldPath),
    newSide: parseMarkdownSide(input.newContent, input.path),
  };
}

function parseMarkdownSide(content: Uint8Array, path: string): ParsedMarkdownSide {
  const source = decodeUtf8(content) ?? '';
  const document: MarkdownDocument = parseMarkdown(source, path);
  return { analysis: document.analysis, source, path };
}

function entitiesFromMarkdown(
  content: Uint8Array,
  path: string,
  analysis: MarkdownAnalysis,
): ChangeEntity[] {
  if (content.byteLength === 0) {
    return [];
  }

  const metadata = metadataRecord(analysis);
  const relativePath = slashPath(path).startsWith('docs/')
    ? slashPath(path).slice('docs/'.length)
    : slashPath(path);
  const entity: ChangeEntity = {
    type: classifyDocument(relativePath),
  };
  const metadataID = metadata.get('id');
  if (metadataID) {
    entity.id = metadataID;
  }
  if (analysis.title) {
    entity.title = analysis.title;
  }
  return [entity];
}

function metadataRecord(analysis: MarkdownAnalysis): Map<string, string> {
  const result = new Map<string, string>();
  for (const item of analysis.metadata) {
    if (!result.has(item.key)) {
      result.set(item.key, item.value.replace(trimUnicodeWhiteSpace, ''));
    }
  }
  return result;
}

function markdownPolicyDiagnostics(
  analysis: MarkdownAnalysis,
  path: string,
  side: string,
): Issue[] {
  const diagnostics: Issue[] = [];
  for (const diagnostic of analysis.diagnostics) {
    if (diagnostic.code !== 'forbidden-raw-html' && diagnostic.code !== 'forbidden-front-matter') {
      continue;
    }
    diagnostics.push({
      severity: 'error',
      code: diagnostic.code,
      message: `${side}: ${diagnostic.message}`,
      documentPath: path,
      line: diagnostic.range.start.line,
      column: diagnostic.range.start.column,
    });
  }
  return diagnostics;
}

function markdownSemanticValid(content: Uint8Array, analysis: MarkdownAnalysis): boolean {
  if (content.byteLength === 0) {
    return true;
  }
  if (!analysis.title.replace(trimUnicodeWhiteSpace, '')) {
    return false;
  }
  return !analysis.diagnostics.some((diagnostic) => diagnostic.code === 'unclosed-fence');
}

function differentEntityIDs(
  before: readonly ChangeEntity[],
  after: readonly ChangeEntity[],
): boolean {
  const oldID = before[0]?.id;
  const newID = after[0]?.id;
  return Boolean(oldID && newID && oldID !== newID);
}

function firstEntityType(before: readonly ChangeEntity[], after: readonly ChangeEntity[]): string {
  return before[0]?.type ?? after[0]?.type ?? '';
}

function contractEntity(path: string): ChangeEntity {
  const entity: ChangeEntity = {
    type: 'contract',
    title: path,
  };
  const id = contractID(path);
  if (id) {
    entity.id = id;
  }
  return entity;
}

function contractID(path: string): string {
  const match = slashPath(path)
    .toUpperCase()
    .match(/\b(?:UC|FLOW|SC|TR|MOD|ADR|TASK|BUG|BR|INV|CONTRACT)-[A-Z0-9][A-Z0-9-]*\b/u);
  const id = match?.[0] ?? '';
  return id.startsWith('CONTRACT-') ? id : '';
}

function isOpenAPIPath(path: string): boolean {
  const ext = extension(path);
  return ext === '.yaml' || ext === '.yml' || ext === '.json';
}

function extension(path: string): string {
  const name = slashPath(path).split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

function slashPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function isBinaryContent(content: Uint8Array): boolean {
  if (content.includes(0)) {
    return true;
  }
  return decodeUtf8(content) === undefined;
}

function decodeUtf8(content: Uint8Array): string | undefined {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

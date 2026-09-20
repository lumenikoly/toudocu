import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { naturalCompare, type CompiledProject } from '@toudocu/core';
import {
  EditorFileListSchema,
  EditorFileResponseSchema,
  ToudocuError,
  type EditorCreateRequest,
  type EditorFile,
  type EditorFileList,
  type EditorFileResponse,
  type EditorSaveRequest,
} from '@toudocu/contracts';
import { PathPolicy } from './filesystem/path-policy.js';
import { contentDigest, writeAtomically } from './filesystem/write.js';
import { loadProject, type LoadProjectOptions, type LoadedProject } from './project.js';
import { createScaffold, createTaskInit, loadTaskWriteProject } from './task-write.js';

const contentLimit = 2 * 1024 * 1024;
const languages = { '.md': 'markdown', '.yaml': 'yaml', '.yml': 'yaml', '.json': 'json' } as const;
const entityTemplates = ['module', 'use-case', 'flow', 'screen', 'decision', 'standard', 'runbook'];
const entityFields = [
  { name: 'id', label: 'Identifier', type: 'text' as const, required: true },
  { name: 'title', label: 'Title', type: 'text' as const, required: true },
];
const templates: EditorFileList['templates'] = [
  {
    key: 'task-init',
    label: 'Work item',
    languages: ['ru', 'en'],
    fields: [
      { name: 'area', label: 'Area', type: 'text', required: true },
      { name: 'title', label: 'Title', type: 'text', required: true },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: ['Feature', 'Bug', 'Maintenance', 'Documentation', 'Research'],
      },
    ],
  },
  ...entityTemplates.map((key) => ({
    key: key as EditorCreateRequest['template'],
    label: key,
    fields: entityFields,
    languages: ['ru', 'en'] as Array<'ru' | 'en'>,
  })),
  {
    key: 'draft',
    label: 'Draft',
    fields: [{ name: 'title', label: 'Title', type: 'text', required: true }],
    languages: ['ru', 'en'],
  },
];

function diagnostics(project: CompiledProject, path: string) {
  return project.issues
    .filter((issue) => issue.documentPath === path)
    .map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      path,
      line: issue.line ?? 0,
      column: issue.column ?? 0,
    }));
}

function language(path: string): EditorFile['language'] {
  const result = languages[extname(path).toLowerCase() as keyof typeof languages];
  if (!result)
    throw new ToudocuError('unsupported_extension', 'unsupported editor file type', { path });
  return result;
}

function revision(files: readonly { path: string; digest: string }[]): string {
  const hash = createHash('sha256');
  for (const file of files) hash.update(file.path).update('\0').update(file.digest).update('\0');
  return hash.digest('hex');
}

function safeTitle(value: string): string {
  const title = value.trim();
  if (!title || /[\r\n]/u.test(title)) {
    throw new ToudocuError('invalid_argument', 'title must be a non-empty single line');
  }
  return title;
}

function slug(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .normalize('NFC')
      .replace(/[^\p{L}\p{Nd}]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'draft'
  );
}

export class EditorWorkspace {
  private readonly pendingOverwrites = new Map<string, string>();

  constructor(
    private readonly inputDirectory: string,
    private readonly options: Omit<LoadProjectOptions, 'overlay' | 'signal' | 'now'> = {},
  ) {}

  load(signal?: AbortSignal, overlay?: ReadonlyMap<string, string>): Promise<LoadedProject> {
    return loadProject(this.inputDirectory, {
      ...this.options,
      now: new Date(),
      ...(overlay ? { overlay } : {}),
      ...(signal ? { signal } : {}),
    });
  }

  async list(signal?: AbortSignal): Promise<EditorFileList> {
    const project = await this.load(signal);
    const paths = [
      ...project.snapshot.markdown.map((file) => file.sourcePath),
      ...project.snapshot.openAPI.map((file) => file.sourcePath),
    ].sort(naturalCompare);
    const files = await Promise.all(paths.map((path) => this.summary(project, path, signal)));
    return EditorFileListSchema.parse({
      schemaVersion: 1,
      revision: revision(files),
      files,
      templates,
    });
  }

  async read(path: string, signal?: AbortSignal): Promise<EditorFileResponse> {
    const project = await this.load(signal);
    const file = await this.file(project, path, signal);
    const list = await this.list(signal);
    return EditorFileResponseSchema.parse({ schemaVersion: 1, revision: list.revision, file });
  }

  async save(request: EditorSaveRequest, signal?: AbortSignal): Promise<void> {
    const project = await this.load(signal);
    const current = await this.file(project, request.path, signal);
    const pending = this.pendingOverwrites.get(request.path);
    if (
      current.digest !== request.expectedDigest ||
      (pending !== undefined &&
        (!request.confirmOverwrite || pending !== request.expectedDigest)) ||
      (pending === undefined && request.confirmOverwrite)
    ) {
      this.pendingOverwrites.set(request.path, current.digest);
      throw new ToudocuError('stale_digest', 'file changed since it was read', {
        path: request.path,
        details: {
          digest: current.digest,
          content: current.content,
          revision: (await this.list(signal)).revision,
        },
      });
    }
    const policy = await this.policy(project.snapshot.root);
    await writeAtomically(
      policy,
      request.path,
      request.content,
      { kind: 'replace', expectedDigest: request.expectedDigest },
      signal,
    );
    this.pendingOverwrites.delete(request.path);
  }

  async create(request: EditorCreateRequest, signal?: AbortSignal): Promise<string> {
    const fields = request.fields;
    if (request.template === 'task-init') {
      const project = await loadTaskWriteProject(
        this.inputDirectory,
        this.options.repositoryRoot,
        false,
        signal,
      );
      const result = await createTaskInit(
        project,
        {
          area: fields.area ?? '',
          title: fields.title ?? '',
          type: fields.type ?? '',
          language: request.language,
          date: new Date().toISOString().slice(0, 10),
        },
        signal,
      );
      return result.path;
    }
    if (request.template === 'draft')
      return this.createDraft(safeTitle(fields.title ?? ''), signal);
    const project = await loadTaskWriteProject(
      this.inputDirectory,
      this.options.repositoryRoot,
      false,
      signal,
    );
    const result = await createScaffold(
      project,
      {
        entityType: request.template,
        id: fields.id ?? '',
        title: fields.title ?? '',
        language: request.language,
        date: new Date().toISOString().slice(0, 10),
      },
      signal,
    );
    return result.path;
  }

  private async createDraft(title: string, signal?: AbortSignal): Promise<string> {
    const project = await this.load(signal);
    const policy = await this.policy(project.snapshot.root);
    for (let number = 1; number <= 100; number += 1) {
      const path = `drafts/${slug(title)}${number === 1 ? '' : `-${number}`}.md`;
      try {
        await writeAtomically(policy, path, `# ${title}\n`, { kind: 'create' }, signal);
        return path;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      }
    }
    throw new ToudocuError('file_exists', 'could not allocate a free draft filename');
  }

  private policy(root: string): Promise<PathPolicy> {
    return PathPolicy.create(root, { extensions: Object.keys(languages) });
  }

  private async summary(project: LoadedProject, path: string, signal?: AbortSignal) {
    const file = await this.file(project, path, signal);
    const document = project.index.byPath.get(path);
    return {
      path,
      language: file.language,
      size: file.size,
      digest: file.digest,
      ...(document?.title ? { title: document.title } : {}),
      ...(document?.outputPath ? { documentURL: document.outputPath } : {}),
    };
  }

  private async file(
    project: LoadedProject,
    path: string,
    signal?: AbortSignal,
  ): Promise<EditorFile> {
    const policy = await this.policy(project.snapshot.root);
    const content = await readFile(await policy.resolveFile(path), { encoding: 'utf8', signal });
    const size = Buffer.byteLength(content);
    if (size > contentLimit)
      throw new ToudocuError('content_too_large', 'content exceeds 2 MiB', { path });
    if (content.includes('\0'))
      throw new ToudocuError('unsupported_extension', 'binary content is not supported', { path });
    const document = project.index.byPath.get(path);
    return {
      path,
      language: language(path),
      size,
      digest: contentDigest(content),
      ...(document?.title ? { title: document.title } : {}),
      ...(document?.outputPath ? { documentURL: document.outputPath } : {}),
      content,
      diagnostics: diagnostics(project, path),
    };
  }
}

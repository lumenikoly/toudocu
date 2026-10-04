import { relative, sep } from 'node:path';
import {
  RepositoryFileQuerySchema,
  RepositoryFilesQuerySchema,
  ToudocuError,
  type RepositoryFileResponse,
  type RepositoryFileList,
} from '@toudocu/contracts';
import { resolveBase, resolveTarget } from './changes/service.js';
import { PathPolicy, isMissing } from './filesystem/path-policy.js';
import { openGitRepository, type GitSide } from './git/repository.js';

const contentLimit = 2 * 1024 * 1024;

async function reviewRepository(root: string, signal: AbortSignal) {
  const repository = await openGitRepository(root, { signal, maxOutputBytes: 16 * 1024 * 1024 });
  const prefix = relative(repository.root, repository.docsRoot).split(sep).join('/');
  const policy = await PathPolicy.create(repository.root, {
    allowHidden: true,
    excluded: ['.git'],
  });
  const validate = (path: string): void => {
    policy.validate(path);
    if (path.startsWith('-') || (prefix && !path.startsWith(`${prefix}/`)))
      throw new ToudocuError('path_forbidden', 'path is outside the review repository', { path });
  };
  return { repository, policy, validate };
}

export async function listRepositoryReviewFiles(
  root: string,
  input: unknown,
  signal: AbortSignal,
): Promise<RepositoryFileList> {
  const query = RepositoryFilesQuerySchema.parse(input);
  const { repository, policy, validate } = await reviewRepository(root, signal);
  const [base, target] = await Promise.all([
    resolveBase(repository, query.base?.trim() || 'HEAD', query.branchBase?.trim()),
    resolveTarget(repository, query.target?.trim() || 'working-tree'),
  ]);
  const [before, current] = await Promise.all([
    repository.filePaths(base.git),
    repository.filePaths(target.git),
  ]);
  const oldPaths = new Set(before);
  const search = query.q?.trim().toLowerCase() ?? '';
  const files: RepositoryFileList['files'] = [];
  for (const path of [...new Set([...before, ...current])].sort()) {
    signal.throwIfAborted();
    if (search && !path.toLowerCase().includes(search)) continue;
    try {
      validate(path);
      if (!oldPaths.has(path) && target.git.type === 'working-tree') await policy.resolveFile(path);
    } catch (error) {
      if (error instanceof ToudocuError || isMissing(error)) continue;
      throw error;
    }
    files.push({ path });
    if (files.length > query.limit) break;
  }
  return {
    schemaVersion: 1,
    files: files.slice(0, query.limit),
    truncated: files.length > query.limit,
  };
}

export async function readRepositoryReviewFile(
  root: string,
  input: unknown,
  signal: AbortSignal,
): Promise<RepositoryFileResponse> {
  const query = RepositoryFileQuerySchema.parse(input);
  const { repository, validate } = await reviewRepository(root, signal);
  validate(query.path);
  if (query.oldPath) validate(query.oldPath);
  const [base, target] = await Promise.all([
    resolveBase(repository, query.base?.trim() || 'HEAD', query.branchBase?.trim()),
    resolveTarget(repository, query.target?.trim() || 'working-tree'),
  ]);
  const read = async (side: GitSide, path: string): Promise<RepositoryFileResponse['current']> => {
    const absent = { path, available: false, binary: false, tooLarge: false, size: 0 };
    if (!(await repository.filePaths(side)).includes(path)) return absent;
    try {
      const result = await repository.limitedContent(side, path, contentLimit);
      const metadata = { ...absent, available: true, size: result.size };
      if (!result.content) return { ...metadata, tooLarge: true };
      if (result.content.includes(0)) return { ...metadata, binary: true };
      try {
        return {
          ...metadata,
          content: new TextDecoder('utf-8', { fatal: true }).decode(result.content),
        };
      } catch {
        return { ...metadata, binary: true };
      }
    } catch (error) {
      if (isMissing(error) || (error instanceof ToudocuError && error.code === 'file_not_found'))
        return absent;
      throw error;
    }
  };
  const [before, current] = await Promise.all([
    read(base.git, query.oldPath ?? query.path),
    read(target.git, query.path),
  ]);
  if (!before.available && !current.available)
    throw new ToudocuError('file_not_found', 'file is absent from both review sides', {
      path: query.path,
    });
  return { schemaVersion: 1, before, current };
}

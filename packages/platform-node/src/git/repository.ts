import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { parseMarkdown } from '@toudocu/core';
import { ToudocuError } from '@toudocu/contracts';
import { runProcess, type RunProcessOptions } from '../process-runner.js';
import { isInside, isMissing, PathPolicy } from '../filesystem/path-policy.js';
import { parseNameStatus, parseStatusStates, type GitState } from './status.js';

export type GitSide = { type: 'working-tree' | 'index' } | { type: 'commit'; resolved: string };
export interface GitReadOptions {
  signal?: AbortSignal;
  maxOutputBytes?: number;
  timeoutMs?: number;
  similarity?: number;
}
export interface GitTaskDocument {
  path: string;
  content: Buffer;
}
const diffFlags = ['--no-ext-diff', '--no-textconv', '--no-color'];

function diffSides(base: GitSide, target: GitSide): string[] {
  const commit = (side: GitSide): string => {
    if (side.type !== 'commit' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(side.resolved))
      throw new ToudocuError('git-base-not-found', 'a resolved Git commit is required', {
        exitCode: 2,
      });
    return side.resolved;
  };
  if (target.type === 'working-tree') return base.type === 'index' ? [] : [commit(base)];
  if (target.type === 'index') return ['--cached', commit(base)];
  return [commit(base), commit(target)];
}

function invalidPath(path: string): never {
  throw new ToudocuError('git-path-invalid', `invalid repository path: ${JSON.stringify(path)}`, {
    exitCode: 2,
    path,
  });
}

function validCommit(value: string): boolean {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);
}

function addedFilePatch(path: string, content: Buffer): Buffer {
  const lines = content.toString('utf8').replaceAll('\r\n', '\n').split('\n');
  let count = lines.length;
  if (count > 0 && lines[count - 1] === '') count--;
  let output = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
  output += `@@ -0,0 +1,${count} @@\n`;
  for (let index = 0; index < count; index++) output += `+${lines[index]}\n`;
  return Buffer.from(output);
}

/** Repository-local read commands only; no shell, index refresh, external diff or fetch. */
export async function openGitRepository(documentRoot: string, options: GitReadOptions = {}) {
  const processOptions: RunProcessOptions = {
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.maxOutputBytes !== undefined ? { maxOutputBytes: options.maxOutputBytes } : {}),
    timeoutMs: options.timeoutMs ?? 30_000,
    env: {
      GIT_OPTIONAL_LOCKS: '0',
      GIT_TERMINAL_PROMPT: '0',
      GIT_NO_LAZY_FETCH: '1',
      LC_ALL: 'C',
      LANG: 'C',
      GIT_DIR: undefined,
      GIT_WORK_TREE: undefined,
      GIT_INDEX_FILE: undefined,
    },
  };
  const filterOverrides: string[] = [];
  const command = (directory: string, args: readonly string[]) =>
    runProcess(
      'git',
      [
        '--no-pager',
        '--literal-pathspecs',
        '-C',
        directory,
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        '-c',
        'core.fsmonitor=false',
        ...filterOverrides,
        ...args,
      ],
      processOptions,
    );
  const initial = await command(resolve(documentRoot), ['rev-parse', '--show-toplevel']).catch(
    (cause: unknown) => {
      if (cause instanceof ToudocuError && cause.code !== 'process_spawn_failed') throw cause;
      throw new ToudocuError('git-command-failed', 'git is unavailable', { exitCode: 3, cause });
    },
  );
  if (initial.exitCode !== 0)
    throw new ToudocuError(
      'git-repository-not-found',
      'documentation directory is not inside a Git repository',
      { exitCode: 3 },
    );
  const root = await realpath(initial.stdout.toString('utf8').trim());
  const docsRoot = await realpath(documentRoot);
  if (!isInside(root, docsRoot))
    throw new ToudocuError(
      'git-path-outside-documentation-root',
      'documentation directory is outside the Git root',
      { exitCode: 2 },
    );
  const pathPolicy = await PathPolicy.create(root, { allowHidden: true });
  const resolveScopedPath = (path: string): { absolute: string; relative: string } => {
    if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('-'))
      invalidPath(path);
    try {
      pathPolicy.validate(path);
    } catch {
      invalidPath(path);
    }
    const absolute = resolve(root, path);
    if (!isInside(root, absolute) || !isInside(docsRoot, absolute)) invalidPath(path);
    return { absolute, relative: relative(root, absolute).split(sep).join('/') };
  };
  const resolveSideCommit = (side: GitSide): string => {
    if (side.type !== 'commit' || !validCommit(side.resolved))
      throw new ToudocuError('git-base-not-found', 'a resolved Git commit is required', {
        exitCode: 2,
      });
    return side.resolved;
  };
  const docsRelative = relative(root, docsRoot).split(sep).join('/') || '.';
  const filters = await command(root, [
    'config',
    '--null',
    '--name-only',
    '--get-regexp',
    '^filter\\.',
  ]);
  if (filters.exitCode !== 0 && filters.exitCode !== 1)
    throw new ToudocuError('git-command-failed', 'cannot inspect Git filter configuration', {
      exitCode: 3,
    });
  const drivers = new Set(
    filters.stdout
      .toString('utf8')
      .split('\0')
      .flatMap((key) => {
        const match = /^filter\.([\s\S]+)\.(?:clean|smudge|process|required)$/u.exec(key);
        return match?.[1] ? [match[1]] : [];
      }),
  );
  for (const driver of drivers) {
    for (const operation of ['clean', 'smudge', 'process'])
      filterOverrides.push('-c', `filter.${driver}.${operation}=`);
    filterOverrides.push('-c', `filter.${driver}.required=false`);
  }
  const run = async (args: readonly string[]) => {
    const result = await command(root, args);
    if (result.exitCode !== 0)
      throw new ToudocuError(
        'git-command-failed',
        `git ${args[0]}: ${result.stderr.toString('utf8').trim() || `exit ${result.exitCode}`}`,
        { exitCode: 3 },
      );
    return result.stdout;
  };
  const resolveCommit = async (ref: string) => {
    if (!ref || ref.startsWith('-') || /[\0\r\n:?*\[\\]/u.test(ref) || ref.includes('..'))
      throw new ToudocuError('git-base-not-found', `invalid Git revision: ${JSON.stringify(ref)}`, {
        exitCode: 2,
      });
    try {
      return (await run(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]))
        .toString('utf8')
        .trim();
    } catch (cause) {
      if (cause instanceof ToudocuError && cause.code !== 'git-command-failed') throw cause;
      throw new ToudocuError(
        'git-base-not-found',
        `git revision ${JSON.stringify(ref)} not found`,
        { exitCode: 2, cause },
      );
    }
  };
  const status = async () =>
    parseStatusStates(
      await run(['status', '--porcelain=v2', '-z', '--untracked-files=all', '--', docsRelative]),
    );
  const content = async (side: GitSide, path: string): Promise<Buffer> => {
    const scoped = resolveScopedPath(path);
    if (side.type === 'working-tree') {
      const file = await pathPolicy.resolveFile(scoped.relative);
      return readFile(file);
    }
    if (side.type === 'index') return run(['show', `:${scoped.relative}`]);
    return run(['cat-file', 'blob', `${resolveSideCommit(side)}:${scoped.relative}`]);
  };
  const taskDocuments = async (
    side: GitSide,
    taskID?: string,
  ): Promise<Map<string, GitTaskDocument>> => {
    const workPath = docsRelative === '.' ? 'work' : `${docsRelative}/work`;
    const paths: string[] = [];
    const decodeGitPaths = (output: Buffer): string => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(output);
      } catch (cause) {
        throw new ToudocuError('git-command-failed', 'Git returned an invalid UTF-8 path list', {
          exitCode: 3,
          cause,
        });
      }
    };
    if (side.type === 'working-tree') {
      const walk = async (directory: string): Promise<void> => {
        const absolute = resolve(root, directory);
        let directoryInfo;
        try {
          directoryInfo = await lstat(absolute);
        } catch (cause) {
          if (isMissing(cause)) {
            return;
          }
          throw cause;
        }
        if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
          return;
        }
        await pathPolicy.resolveDirectory(directory);
        for (const entry of await readdir(absolute, { withFileTypes: true })) {
          const child = `${directory}/${entry.name}`;
          let childInfo;
          try {
            childInfo = await lstat(resolve(root, child));
          } catch (cause) {
            if (isMissing(cause)) {
              continue;
            }
            throw cause;
          }
          if (childInfo.isSymbolicLink()) {
            continue;
          }
          if (childInfo.isDirectory()) {
            await walk(child);
            continue;
          }
          if (childInfo.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            paths.push(child.split(sep).join('/'));
          }
        }
      };
      await walk(workPath);
    } else if (side.type === 'index') {
      const output = await run(['ls-files', '-z', '--', workPath]);
      for (const raw of decodeGitPaths(output).split('\0')) {
        if (raw.toLowerCase().endsWith('.md')) {
          paths.push(raw);
        }
      }
    } else {
      const revision = resolveSideCommit(side);
      const output = await run(['ls-tree', '-r', '-z', '--name-only', revision, '--', workPath]);
      for (const raw of decodeGitPaths(output).split('\0')) {
        if (raw.toLowerCase().endsWith('.md')) {
          paths.push(raw);
        }
      }
    }
    paths.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));

    const tasks = new Map<string, GitTaskDocument>();
    for (const path of paths) {
      let documentContent: Buffer;
      try {
        documentContent = await content(side, path);
      } catch (cause) {
        if (isMissing(cause)) {
          continue;
        }
        throw cause;
      }
      const metadata = parseMarkdown(documentContent.toString('utf8')).analysis.metadata;
      const id = metadata.find((item) => item.key === 'id')?.value.trim() ?? '';
      if (!id) {
        continue;
      }
      if (taskID && id !== taskID) {
        continue;
      }
      const previous = tasks.get(id);
      if (previous) {
        throw new ToudocuError(
          'git-task-ambiguous',
          `task identifier ${id} is ambiguous (${previous.path} and ${path})`,
          { exitCode: 2 },
        );
      }
      tasks.set(id, { path, content: documentContent });
    }
    return tasks;
  };
  const diff = async (
    base: GitSide,
    target: GitSide,
    change: {
      status: string;
      path: string;
      oldPath?: string;
    },
  ): Promise<Buffer> => {
    const path = resolveScopedPath(change.path).relative;
    const oldPath =
      change.oldPath === undefined ? undefined : resolveScopedPath(change.oldPath).relative;
    if (change.status === 'untracked')
      return addedFilePatch(path, await content({ type: 'working-tree' }, path));
    const args = [
      'diff',
      ...diffFlags,
      '--full-index',
      '--binary',
      '--unified=3',
      ...diffSides(base, target),
      '--',
    ];
    if (oldPath !== undefined) args.push(oldPath);
    args.push(path);
    return run(args);
  };
  const repositoryState = async (): Promise<{
    root: string;
    branch: string;
    head: string;
    dirty: boolean;
  }> => {
    const head = await resolveCommit('HEAD');
    const branch = await command(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
    const current = await status();
    return {
      root,
      branch: branch.exitCode === 0 ? branch.stdout.toString('utf8').trim() : '',
      head: head.slice(0, 7),
      dirty: current.size > 0,
    };
  };
  const mergeBase = async (refA: string, refB: string): Promise<string> => {
    const [resolvedA, resolvedB] = await Promise.all([resolveCommit(refA), resolveCommit(refB)]);
    const value = (await run(['merge-base', resolvedA, resolvedB])).toString('utf8').trim();
    if (!validCommit(value))
      throw new ToudocuError('git-command-failed', 'git merge-base returned an invalid commit', {
        exitCode: 3,
      });
    return value;
  };
  const changes = async (base: GitSide, target: GitSide) => {
    const similarity =
      Number.isInteger(options.similarity) && options.similarity! >= 1 && options.similarity! <= 100
        ? options.similarity
        : 60;
    const records = parseNameStatus(
      await run([
        'diff',
        ...diffFlags,
        '--name-status',
        '-z',
        `--find-renames=${similarity}%`,
        `--find-copies=${similarity}%`,
        ...diffSides(base, target),
        '--',
        docsRelative,
      ]),
    );
    const states = await status();
    const committed = new Set<string>();
    if (base.type === 'commit' && target.type === 'working-tree') {
      for (const path of (
        await run([
          'diff',
          ...diffFlags,
          '--name-only',
          '-z',
          base.resolved,
          'HEAD',
          '--',
          docsRelative,
        ])
      )
        .toString('utf8')
        .split('\0'))
        if (path) committed.add(path);
    }
    const result = records.map((record) => ({
      ...record,
      state: {
        ...(states.get(record.path) ?? {
          staged: false,
          unstaged: false,
          untracked: false,
          committedInBranch: false,
        }),
        committedInBranch: committed.has(record.path) || committed.has(record.oldPath ?? ''),
      } satisfies GitState,
    }));
    if (target.type === 'working-tree') {
      const known = new Set(result.map((record) => record.path));
      for (const [path, state] of states)
        if (state.untracked && !known.has(path)) result.push({ status: 'untracked', path, state });
    }
    return result.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  };
  return {
    root,
    docsRoot,
    docsRelative,
    resolveCommit,
    status,
    changes,
    content,
    diff,
    repositoryState,
    mergeBase,
    taskDocuments,
  };
}

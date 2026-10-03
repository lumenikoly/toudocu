import { lstat, realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';

function failure(code: string, message: string, path: string): never {
  throw new ToudocuError(code, message, { path });
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

/** Resolve the longest existing prefix; never hide a broken symlink. */
export async function resolveForSafety(path: string): Promise<string> {
  let current = resolve(path);
  const missing: string[] = [];
  for (;;) {
    try {
      await lstat(current);
    } catch (error) {
      if (!isMissing(error)) throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      missing.unshift(parse(current).base);
      current = parent;
      continue;
    }
    return join(await realpath(current), ...missing);
  }
}

export interface PathRules {
  extensions?: readonly string[];
  excluded?: readonly string[];
  allowHidden?: boolean;
}

/** One canonical root and policy for document, asset and managed skill paths. */
export class PathPolicy {
  private constructor(
    readonly root: string,
    private readonly rules: PathRules,
  ) {}

  static async create(root: string, rules: PathRules = {}): Promise<PathPolicy> {
    const canonical = await realpath(root);
    const info = await lstat(canonical);
    if (!info.isDirectory()) failure('invalid_path', 'root must be a directory', root);
    return new PathPolicy(canonical, rules);
  }

  validate(path: string): void {
    if (!path || isAbsolute(path) || /^[a-z]:/i.test(path) || /[\\%\u0000]/.test(path))
      failure('invalid_path', 'path must be a canonical relative path', path);
    const parts = path.split('/');
    if (parts.some((part) => !part || part === '.' || part === '..'))
      failure('invalid_path', 'path contains a forbidden segment', path);
    if (!this.rules.allowHidden && parts.some((part) => part.startsWith('.')))
      failure('path_forbidden', 'hidden paths are excluded', path);
    if (
      this.rules.excluded?.some(
        (excluded) =>
          path === excluded || path.startsWith(`${excluded}/`) || parts.includes(excluded),
      )
    )
      failure('path_forbidden', 'path is excluded', path);
    if (this.rules.extensions && !this.rules.extensions.includes(extname(path).toLowerCase()))
      failure('unsupported_extension', 'file extension is not supported', path);
  }

  async resolveFile(path: string, allowMissing = false): Promise<string> {
    return this.resolveEntry(path, allowMissing, false);
  }

  async resolveDirectory(path: string, allowMissing = false): Promise<string> {
    return this.resolveEntry(path, allowMissing, true);
  }

  private async resolveEntry(
    path: string,
    allowMissing: boolean,
    directory: boolean,
  ): Promise<string> {
    this.validate(path);
    let current = this.root;
    const parts = path.split('/');
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      let info;
      try {
        info = await lstat(current);
      } catch (error) {
        if (isMissing(error) && allowMissing) {
          const target = join(this.root, ...parts);
          const resolved = await resolveForSafety(target);
          if (!isInside(this.root, resolved))
            failure('path_forbidden', 'path escapes the root', path);
          return target;
        }
        if (isMissing(error)) failure('file_not_found', 'file not found', path);
        throw error;
      }
      if (info.isSymbolicLink()) failure('path_forbidden', 'symbolic links are forbidden', path);
      if (index < parts.length - 1 && !info.isDirectory())
        failure('invalid_path', 'path component is not a directory', path);
      if (index === parts.length - 1 && !(directory ? info.isDirectory() : info.isFile()))
        failure(
          'path_forbidden',
          directory ? 'entry must be a directory' : 'entry must be a regular file',
          path,
        );
    }
    return current;
  }
}

/** Read-only guard: destructive build operations must call it before staging. */
export async function assertSafeOutput(
  output: string,
  protectedRoots: readonly string[],
): Promise<string> {
  const target = resolve(output);
  try {
    if ((await lstat(target)).isSymbolicLink())
      failure('unsafe_output', 'output must not be a symbolic link', output);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  const canonical = await resolveForSafety(target);
  if (canonical === parse(canonical).root)
    failure('unsafe_output', 'output must not be a filesystem root', output);
  for (const root of protectedRoots) {
    if (isInside(canonical, await resolveForSafety(root)))
      failure('unsafe_output', 'output contains a protected source root', output);
  }
  return canonical;
}

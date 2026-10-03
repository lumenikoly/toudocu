import { lstat, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { isInside, PathPolicy } from './path-policy.js';

export interface InventoryEntry {
  kind: 'file' | 'directory';
  safe: boolean;
}

// Scope globs follow Go filepath.Match: ** is not recursive and braces are literal.
export function scopePattern(pattern: string): RegExp | undefined {
  let expression = '^';
  const chars = [...pattern];
  const escapeLiteral = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapeClass = (value: string): string => value.replace(/[\\\]\[\-^]/g, '\\$&');
  const codePoint = (value: string): number => value.codePointAt(0) ?? 0;
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? '';
    if (char === '*') {
      expression += '[^/]*';
      continue;
    }
    if (char === '?') {
      expression += '[^/]';
      continue;
    }
    if (char === '\\') {
      const literal = chars[++i];
      if (literal === undefined) return undefined;
      expression += escapeLiteral(literal);
      continue;
    }
    if (char !== '[') {
      expression += escapeLiteral(char);
      continue;
    }

    let cursor = i + 1;
    const negated = chars[cursor] === '^';
    if (negated) cursor++;
    const parts: string[] = [];
    let ranges = 0;
    let closed = false;
    while (cursor < chars.length) {
      if (chars[cursor] === ']' && ranges > 0) {
        closed = true;
        cursor++;
        break;
      }
      const first = chars[cursor];
      if (first === undefined || first === '-' || first === ']') return undefined;
      let low = first;
      cursor++;
      if (low === '\\') {
        low = chars[cursor] ?? '';
        if (!low) return undefined;
        cursor++;
      }
      let high = low;
      if (chars[cursor] === '-') {
        cursor++;
        high = chars[cursor] ?? '';
        if (!high || high === '-' || high === ']') return undefined;
        if (high === '\\') {
          high = chars[++cursor] ?? '';
          if (!high) return undefined;
        }
        cursor++;
      }
      ranges++;
      if (codePoint(low) <= codePoint(high))
        parts.push(low === high ? escapeClass(low) : `${escapeClass(low)}-${escapeClass(high)}`);
    }
    if (!closed) return undefined;
    expression += parts.length ? `[${negated ? '^' : ''}${parts.join('')}]` : '(?!)';
    i = cursor - 1;
  }
  try {
    return new RegExp(`${expression}$`, 'u');
  } catch {
    return undefined;
  }
}

const utf8 = new TextEncoder();
function compareGoStrings(left: string, right: string): number {
  const a = utf8.encode(left);
  const b = utf8.encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index++) {
    const leftByte = a[index] ?? 0;
    const rightByte = b[index] ?? 0;
    if (leftByte !== rightByte) return leftByte - rightByte;
  }
  return a.length - b.length;
}

/** Metadata only: never opens repository contents or traverses another locale. */
export async function readRepositoryInventory(
  root: string,
  options: { excludedRoots?: readonly string[]; signal?: AbortSignal } = {},
) {
  const policy = await PathPolicy.create(root, { allowHidden: true });
  const entries = new Map<string, InventoryEntry>([['.', { kind: 'directory', safe: true }]]);
  const excluded = (path: string): boolean =>
    options.excludedRoots?.some((exclusion) => isInside(exclusion, path)) ?? false;
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted();
    if (directory) await policy.resolveDirectory(directory);
    for (const entry of await readdir(join(policy.root, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      const absolute = join(policy.root, path);
      if (excluded(absolute)) continue;
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        entries.set(path, { kind: 'file', safe: false });
        continue;
      }
      if (!info.isDirectory() && !info.isFile()) continue;
      entries.set(path, { kind: info.isDirectory() ? 'directory' : 'file', safe: true });
      if (info.isDirectory() && !['.git', '.hg', '.svn', 'node_modules'].includes(entry.name))
        await walk(path);
    }
  };
  await walk('');
  const lookup = (absolute: string): InventoryEntry | undefined => {
    if (!isInside(policy.root, absolute) || excluded(absolute)) return undefined;
    const path = relative(policy.root, absolute).replaceAll('\\', '/') || '.';
    for (let parent = path; parent.includes('/');) {
      parent = parent.slice(0, parent.lastIndexOf('/'));
      if (entries.get(parent)?.safe === false) return { kind: 'file', safe: false };
    }
    return entries.get(path);
  };
  return {
    root: policy.root,
    entries,
    lookup,
    exists: (path: string): boolean => lookup(resolve(policy.root, path))?.safe === true,
    matches: (pattern: string): readonly string[] => {
      const matcher = scopePattern(pattern);
      return matcher
        ? [...entries]
            .filter(([path, entry]) => entry.safe && matcher.test(path))
            .map(([path]) => path)
            .sort(compareGoStrings)
        : [];
    },
  };
}

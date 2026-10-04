import { beforeEach, describe, expect, it, afterEach } from 'vitest';
import {
  mkdir,
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, parse } from 'node:path';
import { ToudocuError } from '@toudocu/contracts';
import { assertSafeOutput, PathPolicy } from './path-policy.js';
import { contentDigest, writeAtomically } from './write.js';

let root = '';
let outside = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'toudocu-path-policy-'));
  outside = await mkdtemp(join(tmpdir(), 'toudocu-path-policy-outside-'));
  await mkdir(join(root, 'docs'), { recursive: true });
  await mkdir(join(root, 'private'), { recursive: true });
  await writeFile(join(root, 'docs', 'index.md'), 'original\n');
  await writeFile(join(root, 'private', 'secret.md'), 'secret\n');
});

afterEach(async () => {
  await Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outside, { recursive: true, force: true }),
  ]);
});

async function policy(): Promise<PathPolicy> {
  return PathPolicy.create(root, {
    extensions: ['.md', '.yaml'],
    excluded: ['private', 'site'],
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ToudocuError ? error.code : undefined;
}

async function expectCode(action: Promise<unknown>, code: string): Promise<void> {
  await expect(action).rejects.toSatisfy((error: unknown) => errorCode(error) === code);
}

async function makeSymlink(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['EACCES', 'ENOTSUP', 'EPERM'].includes(String(error.code))
    ) {
      return false;
    }
    throw error;
  }
}

function expectSyncCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(errorCode(error)).toBe(code);
  }
}

describe('PathPolicy', () => {
  it('rejects non-canonical, encoded, absolute, hidden, excluded, and unsupported paths', async () => {
    const current = await policy();
    expect(() => current.validate('docs/index.md')).not.toThrow();

    for (const value of [
      '',
      '.',
      'docs/../docs/index.md',
      'docs/./index.md',
      'docs//index.md',
      'docs\\index.md',
      'docs%2findex.md',
      '/tmp/index.md',
      'C:/tmp/index.md',
      'c:index.md',
    ]) {
      expect(() => current.validate(value), value).toThrow(ToudocuError);
    }
    expectSyncCode(() => current.validate('.hidden.md'), 'path_forbidden');
    expectSyncCode(() => current.validate('private/secret.md'), 'path_forbidden');
    expectSyncCode(() => current.validate('docs/index.txt'), 'unsupported_extension');
  });

  it('rejects symlink escapes, including missing and dangling suffixes', async () => {
    const current = await policy();
    await writeFile(join(outside, 'secret.md'), 'outside\n');
    if (!(await makeSymlink(outside, join(root, 'escape')))) return;
    if (!(await makeSymlink(join(outside, 'missing'), join(root, 'dangling')))) return;

    await expectCode(current.resolveFile('escape/secret.md'), 'path_forbidden');
    await expectCode(current.resolveFile('escape/new.md', true), 'path_forbidden');
    await expect(current.resolveFile('dangling/new.md', true)).rejects.toBeDefined();
  });

  it('accepts a canonical existing file and a missing file under ordinary directories', async () => {
    const current = await policy();
    expect(await current.resolveFile('docs/index.md')).toBe(join(root, 'docs', 'index.md'));
    expect(await current.resolveFile('docs/new.md', true)).toBe(join(root, 'docs', 'new.md'));
  });
});

describe('assertSafeOutput', () => {
  it('rejects filesystem roots, protected roots, and an output ancestor of a protected root', async () => {
    const docs = join(root, 'docs');
    await expectCode(assertSafeOutput(parse(root).root, [docs]), 'unsafe_output');
    await expectCode(assertSafeOutput(docs, [docs]), 'unsafe_output');
    await expectCode(assertSafeOutput(dirname(root), [docs]), 'unsafe_output');
    expect(await assertSafeOutput(join(root, 'build', 'site'), [docs])).toBe(
      join(root, 'build', 'site'),
    );
  });

  it('rejects an output symlink before resolving its target', async () => {
    const link = join(root, 'output-link');
    if (!(await makeSymlink(outside, link))) return;
    await expectCode(assertSafeOutput(link, [join(root, 'docs')]), 'unsafe_output');
  });
});

describe('writeAtomically', () => {
  it('creates missing files, preserves create-only semantics, and leaves no temporary files', async () => {
    const current = await policy();
    const digest = await writeAtomically(current, 'docs/new.md', 'created\n', { kind: 'create' });
    expect(digest).toBe(contentDigest('created\n'));
    expect(await readFile(join(root, 'docs', 'new.md'), 'utf8')).toBe('created\n');
    await expect(current.resolveFile('docs/new.md')).resolves.toBe(join(root, 'docs', 'new.md'));

    await expect(
      writeAtomically(current, 'docs/index.md', 'overwrite\n', { kind: 'create' }),
    ).rejects.toBeDefined();
    expect(await readFile(join(root, 'docs', 'index.md'), 'utf8')).toBe('original\n');
    expect(
      (await readdir(join(root, 'docs'))).filter((name) => name.startsWith('.toudocu-write-')),
    ).toEqual([]);
  });

  it('replaces atomically with the expected digest and preserves mode, content on conflict, and cleanup', async () => {
    const current = await policy();
    const target = join(root, 'docs', 'index.md');
    await writeFile(target, 'baseline\n', { mode: 0o600 });
    await chmod(target, 0o600);
    const originalMode = (await stat(target)).mode & 0o777;
    const expected = contentDigest('baseline\n');

    expect(
      await writeAtomically(current, 'docs/index.md', 'updated\n', {
        kind: 'replace',
        expectedDigest: expected,
      }),
    ).toBe(contentDigest('updated\n'));
    expect(await readFile(target, 'utf8')).toBe('updated\n');
    expect((await stat(target)).mode & 0o777).toBe(originalMode);

    await expectCode(
      writeAtomically(current, 'docs/index.md', 'stale\n', {
        kind: 'replace',
        expectedDigest: expected,
      }),
      'stale_file',
    );
    expect(await readFile(target, 'utf8')).toBe('updated\n');
    expect(
      (await readdir(join(root, 'docs'))).filter((name) => name.startsWith('.toudocu-write-')),
    ).toEqual([]);
  });

  it('does no write when already aborted', async () => {
    const current = await policy();
    const controller = new AbortController();
    controller.abort();
    await expect(
      writeAtomically(current, 'docs/aborted.md', 'never\n', { kind: 'create' }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    await expect(current.resolveFile('docs/aborted.md')).rejects.toMatchObject({
      code: 'file_not_found',
    });
  });

  it('serializes same-path replacements so only one stale digest writer succeeds', async () => {
    const current = await policy();
    const target = join(root, 'docs', 'index.md');
    await writeFile(target, 'baseline\n');
    const expected = contentDigest('baseline\n');
    const results = await Promise.allSettled([
      writeAtomically(current, 'docs/index.md', 'first\n', {
        kind: 'replace',
        expectedDigest: expected,
      }),
      writeAtomically(current, 'docs/index.md', 'second\n', {
        kind: 'replace',
        expectedDigest: expected,
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(
      results
        .filter((result) => result.status === 'rejected')
        .map((result) => errorCode(result.reason)),
    ).toEqual(['stale_file']);
    expect(['first\n', 'second\n']).toContain(await readFile(target, 'utf8'));
    expect(
      (await readdir(join(root, 'docs'))).filter((name) => name.startsWith('.toudocu-write-')),
    ).toEqual([]);
  });
});

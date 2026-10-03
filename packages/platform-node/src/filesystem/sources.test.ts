import { expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseOpenAPIContract } from '@toudocu/core';
import { readSourceSnapshot } from './sources.js';

test('discovery is read-only, excludes locale trees and directories, and ignores symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-snapshot-'));
  try {
    for (const directory of ['contracts', 'docs-en', 'vendor', '.hidden', 'nested'])
      await mkdir(join(root, directory));
    for (const path of [
      'index.md',
      'docs-en/foreign.md',
      'vendor/ignored.md',
      '.hidden/ignored.md',
      'nested/DOC.MD',
      'contracts/api.openapi.yaml',
      'contracts/ordinary.yaml',
    ])
      await writeFile(join(root, path), path);
    await symlink(join(root, 'index.md'), join(root, 'linked.md'));
    await symlink(join(root, 'docs-en'), join(root, 'linked-directory'), 'dir');
    const snapshot = await readSourceSnapshot(root, {
      excludedRoots: [join(root, 'docs-en')],
      overlay: new Map([['index.md', '# Preview']]),
    });
    expect(snapshot.markdown.map((file) => file.sourcePath)).toEqual(['index.md', 'nested/DOC.MD']);
    expect(snapshot.markdown[0]?.content).toBe('# Preview');
    expect(await readFile(join(root, 'index.md'), 'utf8')).toBe('index.md');
    expect(snapshot.openAPI.map((file) => file.sourcePath)).toEqual(['contracts/api.openapi.yaml']);
    expect(snapshot.issues).toEqual([
      {
        severity: 'warning',
        code: 'ignored-symlink',
        message: 'Markdown symbolic link ignored.',
        documentPath: 'linked.md',
      },
    ]);
    await expect(readSourceSnapshot(root, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(
      (await readSourceSnapshot(root, { excludes: ['nested'] })).markdown.some(
        (file) => file.sourcePath === 'nested/DOC.MD',
      ),
    ).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preserves malformed OpenAPI bytes for the parser to reject', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-openapi-utf8-'));
  try {
    await mkdir(join(root, 'contracts'));
    const valid = new TextEncoder().encode(
      'openapi: 3.1.0\ninfo:\n  title: API\n  version: 1\npaths: {}\n',
    );
    const malformed = new Uint8Array([...valid, 0xff]);
    await writeFile(join(root, 'contracts/api.openapi.yaml'), malformed);

    const snapshot = await readSourceSnapshot(root);
    const content = snapshot.openAPI[0]?.content;
    expect(content).toBeInstanceOf(Uint8Array);
    expect(Array.from(content as Uint8Array).at(-1)).toBe(0xff);

    const result = parseOpenAPIContract('contracts/api.openapi.yaml', content as Uint8Array);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'openapi-syntax-error',
      message: 'Invalid OpenAPI YAML/JSON: yaml: invalid leading UTF-8 octet',
      line: 0,
      column: 0,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

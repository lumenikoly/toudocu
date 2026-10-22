import { describe, expect, it } from 'vitest';
import { buildDocumentIndex, type DocumentIndex } from './project.js';
import {
  connectUseCasesAndModules,
  resolveLinks,
  type LinkInventoryEntry,
  type LinkResolutionOptions,
} from './links.js';

const now = new Date('2026-09-19T00:00:00Z');
const repositoryRoot = '/repo';
const documentRoot = '/repo/docs';

function indexOf(entries: Record<string, string>): DocumentIndex {
  return buildDocumentIndex(
    Object.entries(entries).map(([sourcePath, content]) => ({
      sourcePath,
      content,
      modifiedAt: now,
    })),
    { now, staleDays: 0 },
  );
}

function inventory(
  entries: Record<string, LinkInventoryEntry>,
): LinkResolutionOptions['inventory'] {
  return (path) => entries[path];
}

function options(entries: Record<string, LinkInventoryEntry> = {}): LinkResolutionOptions {
  return { repositoryRoot, documentRoot, inventory: inventory(entries) };
}

function link(index: DocumentIndex, path: string, label: string) {
  return resolveLinks(index, options())
    .linksByPath.get(path)
    ?.find((item) => item.label === label);
}

describe('resolveLinks', () => {
  it('resolves documents, directory indexes, assets, queries, hashes, and reserved assets', () => {
    const index = indexOf({
      'index.md': [
        '# Home',
        '',
        '[guide](guide.md?view=1#details)',
        '[directory](nested/)',
        '[dot-directory](foo.bar/file)',
        '[asset](assets/readme.txt)',
        '![image](assets/image.png)',
        '[reserved](assets/manifest.json)',
      ].join('\n'),
      'guide.md': '# Guide\n\n## Details\n',
      'nested/topic.md': '# Topic\n',
      'foo.bar/file': '# Dot directory file\n',
    });
    const result = resolveLinks(
      index,
      options({
        '/repo/docs/assets/readme.txt': { kind: 'file', safe: true },
        '/repo/docs/assets/image.png': { kind: 'file', safe: true },
        '/repo/docs/assets/manifest.json': { kind: 'file', safe: true },
      }),
    );

    expect(link(index, 'index.md', 'guide')).toMatchObject({
      href: 'guide.html?view=1#details',
      targetDocumentPath: 'guide.md',
      broken: false,
    });
    expect(
      result.linksByPath.get('index.md')?.find((item) => item.label === 'directory'),
    ).toMatchObject({
      href: 'nested/index.html',
      generatedTarget: 'nested/index.html',
    });
    expect(
      result.linksByPath.get('index.md')?.find((item) => item.label === 'dot-directory'),
    ).toMatchObject({
      href: 'foo.bar/file.html',
      targetDocumentPath: 'foo.bar/file',
    });
    expect(
      result.linksByPath.get('index.md')?.find((item) => item.label === 'asset'),
    ).toMatchObject({
      href: 'assets/readme.txt',
      assetPath: 'assets/readme.txt',
    });
    expect(
      result.linksByPath.get('index.md')?.find((item) => item.label === 'image'),
    ).toMatchObject({
      href: 'assets/image.png',
      assetPath: 'assets/image.png',
    });
    expect(
      result.linksByPath.get('index.md')?.find((item) => item.label === 'reserved'),
    ).toMatchObject({
      href: '_files/assets/manifest.json',
      assetPath: '_files/assets/manifest.json',
    });
    expect(result.assets).toEqual(
      new Map([
        ['assets/readme.txt', '/repo/docs/assets/readme.txt'],
        ['assets/image.png', '/repo/docs/assets/image.png'],
        ['_files/assets/manifest.json', '/repo/docs/assets/manifest.json'],
      ]),
    );
    expect(result.issues).toEqual([]);
  });

  it('opens repository files locally in serve without copying them into static assets', () => {
    const index = indexOf({
      'work/task.md': [
        '# Task',
        '[contract](../../contracts/api.yaml?raw=1#schema)',
        '[schema](../../packages/document/schema.json)',
        '[source](../../src/example.html)',
        '[spaces](../../contracts/my%20contract.yaml)',
      ].join('\n'),
    });
    const filePaths = [
      'contracts/api.yaml',
      'packages/document/schema.json',
      'src/example.html',
      'contracts/my contract.yaml',
    ];
    const base = options(
      Object.fromEntries(filePaths.map((path) => [`/repo/${path}`, { kind: 'file', safe: true }])),
    );
    const local = resolveLinks(index, { ...base, localRepositoryLinks: true });
    expect(local.linksByPath.get('work/task.md')?.map((link) => link.href)).toEqual([
      '/_toudocu/repository/contracts/api.yaml?raw=1#schema',
      '/_toudocu/repository/packages/document/schema.json',
      '/_toudocu/repository/src/example.html',
      '/_toudocu/repository/contracts/my%20contract.yaml',
    ]);
    expect(local.repositoryPaths).toEqual(new Set(filePaths));
    expect(local.assets.size).toBe(0);
    expect(local.issues).toEqual([]);
    const published = resolveLinks(index, base);
    expect(published.repositoryPaths.size).toBe(0);
    expect(published.issues.map((issue) => issue.code)).toEqual(Array(4).fill('blocked-link'));
    expect(
      resolveLinks(index, {
        ...base,
        localRepositoryLinks: true,
        repositoryUrl: 'https://github.com/example/project',
      }).linksByPath.get('work/task.md')?.[0]?.href,
    ).toBe('/_toudocu/repository/contracts/api.yaml?raw=1#schema');
  });

  it('opens repository directories and public dotfile configuration locally', () => {
    const paths = [
      'contracts/openapi/internal',
      '.github/workflows/ci.yml',
      'apps/host-app/.env.example',
      'packages/design-system/.storybook/preview.ts',
      '.prettierrc.json',
      '.toudocu/config.yml',
    ];
    const index = indexOf({
      'guide.md': '# Sources\n' + paths.map((path) => `[source](../${path})`).join('\n'),
    });
    const base = options(
      Object.fromEntries(
        paths.map((path, index) => [
          `/repo/${path}`,
          { kind: index === 0 ? 'directory' : 'file', safe: true },
        ]),
      ),
    );
    const local = resolveLinks(index, { ...base, localRepositoryLinks: true });
    expect(local.issues).toEqual([]);
    expect(local.linksByPath.get('guide.md')?.map((link) => link.href)).toEqual(
      paths.map((path) => `/_toudocu/repository/${path}`),
    );
    expect(local.repositoryPaths).toEqual(
      new Set(paths.map((path, index) => path + (index === 0 ? '/' : ''))),
    );
    const published = resolveLinks(index, {
      ...base,
      repositoryUrl: 'https://github.com/example/project',
    });
    expect(published.repositoryPaths.size).toBe(0);
    expect(published.issues).toEqual([]);
    expect(published.linksByPath.get('guide.md')?.[0]?.href).toBe(
      'https://github.com/example/project/tree/main/contracts/openapi/internal',
    );
  });

  it('keeps hidden files, escapes, symlinks and embedded repository images blocked in serve', () => {
    const index = indexOf({
      'index.md': [
        '[hidden](../.env)',
        '[hidden-directory](../.git/config)',
        '[nested-secret](../.github/.env)',
        '[private-config](../.toudocu/private.json)',
        '[credentials](../.aws/credentials)',
        '[encoded](../100%25.txt)',
        '[escape](../../private.txt)',
        '[symlink](../link.yaml)',
        '[missing](../missing.yaml)',
        '![image](../image.png)',
      ].join('\n'),
    });
    const result = resolveLinks(index, {
      ...options({
        '/repo/.env': { kind: 'file', safe: true },
        '/repo/.git/config': { kind: 'file', safe: true },
        '/repo/.github/.env': { kind: 'file', safe: true },
        '/repo/.toudocu/private.json': { kind: 'file', safe: true },
        '/repo/.aws/credentials': { kind: 'file', safe: true },
        '/repo/100%.txt': { kind: 'file', safe: true },
        '/repo/link.yaml': { kind: 'file', safe: false },
        '/repo/image.png': { kind: 'file', safe: true },
      }),
      localRepositoryLinks: true,
    });
    expect(result.repositoryPaths.size).toBe(0);
    expect(result.linksByPath.get('index.md')?.every((link) => link.blocked || link.broken)).toBe(
      true,
    );
    expect(result.issues).toHaveLength(10);
  });

  it('blocks unsafe protocols, traversal, active assets, unsafe images, and unsafe inventory entries', () => {
    const index = indexOf({
      'index.md': [
        '[javascript](javascript:alert(1))',
        '[encoded](%6Aavascript:alert(1))',
        '[file](file:///tmp/secret)',
        '[active](assets/page.html)',
        '![active-image](assets/image.svg)',
        '![unsafe](assets/image.txt)',
        '[symlink](assets/link.txt)',
        '[repository](../README.md)',
        '[escape](../../outside.txt)',
      ].join('\n'),
    });
    const result = resolveLinks(index, {
      ...options({
        '/repo/docs/assets/page.html': { kind: 'file', safe: true },
        '/repo/docs/assets/image.svg': { kind: 'file', safe: true },
        '/repo/docs/assets/image.txt': { kind: 'file', safe: true },
        '/repo/docs/assets/link.txt': { kind: 'file', safe: false },
        '/repo/README.md': { kind: 'file', safe: true },
      }),
      repositoryUrl: 'https://github.com/example/project/',
      repositoryRef: 'feature/docs',
    });
    const links = result.linksByPath.get('index.md') ?? [];
    expect(links.find((item) => item.label === 'javascript')).toMatchObject({
      blocked: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'encoded')).toMatchObject({
      blocked: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'file')).toMatchObject({
      blocked: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'active')).toMatchObject({
      blocked: true,
      activeAsset: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'active-image')).toMatchObject({
      blocked: true,
      activeAsset: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'unsafe')).toMatchObject({
      blocked: true,
      unsafeImage: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'symlink')).toMatchObject({
      blocked: true,
      repositoryEscape: true,
      href: '#',
    });
    expect(links.find((item) => item.label === 'repository')).toMatchObject({
      external: true,
      href: 'https://github.com/example/project/blob/feature%2Fdocs/README.md',
      repositoryPath: 'README.md',
      repositoryKind: 'blob',
    });
    expect(links.find((item) => item.label === 'escape')).toMatchObject({
      blocked: true,
      repositoryEscape: true,
      href: '#',
    });
    expect(result.issues).toHaveLength(8);
  });

  it('reports broken links and anchors with architecture severity', () => {
    const index = indexOf({
      'architecture/overview.md': '# Architecture\n\n[missing](missing.md)\n\n[anchor](#unknown)\n',
      'index.md': '# Home\n',
    });
    const result = resolveLinks(index, options());
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'broken-link',
        documentPath: 'architecture/overview.md',
        line: 3,
        message: 'Broken link: missing.md',
      }),
      expect.objectContaining({
        severity: 'error',
        code: 'broken-link',
        documentPath: 'architecture/overview.md',
        line: 5,
        message: 'Broken link: #unknown (anchor not found)',
      }),
    ]);
  });
});

describe('connectUseCasesAndModules', () => {
  it('connects metadata and reciprocal document links using stable ids', () => {
    const index = indexOf({
      'modules/auth.md':
        '<!-- toudocu\nid: MOD-AUTH\n-->\n# Authentication\n\n[Login](../use-cases/login.md)\n',
      'modules/unused.md': '<!-- toudocu\nid: MOD-UNUSED\n-->\n# Unused\n',
      'use-cases/login.md': '<!-- toudocu\nid: UC-LOGIN\nmodule: MOD-AUTH\n-->\n# Login\n',
    });
    const resolved = resolveLinks(index, options());
    const result = connectUseCasesAndModules(index, resolved.linksByPath);

    expect(result.useCaseToModules).toEqual(new Map([['UC-LOGIN', ['MOD-AUTH']]]));
    expect(result.moduleToUseCases).toEqual(
      new Map([
        ['MOD-AUTH', ['UC-LOGIN']],
        ['MOD-UNUSED', []],
      ]),
    );
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'module-without-use-case',
        documentPath: 'modules/unused.md',
      }),
    ]);
  });
});

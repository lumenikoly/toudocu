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

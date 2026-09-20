import { describe, expect, it } from 'vitest';
import { ToudocuError } from '@toudocu/contracts';
import {
  defaultSiteConfig,
  documentationVersionDiagnostic,
  normalizeLocale,
  parseSiteConfig,
  sectionTypes,
} from './config.js';

function invalid(source: string, message?: string): void {
  try {
    parseSiteConfig(source);
    throw new Error('expected configuration to be rejected');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ToudocuError);
    expect((error as ToudocuError).code).toBe('INVALID_CONFIG');
    if (message) expect((error as ToudocuError).message).toContain(message);
  }
}

function rejected(source: string): ToudocuError {
  try {
    parseSiteConfig(source);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ToudocuError);
    return error as ToudocuError;
  }
  throw new Error('expected configuration to be rejected');
}

function locale(source: ReturnType<typeof parseSiteConfig>, name: string) {
  const profile = source.locales[name];
  expect(profile).toBeDefined();
  return profile!;
}

describe('site configuration parser', () => {
  it('preserves empty scalar defaults and rejects skipped indentation levels', () => {
    expect(parseSiteConfig('site:\n').site.title).toBe('');
    expect(parseSiteConfig('site:\n  title:\n').site.title).toBe('');
    invalid('site:\n    title: skipped\n', 'invalid nesting');
  });
  it('keeps legacy defaults and accepts a minimal v1 document', () => {
    const config = parseSiteConfig('site:\n  title: Toudocu\n');

    expect(config.documentationVersion).toBe(1);
    expect(config.site.title).toBe('Toudocu');
    expect(config.site.theme).toBe('classic');
    expect(config.site.colorScheme).toBe('system');
    expect(config.site.accent).toBe('indigo');
    expect(config.site.density).toBe('comfortable');
    expect(config.site.contentWidth).toBe('standard');
    expect(config.site.footer).toEqual({
      text: '',
      url: 'https://lumenikoly.github.io/toudocu/',
      defaultText: true,
    });
    expect(config.site.hero).toEqual({ enabled: true, image: '' });
    expect(config.changes).toEqual({
      defaultBaseRef: '',
      renameSimilarity: 60,
      includeTaskArtifacts: true,
      includeAssets: true,
      semanticDiff: true,
      renderedDiff: true,
      maxSourceDiffBytes: 2 * 1024 * 1024,
      maxRenderedFileBytes: 1024 * 1024,
      exclude: [],
    });
    expect(config.project.defaultLocale).toBe('');
    expect(config.locales).toEqual({});
  });

  it('parses every configurable value and completes a full locale profile', () => {
    const config = parseSiteConfig(`
documentationVersion: 3
site:
  title: Toudocu
  logo: assets/logo.svg
  favicon: assets/favicon.svg
  theme: terminal
  colorScheme: dark
  accent: rose
  density: compact
  contentWidth: wide
  footer:
    text: "Generated docs"
    url: https://example.com/docs
  hero:
    enabled: false
    image: assets/hero.svg
changes:
  defaultBaseRef: main
  renameSimilarity: 75
  includeTaskArtifacts: false
  includeAssets: false
  semanticDiff: false
  renderedDiff: false
  maxSourceDiffBytes: 100
  maxRenderedFileBytes: 200
  exclude:
    - docs/generated
    - docs/assets
project:
  defaultLocale: en-US
locales:
  en-US:
    root: docs
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use cases
      flows: Flows
      screens: Screens
      decisions: Decisions
      contracts: Contracts
      quality: Quality
      runbooks: Runbooks
      reference: Reference
      work: Work
      drafts: Drafts
      guides: Guides
`);

    expect(config.documentationVersion).toBe(3);
    expect(config.site).toEqual({
      title: 'Toudocu',
      logo: 'assets/logo.svg',
      favicon: 'assets/favicon.svg',
      theme: 'terminal',
      colorScheme: 'dark',
      accent: 'rose',
      density: 'compact',
      contentWidth: 'wide',
      footer: { text: 'Generated docs', url: 'https://example.com/docs', defaultText: false },
      hero: { enabled: false, image: 'assets/hero.svg' },
    });
    expect(config.changes).toEqual({
      defaultBaseRef: 'main',
      renameSimilarity: 75,
      includeTaskArtifacts: false,
      includeAssets: false,
      semanticDiff: false,
      renderedDiff: false,
      maxSourceDiffBytes: 100,
      maxRenderedFileBytes: 200,
      exclude: ['docs/generated', 'docs/assets'],
    });
    expect(config.project.defaultLocale).toBe('en-US');
    expect(locale(config, 'en-US')).toEqual({
      root: 'docs',
      sections: {
        architecture: 'Architecture',
        modules: 'Modules',
        'use-cases': 'Use cases',
        flows: 'Flows',
        screens: 'Screens',
        decisions: 'Decisions',
        contracts: 'Contracts',
        quality: 'Quality',
        runbooks: 'Runbooks',
        reference: 'Reference',
        work: 'Work',
        drafts: 'Drafts',
        guides: 'Guides',
      },
    });
  });

  it('uses footer defaults safely when text or URL is customized', () => {
    const text = parseSiteConfig('site:\n  footer:\n    text: Custom\n');
    expect(text.site.footer).toEqual({ text: 'Custom', url: '', defaultText: false });

    const url = parseSiteConfig('site:\n  footer:\n    url: https://example.com\n');
    expect(url.site.footer).toEqual({ text: '', url: 'https://example.com', defaultText: true });

    for (const value of [
      'http://example.com',
      'javascript:alert(1)',
      'https://user:pass@example.com',
      'https://example.com/a b',
      'https://example.com/"x',
    ]) {
      invalid(`site:\n  footer:\n    url: '${value}'\n`, 'safe HTTPS URL');
    }
  });

  it('accepts canonical locales, normalizes them, and rejects malformed ones', () => {
    const valid: Array<[string, string]> = [
      ['en-us', 'en-US'],
      ['zh-hant-tw', 'zh-Hant-TW'],
      ['de-1996', 'de-1996'],
      ['sl-rozaj', 'sl-rozaj'],
    ];
    for (const [input, expected] of valid) expect(normalizeLocale(input)).toBe(expected);
    for (const input of ['', 'e', 'en--US', 'en-12', 'en-abcdefghijk', 'en-abcde-!']) {
      expect(normalizeLocale(input)).toBeUndefined();
    }
  });

  it('requires a configured default locale in v3 and normalizes locale keys', () => {
    invalid('documentationVersion: 3\n', 'project.defaultLocale is required');
    invalid('documentationVersion: 3\nproject:\n  defaultLocale: en-US\n', 'configured locale');
    invalid(
      `documentationVersion: 3
project:
  defaultLocale: en-US
locales:
  en-US:
    root: docs
  en-12:
    root: other
`,
      'locale key',
    );
    invalid(
      `documentationVersion: 3
project:
  defaultLocale: en-US
locales:
  en-us:
    root: docs
  en-US:
    root: other
`,
      'duplicate normalized locale',
    );

    const config = parseSiteConfig(`documentationVersion: 3
project:
  defaultLocale: EN-us
locales:
  en-us:
    root: docs
`);
    expect(config.project.defaultLocale).toBe('en-US');
    expect(locale(config, 'en-US').root).toBe('docs');
  });

  it('preserves unlocated validation messages while retaining a source range', () => {
    const error = rejected('documentationVersion: 3\nproject:\n  defaultLocale: en-US\n');

    expect(error.message).toBe(
      'config.yml: project.defaultLocale must reference a configured locale',
    );
    expect(error.range?.start.line).toBe(3);
    expect(error.range?.start.column).toBeGreaterThan(1);
  });

  it('fills Drafts only for complete locale section sets', () => {
    const complete = sectionTypes
      .filter((section) => section !== 'drafts')
      .map((section) => `      ${section}: ${section}\n`)
      .join('');
    const config = parseSiteConfig(`documentationVersion: 3
project:
  defaultLocale: ru-RU
locales:
  ru-RU:
    root: docs
    sections:
${complete}`);
    expect(locale(config, 'ru-RU').sections.drafts).toBe('Черновики');

    const partial = parseSiteConfig(`documentationVersion: 3
project:
  defaultLocale: en-US
locales:
  en-US:
    root: docs
    sections:
      architecture: Architecture
`);
    expect(locale(partial, 'en-US').sections.drafts).toBeUndefined();
  });

  it('rejects duplicate, unknown, unsafe, and unsupported YAML constructs', () => {
    const invalidSources = [
      ['site:\n  title: first\nsite:\n  title: second\n', 'duplicate key'],
      ['unknown: value\n', 'unknown key'],
      ['site:\n  unknown: value\n', 'unknown key'],
      ['changes:\n  unknown: value\n', 'unknown key'],
      ['project:\n  unknown: value\n', 'unknown key'],
      ['site: {title: value}\n', 'unsupported YAML construct'],
      ['changes:\n  exclude: [docs/generated]\n', 'unsupported YAML construct'],
      ['site: &base\n  title: value\n', 'unsupported YAML construct'],
      ['site: *base\n', 'unsupported YAML construct'],
      ['site: !!map {}\n', 'unsupported YAML construct'],
      ['site:\n  title: |\n    value\n', 'unsupported YAML construct'],
      ['site:\n  title: >\n    value\n', 'unsupported YAML construct'],
      ['site:\n\ttitle: value\n', 'tabs are not allowed'],
      ['site:\n title: value\n', 'invalid indentation'],
      ['site:\n        title: value\n', 'invalid indentation'],
    ] as const;
    for (const [source, message] of invalidSources) invalid(source, message);
  });

  it('enforces scalar types, ranges, enums, and exclusion values', () => {
    for (const source of [
      'site:\n  hero:\n    enabled: yes\n',
      'site:\n  hero:\n    enabled: "true"\n',
      'changes:\n  includeAssets: 1\n',
      'documentationVersion: 0\n',
      'changes:\n  renameSimilarity: 101\n',
      'changes:\n  renameSimilarity: 0\n',
      'changes:\n  maxSourceDiffBytes: -1\n',
      'changes:\n  exclude:\n    -\n',
      'site:\n  theme: neon\n',
      'site:\n  colorScheme: sepia\n',
      'site:\n  accent: orange\n',
      'site:\n  density: roomy\n',
      'site:\n  contentWidth: huge\n',
    ])
      invalid(source);

    const config = parseSiteConfig(`documentationVersion: 2
changes:
  renameSimilarity: 100
  maxSourceDiffBytes: 1
  maxRenderedFileBytes: 2
  exclude:
    - docs/generated
`);
    expect(config.changes.renameSimilarity).toBe(100);
    expect(config.changes.exclude).toEqual(['docs/generated']);
  });

  it('normalizes CRLF and reports version migration diagnostics', () => {
    expect(parseSiteConfig('site:\r\n  title: CRLF\r\n').site.title).toBe('CRLF');
    const base = defaultSiteConfig();
    expect(documentationVersionDiagnostic({ ...base, documentationVersion: 1 })).toEqual({
      code: 'DOCS_MIGRATION_REQUIRED',
      message: 'Documentation version 1 must be migrated to version 3.',
      migration: 'v1-to-v2',
    });
    expect(documentationVersionDiagnostic({ ...base, documentationVersion: 2 })).toEqual({
      code: 'DOCS_MIGRATION_REQUIRED',
      message: 'Documentation version 2 must be migrated to version 3.',
      migration: 'v2-to-v3',
    });
    expect(documentationVersionDiagnostic({ ...base, documentationVersion: 3 })).toBeUndefined();
    expect(documentationVersionDiagnostic({ ...base, documentationVersion: 4 })).toEqual({
      code: 'DOCUMENTATION_VERSION_UNSUPPORTED',
      message: 'Documentation version 4 is newer than supported version 3; update Toudocu.',
    });
  });

  it('records UTF-8 ranges for Unicode validation errors after CRLF normalization', () => {
    const source = 'site:\r\n  title: Ж中😀e\u0301\r\n  unknown: value\r\n';
    const normalized = source.replace(/\r\n/g, '\n');
    const start = normalized.indexOf('unknown');
    const lineStart = normalized.lastIndexOf('\n', start - 1) + 1;
    const end = start + 'unknown'.length;
    const error = rejected(source);

    expect(error.message).toContain('config.yml:3: unknown key "site.unknown"');
    expect(error.range).toEqual({
      start: {
        offset: Buffer.byteLength(normalized.slice(0, start)),
        line: 3,
        column: Buffer.byteLength(normalized.slice(lineStart, start)) + 1,
      },
      end: {
        offset: Buffer.byteLength(normalized.slice(0, end)),
        line: 3,
        column: Buffer.byteLength(normalized.slice(lineStart, end)) + 1,
      },
    });
  });

  it('records a parser range for syntax errors with Unicode and LF input', () => {
    const source = 'site:\n  title: "😀\n';
    const normalized = source;
    const error = rejected(source);

    expect(error.message).toContain('config.yml:3:');
    expect(error.range?.start.line).toBe(3);
    expect(error.range?.start.offset).toBe(Buffer.byteLength(normalized));
    expect(error.range?.start.column).toBe(1);
  });
});

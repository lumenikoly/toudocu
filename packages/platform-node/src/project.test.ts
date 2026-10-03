import { expect, test } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProject, documentationImpactPathStatus } from './project.js';

const sections = [
  'architecture',
  'modules',
  'use-cases',
  'flows',
  'screens',
  'decisions',
  'contracts',
  'quality',
  'runbooks',
  'reference',
  'work',
  'drafts',
  'guides',
] as const;

function config(): string {
  return [
    'documentationVersion: 3',
    'site:',
    '  title: Test project',
    'project:',
    '  defaultLocale: en',
    'locales:',
    '  en:',
    '    root: docs-en',
    '    sections:',
    ...sections.map(
      (section) =>
        `      ${section}: ${section === 'architecture' ? 'Architecture' : section === 'use-cases' ? 'Use cases' : section[0]?.toUpperCase() + section.slice(1)}`,
    ),
    '  ru:',
    '    root: docs-ru',
    '    sections:',
    ...sections.map((section) => `      ${section}: ${section}`),
    '',
  ].join('\n');
}

async function projectFixture() {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-project-'));
  await mkdir(join(root, 'docs-en', 'architecture'), { recursive: true });
  await mkdir(join(root, 'docs-en', 'modules'), { recursive: true });
  await mkdir(join(root, 'docs-en', 'screens', 'previews'), { recursive: true });
  await mkdir(join(root, 'src', 'ui'), { recursive: true });
  await mkdir(join(root, 'docs-ru'), { recursive: true });
  await mkdir(join(root, '.toudocu'));
  await writeFile(join(root, '.toudocu', 'config.yml'), config());
  await writeFile(join(root, 'docs-en', 'index.md'), '# Test project\n\nOverview.\n');
  await writeFile(
    join(root, 'docs-en', 'architecture', 'overview.md'),
    '# Architecture\n\nOverview.\n',
  );
  await writeFile(
    join(root, 'docs-en', 'modules', 'auth.md'),
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth\n',
  );
  await writeFile(
    join(root, 'docs-en', 'screens', 'SC-AUTH-HOME.md'),
    '<!-- toudocu\nid: SC-AUTH-HOME\nscreenKind: page\nmodule: MOD-AUTH\nstatus: planned\nroute: /\npreview: previews/home.png\ncomponent: src/ui/home.tsx\n-->\n# Home\n',
  );
  await writeFile(join(root, 'docs-en', 'screens', 'previews', 'home.png'), 'png');
  await writeFile(join(root, 'src', 'ui', 'home.tsx'), 'export default {};');
  await writeFile(join(root, 'docs-en', 'screens', 'hotspots.json'), '{}');
  await writeFile(join(root, 'docs-ru', 'private.md'), '# Russian tree\n');
  return root;
}

test('loads one locale, prunes peer locale inventory, and injects safe screen assets', async () => {
  const root = await projectFixture();
  try {
    const result = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      now: new Date('2026-09-19T00:00:00Z'),
      staleDays: 90,
      repositoryUrl: 'https://github.com/example/project/',
      repositoryRef: 'main',
    });
    expect(result.locale).toMatchObject({ locale: 'en', root: join(root, 'docs-en') });
    expect(result.snapshot.markdown.map((file) => file.sourcePath)).not.toContain('private.md');
    expect(result.inventory.exists('docs-ru/private.md')).toBe(false);
    expect(result.knowledge.screens[0]).toMatchObject({
      id: 'SC-AUTH-HOME',
      preview: 'screens/previews/home.png',
      component: 'src/ui/home.tsx',
    });
    expect(result.screenAssets.get('screens/previews/home.png')).toBe(
      join(root, 'docs-en', 'screens', 'previews', 'home.png'),
    );
    expect(result.issues.map((issue) => issue.code)).not.toContain('invalid-hotspots-json');
    expect(result.issues.map((issue) => issue.code)).not.toContain('missing-project-locale');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loads repository CHANGELOG.md separately from the selected locale', async () => {
  const root = await projectFixture();
  try {
    await writeFile(join(root, 'CHANGELOG.md'), '# Releases\n\n- Root release note.\n');
    await writeFile(join(root, 'docs-en', 'CHANGELOG.md'), '# Local notes\n');
    const result = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      now: new Date('2026-09-19T00:00:00Z'),
    });

    expect(result.projectChangelog).toMatchObject({
      sourcePath: 'CHANGELOG.md',
      outputPath: 'project-changelog.html',
      title: 'Releases',
    });
    expect(result.index.byPath.get('CHANGELOG.md')).toMatchObject({
      type: 'document',
      title: 'Local notes',
    });
    expect(result.index.byPath.get('CHANGELOG.md')?.title).toBe('Local notes');
    expect(result.issues.map((issue) => issue.code)).not.toContain('project-changelog-unavailable');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('keeps malformed OpenAPI out of the compiled project and retains its issue', async () => {
  const root = await projectFixture();
  try {
    await mkdir(join(root, 'docs-en', 'contracts'));
    const valid = new TextEncoder().encode(
      'openapi: 3.1.0\ninfo:\n  title: API\n  version: 1\npaths: {}\n',
    );
    await writeFile(
      join(root, 'docs-en', 'contracts', 'broken.openapi.yaml'),
      new Uint8Array([...valid, 0xff]),
    );

    const result = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });

    expect(result.openAPI).toEqual([]);
    expect(result.openAPIDiagnostics).toContainEqual(
      expect.objectContaining({
        code: 'openapi-syntax-error',
        message: 'Invalid OpenAPI YAML/JSON: yaml: invalid leading UTF-8 octet',
        documentPath: 'contracts/broken.openapi.yaml',
        line: 0,
        column: 0,
      }),
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'openapi-syntax-error',
        documentPath: 'contracts/broken.openapi.yaml',
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not follow an unsafe repository CHANGELOG.md symlink', async () => {
  const root = await projectFixture();
  try {
    await writeFile(join(root, 'outside.md'), '# Outside\n');
    await symlink(join(root, 'outside.md'), join(root, 'CHANGELOG.md'));
    const result = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });

    expect(result.projectChangelog).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'project-changelog-unavailable',
          documentPath: 'CHANGELOG.md',
          severity: 'warning',
        }),
      ]),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses the selected locale for the project changelog fallback title', async () => {
  const root = await projectFixture();
  try {
    await writeFile(join(root, 'CHANGELOG.md'), '- Root release note.\n');
    const result = await loadProject(join(root, 'docs-ru'), { repositoryRoot: root });

    expect(result.projectChangelog).toMatchObject({
      title: 'Журнал изменений проекта',
      type: 'changelog',
      typeLabel: 'Журнал изменений проекта',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('overlay is used for Markdown and hotspots without filesystem/network reads', async () => {
  const root = await projectFixture();
  try {
    const result = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      overlay: new Map([
        ['index.md', '# Preview project\n'],
        ['screens/hotspots.json', '{"SC-AUTH-HOME": []}'],
      ]),
    });
    expect(result.index.byPath.get('index.md')?.title).toBe('Preview project');
    expect(result.snapshot.markdown.find((file) => file.sourcePath === 'index.md')?.content).toBe(
      '# Preview project\n',
    );
    expect(result.issues.map((issue) => issue.code)).not.toContain('invalid-hotspots-json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('surfaces documentation-version migration and aborts before filesystem work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-project-version-'));
  try {
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, '.toudocu'));
    await writeFile(
      join(root, '.toudocu', 'config.yml'),
      'documentationVersion: 2\nsite:\n  title: Old\n',
    );
    await writeFile(join(root, 'docs', 'index.md'), '# Old\n');
    await writeFile(join(root, 'docs', 'broken.md'), '<!-- toudocu:invalid\n');
    const result = await loadProject(join(root, 'docs'), { repositoryRoot: root });
    expect(result.snapshot.markdown).toEqual([]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'DOCS_MIGRATION_REQUIRED',
          documentPath: '.toudocu/config.yml',
        }),
      ]),
    );
    expect(result.issues.map((issue) => issue.code)).not.toContain('invalid-toudocu-annotation');
    await expect(
      loadProject(join(root, 'docs'), { repositoryRoot: root, signal: AbortSignal.abort() }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('inventory marks symlinked screen assets unsafe', async () => {
  const root = await projectFixture();
  try {
    await symlink(join(root, 'src', 'ui', 'home.tsx'), join(root, 'src', 'ui', 'link.tsx'));
    const result = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });
    expect(result.inventory.lookup(join(root, 'src', 'ui', 'link.tsx'))?.safe).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('documentation impact resolves bounded files and directories without admitting symlinks or peer roots', async () => {
  const root = await projectFixture();
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-impact-outside-'));
  try {
    await writeFile(join(outside, 'existing.md'), 'Outside content must not be loaded.');
    await symlink(join(root, 'src', 'ui', 'home.tsx'), join(root, 'src', 'ui', 'link.tsx'));
    const project = await loadProject(join(root, 'docs-en'), { repositoryRoot: root });
    const status = (value: string) =>
      documentationImpactPathStatus(project, value, 'work/TASK-AUTH-001.md');
    expect(status('src/ui/home.tsx')).toBe('found');
    expect(status('src/ui/')).toBe('found');
    expect(status('index.md')).toBe('found');
    expect(status('../architecture/overview.md')).toBe('found');
    expect(status('missing.md')).toBe('missing');
    expect(status('src/ui/link.tsx')).toBe('outside');
    expect(status('../../../nonexistent-toudocu-secret.md')).toBe('missing');
    expect(status(relative(root, join(outside, 'existing.md')))).toBe('outside');
    expect(status(join(root, 'docs-en', 'index.md'))).toBe('absolute');
    expect(status('docs-ru/index.md')).not.toBe('found');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('task documentation paths resolve files from repository, docs and source-relative roots', async () => {
  const root = await projectFixture();
  try {
    await mkdir(join(root, 'docs-en', 'work'));
    const content =
      '<!-- toudocu\nid: TASK-AUTH-001\nstatus: draft\ntaskType: maintenance\n-->\n# Task\n\n<!-- toudocu:section documentation-impact -->\n## Documentation\n\n`docs-en/index.md` `index.md` `src/ui/home.tsx` `docs-en/` [Architecture](../architecture/overview.md)';
    await writeFile(join(root, 'docs-en', 'work', 'TASK-AUTH-001.md'), content);
    const project = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      overlay: new Map([['work/TASK-AUTH-001.md', content]]),
    });
    expect(project.knowledge.workItems[0]?.documentationPaths).toEqual([
      'architecture/overview.md',
      'index.md',
      'src/ui/home.tsx',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('preview parent segments resolve against the source document and cannot escape the repository', async () => {
  const root = await projectFixture();
  try {
    await mkdir(join(root, 'docs-en', 'assets'));
    await writeFile(join(root, 'docs-en', 'assets', 'home.png'), 'png');
    const screen = (preview: string) =>
      `<!-- toudocu\nid: SC-AUTH-HOME\nmodule: MOD-AUTH\nscreenKind: page\npreview: ${preview}\n-->\n# Home\n`;
    const safe = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      overlay: new Map([['screens/SC-AUTH-HOME.md', screen('../assets/home.png')]]),
    });
    expect(safe.knowledge.screens[0]?.preview).toBe('assets/home.png');
    expect(safe.screenAssets.get('assets/home.png')).toBe(
      join(root, 'docs-en', 'assets', 'home.png'),
    );
    const unsafe = await loadProject(join(root, 'docs-en'), {
      repositoryRoot: root,
      overlay: new Map([['screens/SC-AUTH-HOME.md', screen('../../../outside.png')]]),
    });
    expect(unsafe.knowledge.screens[0]?.preview).toBe('');
    expect(unsafe.issues.some((issue) => issue.code === 'unsafe-screen-preview')).toBe(true);
    expect(unsafe.screenAssets.size).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

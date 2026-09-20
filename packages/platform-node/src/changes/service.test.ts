import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import capture from '../../../../fixtures/expected/compatibility/changes-copy.json' with { type: 'json' };
import { ChangeSetReportV1Schema } from '@toudocu/contracts';
import { buildDocumentationChange } from '@toudocu/core';
import { buildDocumentationChanges } from './service.js';

const exec = promisify(execFile);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await exec('git', ['-C', root, ...args]);
  return result.stdout.trim();
}

async function fixture(): Promise<{ root: string; docs: string; initial: string }> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-changes-service-'));
  const docs = join(root, 'docs');
  await mkdir(join(docs, 'modules'), { recursive: true });
  await mkdir(join(docs, 'work'), { recursive: true });
  await mkdir(join(root, '.toudocu'), { recursive: true });
  await writeFile(
    join(root, '.toudocu', 'config.yml'),
    [
      'documentationVersion: 3',
      'project:',
      '  defaultLocale: en',
      'locales:',
      '  en:',
      '    root: docs',
      '    sections:',
      '      architecture: Architecture',
      '      modules: Modules',
      '      use-cases: Use cases',
      '      flows: Flows',
      '      screens: Screens',
      '      decisions: Decisions',
      '      contracts: Contracts',
      '      quality: Quality',
      '      runbooks: Runbooks',
      '      reference: Reference',
      '      work: Work',
      '      drafts: Drafts',
      '      guides: Guides',
      '',
    ].join('\n'),
  );
  await exec('git', ['-C', root, 'init', '-q']);
  await git(root, ['config', 'user.name', 'Toudocu Test']);
  await git(root, ['config', 'user.email', 'toudocu@example.test']);
  await writeFile(
    join(docs, 'modules', 'MOD-A.md'),
    '<!-- toudocu\nid: MOD-A\nstatus: active\n-->\n# Module A\n',
  );
  await writeFile(join(docs, 'index.md'), '# Docs\n');
  await git(root, ['add', '--', '.']);
  await git(root, ['commit', '-qm', 'initial']);
  const initial = await git(root, ['rev-parse', 'HEAD']);
  return { root, docs, initial };
}

async function cleanup(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

test('reads working-tree and index changes without writing the Git index', async () => {
  const value = await fixture();
  try {
    const indexBefore = await readFile(join(value.root, '.git', 'index'));
    await writeFile(
      join(value.docs, 'modules', 'MOD-A.md'),
      '<!-- toudocu\nid: MOD-A\nstatus: done\n-->\n# Module A\n',
    );
    const working = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      target: 'working-tree',
    });
    expect(working.changes).toHaveLength(1);
    expect(working.changes[0]).toMatchObject({
      path: 'docs/modules/MOD-A.md',
      status: 'modified',
      semanticDiffAvailable: true,
    });
    expect(await readFile(join(value.root, '.git', 'index'))).toEqual(indexBefore);

    await git(value.root, ['add', '--', 'docs/modules/MOD-A.md']);
    const stagedIndexBefore = await readFile(join(value.root, '.git', 'index'));
    const index = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      target: 'index',
    });
    expect(index.changes[0]?.gitState.staged).toBe(true);
    expect(await readFile(join(value.root, '.git', 'index'))).toEqual(stagedIndexBefore);
  } finally {
    await cleanup(value.root);
  }
});

test('compares commit ranges and keeps a stable digest', async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.docs, 'index.md'), '# Changed docs\n');
    await git(value.root, ['add', '--', '.']);
    await git(value.root, ['commit', '-qm', 'change']);
    const target = await git(value.root, ['rev-parse', 'HEAD']);
    const first = await buildDocumentationChanges(value.docs, {
      base: value.initial,
      target,
    });
    const second = await buildDocumentationChanges(value.docs, {
      base: value.initial,
      target,
    });
    expect(first.changes.map((change) => change.path)).toEqual(['docs/index.md']);
    expect(first.changeSetDigest).toBe(second.changeSetDigest);
    expect(first.changeSetDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  } finally {
    await cleanup(value.root);
  }
});

test('applies file, status, permanent, entity, and module filters after task impact', async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.docs, 'modules', 'MOD-A.md'), '# Changed\n');
    await writeFile(join(value.docs, 'notes.md'), '# Notes\n');
    const all = await buildDocumentationChanges(value.docs, { base: 'HEAD' });
    expect(all.changes.map((change) => change.path)).toEqual([
      'docs/modules/MOD-A.md',
      'docs/notes.md',
    ]);
    await writeFile(
      join(value.docs, 'work', 'TASK-A.md'),
      [
        '<!-- toudocu',
        'id: TASK-A',
        'status: ready',
        '-->',
        '# Task A',
        '',
        '<!-- toudocu:section documentation-impact -->',
        '## Documentation impact',
        '',
        '- `modules/MOD-A.md`',
        '',
        '<!-- toudocu:section scope -->',
        '## Scope',
        '',
        '- `docs/notes.md`',
        '',
      ].join('\n'),
    );
    const taskFiltered = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      taskID: 'TASK-A',
    });
    expect(taskFiltered.changes.map((change) => change.path)).toEqual([
      'docs/modules/MOD-A.md',
      'docs/notes.md',
      'docs/work/TASK-A.md',
    ]);
    expect(taskFiltered.taskImpact?.declared).toEqual([
      expect.objectContaining({ path: 'docs/modules/MOD-A.md', changed: true }),
    ]);
    await writeFile(
      join(value.docs, 'work', 'TASK-A-CHILD.md'),
      '<!-- toudocu\nid: TASK-A-CHILD\nparentTask: TASK-A\nstatus: ready\n-->\n# Child\n',
    );
    const taskTree = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      taskID: 'TASK-A',
      taskTree: true,
    });
    expect(taskTree.changes.map((change) => change.path)).toContain('docs/work/TASK-A-CHILD.md');
    const filtered = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      entityType: 'module',
      module: 'MOD-A',
      file: 'docs/modules/MOD-A.md',
      status: 'modified',
      permanentOnly: true,
    });
    expect(filtered.changes.map((change) => change.path)).toEqual(['docs/modules/MOD-A.md']);
    expect(filtered.summary.files.modified).toBe(1);
  } finally {
    await cleanup(value.root);
  }
});

test('returns the migration gate without reading documentation content', async () => {
  const value = await fixture();
  try {
    await mkdir(join(value.root, '.toudocu'), { recursive: true });
    await writeFile(join(value.root, '.toudocu', 'config.yml'), 'documentationVersion: 2\n');
    const report = await buildDocumentationChanges(value.docs);
    expect(report).toMatchObject({
      schemaVersion: 1,
      changes: [],
      summary: { entities: null, classifications: null },
      diagnostics: [{ code: 'DOCS_MIGRATION_REQUIRED' }],
    });
    expect(ChangeSetReportV1Schema.parse(report).summary.entities).toBeNull();
  } finally {
    await cleanup(value.root);
  }
});

test('adds safe rendered sides only when requested', async () => {
  const value = await fixture();
  try {
    await writeFile(join(value.docs, 'index.md'), '# Docs\n\nBefore <script>alert(1)</script>.\n');
    const ordinary = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      renderedDiff: true,
    });
    const rendered = await buildDocumentationChanges(value.docs, {
      base: 'HEAD',
      renderedDiff: true,
      includeRenderedHTML: true,
    });
    expect(ordinary.changes[0]?.renderedAfter).toBeUndefined();
    expect(rendered.changes[0]?.renderedBefore).toContain('>Docs</h1>');
    expect(rendered.changes[0]?.renderedAfter).toContain('alert(1)');
    expect(rendered.changes[0]?.renderedAfter).not.toContain('<script>');
  } finally {
    await cleanup(value.root);
  }
});

test('uses the platform asset metadata helper for binary asset changes', async () => {
  const value = await fixture();
  try {
    await mkdir(join(value.docs, 'assets'), { recursive: true });
    await writeFile(
      join(value.docs, 'assets', 'logo.svg'),
      '<svg width="12" height="6" viewBox="0 0 12 6"></svg>\n',
    );
    const report = await buildDocumentationChanges(value.docs, { base: 'HEAD' });
    const asset = report.changes.find((change) => change.path === 'docs/assets/logo.svg');
    expect(asset?.asset).toEqual({
      after: {
        mediaType: 'image/svg+xml',
        width: 12,
        height: 6,
        aspectRatio: 2,
      },
    });
  } finally {
    await cleanup(value.root);
  }
});

test('rejects an input outside the repository documentation tree', async () => {
  const value = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-outside-'));
  try {
    await expect(buildDocumentationChanges(outside)).rejects.toMatchObject({
      code: 'git-repository-not-found',
    });
  } finally {
    await cleanup(value.root);
    await cleanup(outside);
  }
});

test('uses typed errors for unresolved target and merge-base revisions', async () => {
  const value = await fixture();
  try {
    await expect(
      buildDocumentationChanges(value.docs, { target: 'missing-target' }),
    ).rejects.toMatchObject({ code: 'git-target-not-found' });
    await expect(
      buildDocumentationChanges(value.docs, { branchBase: 'missing-branch' }),
    ).rejects.toMatchObject({ code: 'git-merge-base-not-found' });
  } finally {
    await cleanup(value.root);
  }
});

test('matches the saved Go change for the compatibility fixture', async () => {
  const expectedReport = ChangeSetReportV1Schema.parse(JSON.parse(capture.stdout));
  const expected = expectedReport.changes.find(
    (change) => change.path === 'docs/modules/core.md' && change.status === 'modified',
  );
  if (!expected) {
    throw new Error('The compatibility fixture does not contain its modified core change.');
  }
  const oldSource = await readFile(
    join(workspaceRoot, 'fixtures/projects/compat-basic/docs/modules/core.md'),
  );
  const addition = new TextEncoder().encode('\nChanged before copying.\n');
  const newSource = new Uint8Array([...oldSource, ...addition]);
  const result = buildDocumentationChange(
    {
      status: 'modified',
      path: 'docs/modules/core.md',
      gitState: { staged: true, unstaged: false, untracked: false },
      docsRel: 'docs',
      oldContent: oldSource,
      newContent: newSource,
      patch: new TextEncoder().encode(expected.sourceDiff ?? ''),
    },
    { renderedDiff: true, semanticDiff: true },
  );
  expect(result.change).toEqual(expected);
});

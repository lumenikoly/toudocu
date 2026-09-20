import { expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EditorWorkspace } from './editor.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-editor-'));
  const docs = join(root, 'docs');
  await mkdir(join(root, '.toudocu'), { recursive: true });
  await mkdir(docs);
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
  ];
  await writeFile(
    join(root, '.toudocu', 'config.yml'),
    `documentationVersion: 3\nproject:\n  defaultLocale: en\nlocales:\n  en:\n    root: docs\n    sections:\n${sections.map((section) => `      ${section}: ${section}`).join('\n')}\n`,
  );
  await writeFile(join(docs, 'index.md'), '# Original\n');
  return { root, docs };
}

test('editor workspace preserves external changes and creates drafts safely', async () => {
  const value = await fixture();
  try {
    const editor = new EditorWorkspace(value.docs, { repositoryRoot: value.root });
    const opened = await editor.read('index.md');
    await writeFile(join(value.docs, 'index.md'), '# External\n');
    await expect(
      editor.save({
        path: 'index.md',
        content: '# Local\n',
        expectedDigest: opened.file.digest,
        confirmOverwrite: false,
      }),
    ).rejects.toMatchObject({ code: 'stale_digest' });
    expect(await readFile(join(value.docs, 'index.md'), 'utf8')).toBe('# External\n');

    const current = await editor.read('index.md');
    await editor.save({
      path: 'index.md',
      content: '# Local\n',
      expectedDigest: current.file.digest,
      confirmOverwrite: true,
    });
    expect(await readFile(join(value.docs, 'index.md'), 'utf8')).toBe('# Local\n');

    const draft = await editor.create({
      template: 'draft',
      language: 'en',
      fields: { title: 'Useful draft' },
    });
    expect(draft).toBe('drafts/useful-draft.md');
    expect(await readFile(join(value.docs, draft), 'utf8')).toBe('# Useful draft\n');
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});

import { expect, test } from 'vitest';
import { createDocument } from './document.js';
import { validateDocumentBasics } from './validate.js';

test('file-local validation preserves diagnostics, exempt note rules and required semantic sections', () => {
  const now = new Date('2026-09-19T00:00:00Z');
  const check = (sourcePath: string, content: string) =>
    validateDocumentBasics(
      createDocument({ sourcePath, content, modifiedAt: now }, { now, staleDays: 0 }),
    );
  expect(check('notes.md', '')).toEqual([]);
  expect(check('notes.md', '<b>unsafe</b>').map((issue) => issue.code)).toEqual([
    'forbidden-raw-html',
    'forbidden-raw-html',
  ]);
  const issues = check('modules/module.md', '');
  expect(issues.map((issue) => issue.code)).toEqual([
    'missing-semantic-field',
    'missing-semantic-field',
    'empty-document',
    'missing-h1',
    'missing-description',
    'missing-status',
    ...Array<string>(6).fill('missing-section'),
  ]);
  expect(issues.every((issue) => issue.documentPath === 'modules/module.md')).toBe(true);
  const complete =
    '<!-- toudocu\nid: ADR-001\nstatus: done\n-->\n# Decision\n\nIntroduction.\n\n' +
    ['context', 'decision', 'consequences']
      .map((kind) => `<!-- toudocu:section ${kind} -->\n## ${kind}\n`)
      .join('\n');
  expect(check('decisions/ADR-001.md', complete)).toEqual([]);
});

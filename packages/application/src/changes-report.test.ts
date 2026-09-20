import changesMarkdownCapture from '../../../fixtures/expected/compatibility/changes-markdown.json' with { type: 'json' };
import changesReportCapture from '../../../fixtures/expected/compatibility/changes-filter-type.json' with { type: 'json' };
import changesTextCapture from '../../../fixtures/expected/compatibility/changes-text.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { ChangeSetReportV1Schema } from '@toudocu/contracts';
import { formatChangesMarkdown, formatChangesText } from './changes-report.js';

function report(capture: { stdout: string }) {
  return ChangeSetReportV1Schema.parse(
    JSON.parse(
      capture.stdout
        .replaceAll('<TEMP>', '/tmp/repository')
        .replaceAll('<TIMESTAMP>', '2026-09-19T00:00:00Z')
        .replaceAll('"<DURATION>"', '0'),
    ),
  );
}

test('matches the Go text and Markdown changes report baselines', () => {
  const value = report(changesReportCapture);

  expect(formatChangesText(value)).toBe(changesTextCapture.stdout);
  expect(formatChangesMarkdown(value)).toBe(changesMarkdownCapture.stdout);
});

test('formats migration diagnostics and status symbols', () => {
  const value = report(changesReportCapture);
  value.repository.branch = '';
  value.repository.dirty = false;
  value.comparison.target.resolved = '123456789';
  value.changes = [
    {
      ...value.changes[0]!,
      status: 'added',
      path: 'new.md',
      oldPath: 'old.md',
      semanticChanges: [
        {
          kind: 'changed',
          entity: { type: 'document' },
          summary: 'Changed document.',
        },
      ],
    },
  ];
  value.diagnostics = [
    {
      severity: 'error',
      code: 'DOCS_MIGRATION_REQUIRED',
      message: 'Migration required.',
      migration: 'run migration',
      documentPath: 'docs/index.md',
    },
  ];

  const text = formatChangesText(value);

  expect(text).toContain('Branch: detached HEAD\nState: clean');
  expect(text).toContain('+ new.md ← old.md');
  expect(text).toContain('Migration: run migration\nFile: docs/index.md');
});

test('includes untracked files and sorts Markdown paths lexically', () => {
  const value = report(changesReportCapture);
  value.summary.files.added = 1;
  value.summary.files.untracked = 2;
  const paths = ['\u{1f600}.md', '\uE000.md', 'кириллица.md', 'a.md', '_file.md', 'A.md'];
  value.changes = paths.map((path) => ({
    ...value.changes[0]!,
    path,
    semanticChanges: [
      {
        kind: 'test',
        entity: { type: 'document' },
        summary: path,
      },
    ],
  }));

  const markdown = formatChangesMarkdown(value);
  const positions = ['A.md', '_file.md', 'a.md', 'кириллица.md', '\uE000.md', '\u{1f600}.md'].map(
    (path) => markdown.indexOf(`### \`${path}\``),
  );

  expect(markdown).toContain('- Added: 3\n');
  expect(positions[0]).toBeLessThan(positions[1]!);
  expect(positions[1]).toBeLessThan(positions[2]!);
  expect(positions[2]).toBeLessThan(positions[3]!);
  expect(positions[3]).toBeLessThan(positions[4]!);
  expect(positions[4]).toBeLessThan(positions[5]!);
});

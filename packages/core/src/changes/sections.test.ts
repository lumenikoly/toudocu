import { expect, test } from 'vitest';
import { parseMarkdown } from '../markdown/parse.js';
import { renderedSectionDiff } from './sections.js';

function analysis(source: string) {
  return parseMarkdown(source).analysis;
}

test('compares top-level H2 sections with sorted statuses and source locations', () => {
  const oldAnalysis = analysis(`# Document

## Keep

Same\u00a0text.

## Move

Move me.

## Modify

Old text.

## Remove

Gone.

### Nested

Ignored.
`);
  const newAnalysis = analysis(`# Document

## Keep

Same text.

## Add

New.

## Modify

New text.

## Move

Move me.
`);

  const [changes, diagnostics] = renderedSectionDiff(oldAnalysis, newAnalysis, 'old.md', 'new.md');

  expect(diagnostics).toEqual([]);
  expect(changes.map((change) => [change.id, change.status])).toEqual([
    ['add', 'added-section'],
    ['keep', 'unchanged-section'],
    ['modify', 'modified-section'],
    ['move', 'moved-section'],
    ['remove', 'removed-section'],
  ]);
  expect(changes[0]).toMatchObject({
    id: 'add',
    titleAfter: 'Add',
    anchorAfter: 'add',
    sourceAfter: { path: 'new.md', line: 6 },
  });
  expect(changes[0]).not.toHaveProperty('titleBefore');
  expect(changes[1]).toMatchObject({
    sourceBefore: { path: 'old.md', line: 2 },
    sourceAfter: { path: 'new.md', line: 2 },
  });
});

test('skips duplicate section anchors and reports an ambiguity warning', () => {
  const oldAnalysis = analysis('# Document\n\n## Shared\n\nOld.\n');
  const newAnalysis = analysis('# Document\n\n## Shared\n\nNew.\n');
  const shared = newAnalysis.sections[0];
  if (!shared) throw new Error('test fixture must contain a section');
  newAnalysis.sections.push({ ...shared, heading: { ...shared.heading } });

  const [changes, diagnostics] = renderedSectionDiff(oldAnalysis, newAnalysis, 'old.md', 'new.md');

  expect(changes).toEqual([]);
  expect(diagnostics).toEqual([
    {
      severity: 'warning',
      code: 'rendered-section-match-ambiguous',
      message: 'Section with anchor shared cannot be matched unambiguously.',
      documentPath: 'new.md',
    },
  ]);
});

test('omits zero source lines and empty section fields', () => {
  const oldAnalysis = analysis('##\n\nContent.\n');
  const newAnalysis = analysis('##\n\nContent.\n');
  const oldSection = oldAnalysis.sections[0];
  const newSection = newAnalysis.sections[0];
  if (!oldSection || !newSection) {
    throw new Error('test fixture must contain a section');
  }
  oldSection.heading.id = '';
  newSection.heading.id = '';

  const [changes, diagnostics] = renderedSectionDiff(oldAnalysis, newAnalysis, 'old.md', 'new.md');

  expect(diagnostics).toEqual([]);
  expect(changes).toEqual([
    {
      id: '',
      status: 'unchanged-section',
      sourceBefore: { path: 'old.md' },
      sourceAfter: { path: 'new.md' },
    },
  ]);
});

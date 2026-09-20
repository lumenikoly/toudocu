import { expect, test } from 'vitest';
import { classifyChangePath, countPatchLines, parseSourceDiffHunks } from './patch.js';

test('keeps hunk bytes, defaults omitted lengths, and excludes diff file headers from line totals', () => {
  const first = '@@ -1 +1 @@ heading\n-old\n+new\n';
  const second = '@@ -8,0 +9,2 @@\n+one\n+two\n\\ No newline at end of file';
  const patch =
    'diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n' + first + second;
  expect(parseSourceDiffHunks(patch)).toEqual([
    {
      id: 'hunk-1-1',
      header: '@@ -1 +1 @@ heading',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      patch: first,
    },
    {
      id: 'hunk-8-9',
      header: '@@ -8,0 +9,2 @@',
      oldStart: 8,
      oldLines: 0,
      newStart: 9,
      newLines: 2,
      patch: second,
    },
  ]);
  expect(countPatchLines(patch)).toEqual({ added: 3, deleted: 1 });
  expect(parseSourceDiffHunks('binary patch')).toEqual([]);
});

test('classifies current selected-root paths without classifying by unrelated repository prefixes', () => {
  expect(classifyChangePath('manual/docs', 'manual/docs/work/TASK-X-001.md')).toBe('work-artifact');
  expect(classifyChangePath('docs', 'docs/release-notes.md')).toBe('work-artifact');
  expect(classifyChangePath('docs', 'docs/contracts/api.md')).toBe('contract');
  expect(classifyChangePath('docs', 'docs/data.JSON')).toBe('contract');
  expect(classifyChangePath('docs', 'docs/assets/image.PNG')).toBe('asset');
  expect(classifyChangePath('docs', 'docs/architecture/overview.md')).toBe(
    'permanent-documentation',
  );
});

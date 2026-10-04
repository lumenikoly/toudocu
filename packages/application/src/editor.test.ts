import { expect, test } from 'vitest';
import { compileProject } from '@toudocu/core';
import { previewEditorDocument } from './editor.js';

test('editor preview uses the shared compiler and escapes raw HTML', () => {
  const project = compileProject(
    [
      {
        sourcePath: 'index.md',
        content: '# Preview\n\n<script>alert(1)</script>',
        modifiedAt: new Date(),
      },
    ],
    {
      now: new Date(),
      staleDays: 90,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => false, matches: () => [] },
    },
  );
  const preview = previewEditorDocument(project, 'index.md');
  expect(preview.html).toContain('script>alert(1)');
  expect(preview.html).not.toContain('<script>');
});

import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { buildDocumentationChange } from '@toudocu/core';

const encode = (source: string): Uint8Array => new TextEncoder().encode(source);

test('matches the saved Go semantic baseline for the compatibility copy fixture', () => {
  const source = readFileSync(
    new URL('../../../../fixtures/projects/compat-basic/docs/modules/core.md', import.meta.url),
    'utf8',
  );
  const expectedEnvelope = JSON.parse(
    readFileSync(
      new URL('../../../../fixtures/expected/compatibility/changes-copy.json', import.meta.url),
      'utf8',
    ),
  ) as { stdout: string };
  const expectedReport = JSON.parse(expectedEnvelope.stdout) as {
    changes: Array<{ path: string; semanticChanges: unknown }>;
  };
  const expected = expectedReport.changes.find(
    (change) => change.path === 'docs/modules/core-copy.md',
  )?.semanticChanges;
  const newSource = `${source}\nChanged before copying.\n`;

  const result = buildDocumentationChange(
    {
      status: 'copied',
      path: 'docs/modules/core-copy.md',
      oldPath: 'docs/modules/core.md',
      gitState: {
        staged: false,
        unstaged: false,
        untracked: false,
      },
      docsRel: 'docs',
      oldContent: encode(source),
      newContent: encode(newSource),
    },
    { semanticDiff: true },
  );

  expect(result.change.semanticChanges).toEqual(expected);
});

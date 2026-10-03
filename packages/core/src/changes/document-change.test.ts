import { expect, test } from 'vitest';
import { buildDocumentationChange, type DocumentChangeInput } from './document-change.js';

const encode = (source: string): Uint8Array => new TextEncoder().encode(source);

const gitState = {
  staged: false,
  unstaged: true,
  untracked: false,
};

function input(overrides: Partial<DocumentChangeInput> = {}): DocumentChangeInput {
  return {
    status: 'modified',
    path: 'docs/modules/MOD-A.md',
    gitState,
    docsRel: 'docs',
    oldContent: encode('# Old\n'),
    newContent: encode('# New\n'),
    patch: encode('@@ -1,1 +1,1 @@\n-# Old\n+# New\n'),
    ...overrides,
  };
}

function metadataDocument(id: string, title: string): string {
  return ['<!-- toudocu', `id: ${id}`, 'status: active', '-->', `# ${title}`, ''].join('\n');
}

test('builds added and deleted Markdown changes with parsed side state', () => {
  const added = buildDocumentationChange(
    input({
      status: 'added',
      oldContent: encode(''),
      newContent: encode(metadataDocument('MOD-A', 'Added')),
      patch: encode('@@ -0,0 +1,4 @@\n+<!-- toudocu\n+# Added\n'),
    }),
    { semanticDiff: true },
  );
  expect(added.change).toMatchObject({
    status: 'added',
    entitiesBefore: [],
    entitiesAfter: [{ id: 'MOD-A', type: 'module', title: 'Added' }],
    semanticDiffAvailable: true,
  });
  expect(added.change.semanticChanges).toEqual([
    expect.objectContaining({
      kind: 'entity-added',
      sourceAfter: { path: 'docs/modules/MOD-A.md', line: 1 },
    }),
  ]);
  expect(added.oldSide?.source).toBe('');
  expect(added.newSide?.analysis.title).toBe('Added');

  const deleted = buildDocumentationChange(
    input({
      status: 'deleted',
      oldContent: encode(metadataDocument('MOD-A', 'Deleted')),
      newContent: encode(''),
      patch: encode('@@ -1,4 +0,0 @@\n-# Deleted\n'),
    }),
    { semanticDiff: true },
  );
  expect(deleted.change).toMatchObject({
    status: 'deleted',
    entitiesBefore: [{ id: 'MOD-A', type: 'module', title: 'Deleted' }],
    entitiesAfter: [],
    semanticDiffAvailable: true,
  });
  expect(deleted.change.semanticChanges).toEqual([
    expect.objectContaining({
      kind: 'entity-removed',
      sourceBefore: { path: 'docs/modules/MOD-A.md', line: 1 },
    }),
  ]);
});

test('keeps binary and oversized changes unavailable for source diff', () => {
  const binary = buildDocumentationChange(
    input({
      oldContent: new Uint8Array([0, 1, 2]),
      newContent: encode(''),
      patch: encode('@@ -0,0 +1,1 @@\n+binary\n'),
    }),
  );
  expect(binary.change).toMatchObject({ binary: true, sourceDiffAvailable: false });
  expect(binary.change.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'git-binary-diff-unavailable' })]),
  );

  const oversized = buildDocumentationChange(
    input({
      oldContent: encode('old content'),
      newContent: encode('new content'),
      patch: encode('patch'),
    }),
    { maxSourceDiffBytes: 1 },
  );
  expect(oversized.change).toMatchObject({ binary: false, sourceDiffAvailable: false });
  expect(oversized.change.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'change-file-too-large' })]),
  );
});

test('retains source availability while disabling semantic diff for invalid Markdown', () => {
  const result = buildDocumentationChange(
    input({
      oldContent: encode('# Valid\n'),
      newContent: encode('<div>raw HTML</div>\n'),
    }),
    { semanticDiff: false },
  );

  expect(result.change).toMatchObject({
    sourceDiffAvailable: true,
    semanticDiffAvailable: false,
    semanticChanges: [],
    relationChanges: [],
  });
  expect(result.change.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'semantic-new-version-invalid' }),
      expect.objectContaining({ code: 'forbidden-raw-html', severity: 'error' }),
    ]),
  );
});

test('reports patch failures, missing versions, and supports omitted source text', () => {
  const failedInput = input({
    oldContentError: new Error('old version unavailable'),
    newContentError: new Error('new version unavailable'),
    patchError: new Error('git diff failed'),
  });
  delete failedInput.patch;
  const failed = buildDocumentationChange(failedInput);
  expect(failed.change.sourceDiffAvailable).toBe(false);
  expect(failed.change.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'change-old-version-missing' }),
      expect.objectContaining({
        code: 'change-new-version-missing',
        documentPath: 'docs/modules/MOD-A.md',
      }),
      expect.objectContaining({ code: 'git-command-failed', message: 'git diff failed' }),
    ]),
  );

  const omitted = buildDocumentationChange(input(), { omitSourceDiff: true });
  expect(omitted.change.sourceDiffAvailable).toBe(true);
  expect(omitted.change.sourceDiff).toBeUndefined();
  expect(omitted.change.lines).toEqual({ added: 1, deleted: 1 });
});

test('uses the OpenAPI helper for contract files', () => {
  const result = buildDocumentationChange(
    input({
      path: 'docs/contracts/CONTRACT-PETS.yaml',
      oldContent: encode('openapi: 3.0.0\ninfo: {title: Pets, version: "1"}\npaths: {}\n'),
      newContent: encode('openapi: 3.0.0\ninfo: {title: Pets, version: "2"}\npaths: {}\n'),
    }),
  );

  expect(result.change.semanticDiffAvailable).toBe(true);
  expect(result.change.entitiesBefore[0]).toMatchObject({
    id: 'CONTRACT-PETS',
    type: 'contract',
  });
  expect(result.change.entitiesAfter[0]).toMatchObject({
    id: 'CONTRACT-PETS',
    type: 'contract',
  });
  expect(result.oldSide?.path).toBe('docs/contracts/CONTRACT-PETS.yaml');
  expect(result.newSide?.path).toBe('docs/contracts/CONTRACT-PETS.yaml');
});

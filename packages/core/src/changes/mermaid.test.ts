import { expect, test } from 'vitest';
import { parseMarkdown } from '../markdown/parse.js';
import { mermaidBlockDiff } from './mermaid.js';

function analysis(source: string) {
  return parseMarkdown(source).analysis;
}

test('matches stable IDs, reports added and removed blocks, and keeps captions and locations', () => {
  const oldSource = [
    '# Flow',
    '',
    '## Diagram',
    '',
    '```mermaid',
    '%% id: login',
    'flowchart LR',
    'A --> B',
    '```',
    '',
    '## Removed',
    '',
    '```mermaid',
    'flowchart TD',
    'A --> B',
    '```',
  ].join('\n');
  const newSource = [
    '# Flow',
    '',
    '## Diagram',
    '',
    '```mermaid',
    '%% id: login',
    'flowchart LR',
    'A --> C',
    '```',
    '',
    '```mermaid',
    'flowchart LR',
    'C --> D',
    '```',
  ].join('\n');

  const [changes, diagnostics] = mermaidBlockDiff(
    analysis(oldSource),
    analysis(newSource),
    'docs/flows/FLOW.md',
    'docs/flows/FLOW.md',
  );

  expect(diagnostics).toEqual([]);
  expect(changes).toEqual([
    expect.objectContaining({
      id: 'diagram-mermaid-2',
      status: 'added',
      caption: 'Diagram',
      after: expect.stringContaining('C --> D'),
    }),
    expect.objectContaining({
      id: 'id-login',
      status: 'modified',
      caption: 'Diagram',
      before: expect.stringContaining('A --> B'),
      after: expect.stringContaining('A --> C'),
      sourceBefore: { path: 'docs/flows/FLOW.md', line: 5 },
      sourceAfter: { path: 'docs/flows/FLOW.md', line: 5 },
    }),
    expect.objectContaining({
      id: 'removed-mermaid-1',
      status: 'removed',
      caption: 'Removed',
      before: expect.stringContaining('A --> B'),
    }),
  ]);
});

test('ignores whitespace-only Mermaid changes using Go-compatible Unicode whitespace', () => {
  const oldAnalysis = analysis('## Diagram\n\n```mermaid\nflowchart\u0085TD\nA --> B\n```');
  const newAnalysis = analysis('## Diagram\n\n```mermaid\nflowchart TD\nA --> B\n```');

  const [changes, diagnostics] = mermaidBlockDiff(
    oldAnalysis,
    newAnalysis,
    'docs/a.md',
    'docs/a.md',
  );

  expect(changes).toEqual([]);
  expect(diagnostics).toEqual([]);
});

test('warns about duplicate IDs and keeps source for invalid Mermaid sides', () => {
  const duplicateSource = [
    '## Diagram',
    '',
    '```mermaid',
    '%% id: duplicate',
    'flowchart TD',
    'A --> B',
    '```',
    '',
    '```mermaid',
    '%% id: duplicate',
    'flowchart TD',
    'B --> C',
    '```',
  ].join('\n');
  const [duplicateChanges, duplicateDiagnostics] = mermaidBlockDiff(
    analysis(duplicateSource),
    analysis(duplicateSource),
    'docs/a.md',
    'docs/a.md',
  );

  expect(duplicateChanges).toEqual([]);
  expect(duplicateDiagnostics).toEqual([
    expect.objectContaining({
      severity: 'warning',
      code: 'mermaid-block-match-ambiguous',
      documentPath: 'docs/a.md',
    }),
  ]);

  const [invalidChanges, invalidDiagnostics] = mermaidBlockDiff(
    analysis('## Diagram\n\n```mermaid\nnot-a-diagram\n```'),
    analysis('## Diagram\n\n```mermaid\nflowchart TD\nA --> B\n```'),
    'docs/a.md',
    'docs/a.md',
  );

  expect(invalidChanges).toEqual([
    expect.objectContaining({
      id: 'diagram-mermaid-1',
      status: 'modified',
      before: expect.stringContaining('not-a-diagram'),
      after: expect.stringContaining('flowchart TD'),
    }),
  ]);
  expect(invalidDiagnostics).toEqual([
    expect.objectContaining({
      severity: 'warning',
      code: 'mermaid-old-version-invalid',
      documentPath: 'docs/a.md',
      line: 3,
    }),
  ]);

  const [emptyChanges, emptyDiagnostics] = mermaidBlockDiff(
    analysis('## Diagram\n\n```mermaid\n\n```'),
    analysis('## Diagram\n\n```mermaid\nflowchart TD\nA --> B\n```'),
    'docs/a.md',
    'docs/a.md',
  );

  expect(emptyChanges).toEqual([
    expect.objectContaining({
      id: 'diagram-mermaid-1',
      sourceBefore: { path: 'docs/a.md', line: 3 },
      sourceAfter: { path: 'docs/a.md', line: 3 },
    }),
  ]);
  expect(emptyChanges[0]).not.toHaveProperty('before');
  expect(emptyDiagnostics).toEqual([
    expect.objectContaining({ code: 'mermaid-old-version-invalid', line: 3 }),
  ]);
});

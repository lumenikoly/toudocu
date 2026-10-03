import { expect, test } from 'vitest';
import { createDocument } from '../documents/document.js';
import { compileQuality } from './quality.js';

const now = new Date('2026-09-19T00:00:00Z');
const options = { now, staleDays: 90 };

function doc(sourcePath: string, content: string) {
  return createDocument({ sourcePath, content, modifiedAt: now }, options);
}

function standard(id: string, status = 'active', updated = '2026-09-01') {
  return doc(
    `quality/${id}.md`,
    `<!-- toudocu\nid: ${id}\nstatus: ${status}\nscope: TypeScript core\nupdated: ${updated}\n-->\n# ${id}: Core standard\n\n<!-- toudocu:section rules -->\n## Rules\n\nKeep the boundary small.\n\n<!-- toudocu:section automated-checks -->\n## Automated checks\n\nRun the tests.\n`,
  );
}

function runbook(
  id: string,
  procedure: string,
  metadata = 'status: active\nrisk: low\nenvironment: CI\nlastVerified: 2026-09-18',
) {
  return doc(
    `runbooks/${id}.md`,
    `<!-- toudocu\nid: ${id}\n${metadata}\n-->\n# ${id}: Deploy\n\n<!-- toudocu:section prerequisites -->\n## Prerequisites\n\nAccess is available.\n\n<!-- toudocu:section procedure -->\n## Procedure\n\n${procedure}\n\n<!-- toudocu:section verification -->\n## Verification\n\nCheck the service.\n\n<!-- toudocu:section rollback -->\n## Rollback\n\nRestore the previous release.\n`,
  );
}

test('quality preserves canonical standard metadata and validates replacements', () => {
  const result = compileQuality(
    [
      doc('quality/index.md', '# Quality\n'),
      standard('STD-Z-2'),
      standard('STD-A-1'),
      doc(
        'quality/STD-SUPERSEDED.md',
        '<!-- toudocu\nid: STD-SUPERSEDED\nstatus: superseded\nscope: legacy\nupdated: 2026-09-01\nsupersededBy: STD-A-1\n-->\n# STD-SUPERSEDED\n\n<!-- toudocu:section rules -->\n## Rules\n\nLegacy rules.\n\n<!-- toudocu:section automated-checks -->\n## Automated checks\n\nLegacy checks.\n',
      ),
    ],
    options,
  );
  expect(result.issues).toEqual([]);
  expect(result.standards.map((item) => item.id)).toEqual(['STD-A-1', 'STD-SUPERSEDED', 'STD-Z-2']);
  expect(result.standards[0]).toMatchObject({
    id: 'STD-A-1',
    status: { kind: 'in-progress', label: 'active' },
    scope: 'TypeScript core',
    updated: '2026-09-01',
    rules: 'Keep the boundary small.',
    automaticChecks: 'Run the tests.',
  });
});

test('quality requires numbered Procedure steps strictly inside the section', () => {
  const numbered = runbook('RB-OPS-NUMBERED', '1. Stop the rollout.\n2. Verify recovery.');
  const unnumbered = runbook(
    'RB-OPS-UNNUMBERED',
    'Explain the action in prose.\n\n## Outside\n\n1. This is not a Procedure step.',
  );
  const result = compileQuality([numbered, unnumbered], options);

  expect(result.runbooks.map((item) => item.id)).toEqual(['RB-OPS-NUMBERED', 'RB-OPS-UNNUMBERED']);
  expect(
    result.issues.filter((issue) => issue.code === 'runbook-procedure-not-numbered'),
  ).toHaveLength(1);
  expect(
    result.issues.find((issue) => issue.code === 'runbook-procedure-not-numbered')?.documentPath,
  ).toBe('runbooks/RB-OPS-UNNUMBERED.md');
});

test('quality freshness follows legacy boundary and review rules', () => {
  const result = compileQuality(
    [
      runbook(
        'RB-BOUNDARY',
        '1. Step.',
        'status: active\nrisk: low\nenvironment: CI\nlastVerified: 2026-06-21',
      ),
      runbook(
        'RB-OVERDUE',
        '1. Step.',
        'status: active\nrisk: low\nenvironment: CI\nlastVerified: 2026-06-20',
      ),
      runbook(
        'RB-FUTURE',
        '1. Step.',
        'status: active\nrisk: low\nenvironment: CI\nlastVerified: 2026-09-20',
      ),
      runbook(
        'RB-OBSOLETE',
        '1. Step.',
        'status: obsolete\nrisk: low\nenvironment: CI\nlastVerified: 2026-01-01',
      ),
    ],
    options,
  );
  expect(Object.fromEntries(result.runbooks.map((item) => [item.id, item.freshness]))).toEqual({
    'RB-BOUNDARY': 'recent',
    'RB-FUTURE': 'review-required',
    'RB-OBSOLETE': 'not-applicable',
    'RB-OVERDUE': 'overdue',
  });
});

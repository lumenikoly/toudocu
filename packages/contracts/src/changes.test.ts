import renameCapture from '../../../fixtures/expected/compatibility/changes-rename.json' with { type: 'json' };
import taskChangesCapture from '../../../fixtures/expected/compatibility/task-changes.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { ChangeSetReportV1Schema } from './changes.js';

function report(capture: { stdout: string }): unknown {
  return JSON.parse(capture.stdout);
}

test('accepts saved change report baselines, including task impact', () => {
  for (const capture of [renameCapture, taskChangesCapture]) {
    const value = report(capture);
    expect(ChangeSetReportV1Schema.parse(value)).toEqual(value);
  }
});

test('rejects the wrong schema version and unexpected top-level fields', () => {
  const value = report(renameCapture) as Record<string, unknown>;
  expect(ChangeSetReportV1Schema.safeParse({ ...value, schemaVersion: 2 }).success).toBe(false);
  expect(ChangeSetReportV1Schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
});

test('accepts a migration-gated report with null summary maps', () => {
  const value = ChangeSetReportV1Schema.parse(report(renameCapture));
  value.summary.entities = null;
  value.summary.classifications = null;

  expect(ChangeSetReportV1Schema.parse(value).summary).toEqual({
    ...value.summary,
    entities: null,
    classifications: null,
  });
});

test('accepts signed SVG dimensions emitted by the Go asset inspector', () => {
  const value = ChangeSetReportV1Schema.parse(report(renameCapture));
  value.changes[0]!.asset = {
    before: {
      mediaType: 'image/svg+xml',
      width: -1,
      height: -2,
    },
  };

  expect(ChangeSetReportV1Schema.parse(value).changes[0]!.asset).toEqual(value.changes[0]!.asset);
});

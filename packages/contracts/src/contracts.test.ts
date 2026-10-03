import searchCapture from '../../../fixtures/expected/compatibility/search.json' with { type: 'json' };
import contextCapture from '../../../fixtures/expected/compatibility/task-context.json' with { type: 'json' };
import projectCapture from '../../../fixtures/expected/compatibility/check.json' with { type: 'json' };
import readyCapture from '../../../fixtures/expected/compatibility/task-ready.json' with { type: 'json' };
import candidatesCapture from '../../../fixtures/expected/compatibility/task-candidates.json' with { type: 'json' };
import treeCapture from '../../../fixtures/expected/compatibility/task-tree.json' with { type: 'json' };
import verifyCapture from '../../../fixtures/expected/compatibility/task-verify-dry-run.json' with { type: 'json' };
import { expect, test } from 'vitest';
import { z } from 'zod';
import { IssueSchema } from './issue.js';
import { SearchReportV1Schema } from './search.js';
import { TaskContextReportV1Schema } from './context.js';
import { ProjectReportV1Schema } from './project.js';
import { TaskVerifyReportV1Schema } from './verification.js';
import {
  TaskReadyReportV1Schema,
  TaskCandidatesReportV1Schema,
  TaskTreeReportV1Schema,
} from './tasks.js';

test('runtime schemas accept legacy CLI reports without changing their payloads', () => {
  for (const [capture, schema] of [
    [contextCapture, TaskContextReportV1Schema],
    [projectCapture, ProjectReportV1Schema],
    [searchCapture, SearchReportV1Schema],
    [readyCapture, TaskReadyReportV1Schema],
    [candidatesCapture, TaskCandidatesReportV1Schema],
    [treeCapture, TaskTreeReportV1Schema],
    [verifyCapture, TaskVerifyReportV1Schema],
  ] as const) {
    // Rehydrate only the capture harness's temporal placeholders.
    const report: unknown = JSON.parse(
      capture.stdout
        .replaceAll('<TIMESTAMP>', '2026-09-19T00:00:00Z')
        .replaceAll('"<DURATION>"', '0'),
    );
    expect(schema.parse(report)).toEqual(report);
    expect(schema.safeParse({ ...(report as object), schemaVersion: 2 }).success).toBe(false);
    expect(schema.safeParse({ ...(report as object), unexpected: true }).success).toBe(false);
    expect(z.toJSONSchema(schema, { target: 'openapi-3.0' }).type).toBe('object');
  }
});

test('diagnostics preserve absent fields and reject invalid source positions', () => {
  const issue = { severity: 'error', code: 'broken-link', message: 'Missing target' };
  expect(IssueSchema.parse(issue)).toEqual(issue);
  expect(IssueSchema.safeParse({ ...issue, line: -1 }).success).toBe(false);
  expect(IssueSchema.safeParse({ ...issue, line: Number.NaN }).success).toBe(false);
  expect(IssueSchema.safeParse({ ...issue, line: null }).success).toBe(false);
  expect(IssueSchema.safeParse({ ...issue, line: 0 }).success).toBe(true);
});

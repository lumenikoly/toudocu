import { z } from 'zod';
import { GeneratorSchema, TaskRefSchema } from './common.js';
import { IssueSchema } from './issue.js';

const timestamp = z.iso.datetime({ offset: true });
export const CommandExecutionResultSchema = z.strictObject({
  sequence: z.int().nonnegative(),
  command: z.string(),
  targets: z.array(z.string()),
  status: z.string(),
  exitCode: z.int().nullable(),
  startedAt: timestamp,
  finishedAt: timestamp,
  durationMillis: z.int().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  stdoutTruncated: z.boolean(),
  stderrTruncated: z.boolean(),
});
export const TaskVerifyReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-verify'),
  generator: GeneratorSchema,
  task: TaskRefSchema,
  startedAt: timestamp,
  finishedAt: timestamp,
  durationMillis: z.int().nonnegative(),
  status: z.string(),
  mode: z.string(),
  target: z.string().exactOptional(),
  fullVerification: z.boolean(),
  validationIssues: z.array(IssueSchema),
  issues: z.array(IssueSchema),
  commands: z.array(CommandExecutionResultSchema),
  criteria: z.array(
    z.strictObject({
      id: z.string(),
      description: z.string(),
      documentCompleted: z.boolean(),
      status: z.string(),
    }),
  ),
  targets: z.array(z.strictObject({ target: z.string(), status: z.string() })),
  summary: z.strictObject({
    totalCommands: z.int().nonnegative(),
    passedCommands: z.int().nonnegative(),
    failedCommands: z.int().nonnegative(),
    timedOutCommands: z.int().nonnegative(),
    criteriaPassed: z.int().nonnegative(),
    criteriaFailed: z.int().nonnegative(),
  }),
});
export type TaskVerifyReportV1 = z.infer<typeof TaskVerifyReportV1Schema>;

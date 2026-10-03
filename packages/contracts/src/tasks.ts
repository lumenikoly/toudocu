import { z } from 'zod';
import { GeneratorSchema, TaskRefSchema } from './common.js';
import { IssueSchema } from './issue.js';

export const TaskDescendantsSummarySchema = z.strictObject({
  total: z.int().nonnegative(),
  counts: z.strictObject({
    draft: z.int().nonnegative(),
    readyCandidate: z.int().nonnegative(),
    ready: z.int().nonnegative(),
    waiting: z.int().nonnegative(),
    needsAttention: z.int().nonnegative(),
    inProgress: z.int().nonnegative(),
    blocked: z.int().nonnegative(),
    done: z.int().nonnegative(),
    cancelled: z.int().nonnegative(),
  }),
  started: z.boolean(),
  complete: z.boolean(),
});
export const TaskReadyReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-ready'),
  generator: GeneratorSchema,
  task: TaskRefSchema,
  status: z.string(),
  contractComplete: z.boolean(),
  readyForWork: z.boolean(),
  issues: z.array(IssueSchema),
});
export const TaskCandidateSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  workState: z.string(),
  descendants: TaskDescendantsSummarySchema.exactOptional(),
  priority: z.string().exactOptional(),
  parentId: z.string().exactOptional(),
  contractComplete: z.boolean(),
  dependenciesSatisfied: z.boolean(),
  readyForWork: z.boolean(),
  blockedBy: z.array(z.strictObject({ id: z.string(), status: z.string() })).nullable(),
  issues: z.array(IssueSchema),
});
export const TaskCandidatesReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-candidates'),
  generator: GeneratorSchema,
  parentTaskId: z.string().exactOptional(),
  candidates: z.array(TaskCandidateSchema),
});
export const TaskTreeNodeSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  workState: z.string(),
  descendants: TaskDescendantsSummarySchema.exactOptional(),
  title: z.string(),
  get children(): z.ZodArray<typeof TaskTreeNodeSchema> {
    return z.array(TaskTreeNodeSchema);
  },
});
export const TaskTreeReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-tree'),
  generator: GeneratorSchema,
  taskId: z.string(),
  tree: TaskTreeNodeSchema,
});
export const TaskMoveTaskSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: TaskRefSchema.shape.status,
  type: z.string().exactOptional(),
});
export const TaskMoveReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.enum(['task-archive', 'task-restore']),
  generator: GeneratorSchema,
  status: z.enum(['blocked', 'archived', 'restored']),
  task: TaskMoveTaskSchema,
  sourcePath: z.string().exactOptional(),
  destinationPath: z.string().exactOptional(),
  archiveYear: z.string().exactOptional(),
  issues: z.array(IssueSchema),
});
export type TaskReadyReportV1 = z.infer<typeof TaskReadyReportV1Schema>;
export type TaskCandidatesReportV1 = z.infer<typeof TaskCandidatesReportV1Schema>;
export type TaskTreeReportV1 = z.infer<typeof TaskTreeReportV1Schema>;
export type TaskMoveReportV1 = z.infer<typeof TaskMoveReportV1Schema>;

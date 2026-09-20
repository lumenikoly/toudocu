import { z } from 'zod';
import { GeneratorSchema } from './common.js';

export const TaskInitReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('task-init'),
  generator: GeneratorSchema,
  id: z.string(),
  title: z.string(),
  type: z.string(),
  language: z.string(),
  path: z.string(),
  parentId: z.string().nullable(),
});

export const ScaffoldReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('scaffold'),
  generator: GeneratorSchema,
  entityType: z.string(),
  id: z.string(),
  title: z.string(),
  language: z.string(),
  path: z.string(),
});

export type TaskInitReportV1 = z.infer<typeof TaskInitReportV1Schema>;
export type ScaffoldReportV1 = z.infer<typeof ScaffoldReportV1Schema>;

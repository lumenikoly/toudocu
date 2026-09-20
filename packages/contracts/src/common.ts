import { z } from 'zod';

export const SourcePositionSchema = z.strictObject({
  offset: z.int().nonnegative(),
  line: z.int().positive(),
  column: z.int().positive(),
});
export const SourceRangeSchema = z.strictObject({
  start: SourcePositionSchema,
  end: SourcePositionSchema,
});
export type SourceRange = z.infer<typeof SourceRangeSchema>;

export const GeneratorSchema = z.strictObject({ name: z.string(), version: z.string() });
export const StatusSchema = z.strictObject({
  kind: z.string(),
  symbol: z.string(),
  label: z.string(),
  recognized: z.boolean(),
});
export const TaskStatsSchema = z.strictObject({
  total: z.int().nonnegative(),
  completed: z.int().nonnegative(),
  remaining: z.int().nonnegative(),
  percent: z.number().min(0).max(100).nullable(),
});
export const TaskRefSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: StatusSchema,
  type: z.string().exactOptional(),
  document: z.string(),
});

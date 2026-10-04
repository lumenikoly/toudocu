import { z } from 'zod';

/** Version-one public diagnostic fields; omit unavailable locations. */
export const IssueSchema = z.strictObject({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  migration: z.string().exactOptional(),
  documentPath: z.string().exactOptional(),
  line: z.int().nonnegative().exactOptional(),
  column: z.int().nonnegative().exactOptional(),
  taskId: z.string().exactOptional(),
  relatedId: z.string().exactOptional(),
});
export type Issue = z.infer<typeof IssueSchema>;

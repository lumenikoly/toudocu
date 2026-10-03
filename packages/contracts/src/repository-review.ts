import { z } from 'zod';

export const RepositoryReviewQuerySchema = z.strictObject({
  base: z.string().max(512).exactOptional(),
  branchBase: z.string().max(512).exactOptional(),
  target: z.string().max(512).exactOptional(),
});

export const RepositoryFilesQuerySchema = RepositoryReviewQuerySchema.extend({
  q: z.string().max(512).exactOptional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const RepositoryFileQuerySchema = RepositoryReviewQuerySchema.extend({
  path: z.string().min(1).max(4096),
  oldPath: z.string().min(1).max(4096).exactOptional(),
});

export const RepositoryFileListSchema = z.strictObject({
  schemaVersion: z.literal(1),
  files: z.array(z.strictObject({ path: z.string() })),
  truncated: z.boolean(),
});

const RepositoryFileSideSchema = z.strictObject({
  path: z.string(),
  available: z.boolean(),
  binary: z.boolean(),
  tooLarge: z.boolean(),
  size: z.int().nonnegative(),
  content: z.string().exactOptional(),
});

export const RepositoryFileResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  before: RepositoryFileSideSchema,
  current: RepositoryFileSideSchema,
});

export type RepositoryFilesQuery = z.infer<typeof RepositoryFilesQuerySchema>;
export type RepositoryFileQuery = z.infer<typeof RepositoryFileQuerySchema>;
export type RepositoryFileList = z.infer<typeof RepositoryFileListSchema>;
export type RepositoryFileResponse = z.infer<typeof RepositoryFileResponseSchema>;

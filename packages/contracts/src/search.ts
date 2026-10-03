import { z } from 'zod';
import { GeneratorSchema } from './common.js';

export const SearchMatchSchema = z.strictObject({
  id: z.string().exactOptional(),
  type: z.string(),
  title: z.string(),
  path: z.string(),
  archived: z.boolean(),
  archiveYear: z.string().exactOptional(),
  matchedSections: z.array(z.string()),
});
export const SearchReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal('search'),
  generator: GeneratorSchema,
  query: z.string(),
  total: z.int().nonnegative(),
  limit: z.int(),
  results: z.array(SearchMatchSchema),
});
export type SearchReportV1 = z.infer<typeof SearchReportV1Schema>;

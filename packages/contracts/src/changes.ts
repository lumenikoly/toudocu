import { z } from 'zod';
import { IssueSchema } from './issue.js';

const count = z.int().nonnegative();
const optionalString = z.string().exactOptional();

const ChangeRepositorySchema = z.strictObject({
  root: z.string(),
  branch: optionalString,
  head: optionalString,
  dirty: z.boolean(),
});

const ChangeSideSchema = z.strictObject({
  type: z.string(),
  revision: optionalString,
  resolved: optionalString,
  displayRef: optionalString,
});

const ChangeComparisonSchema = z.strictObject({
  base: ChangeSideSchema,
  target: ChangeSideSchema,
});

const ChangeFileSummarySchema = z.strictObject({
  added: count,
  modified: count,
  deleted: count,
  renamed: count,
  copied: count,
  typeChanged: count,
  untracked: count,
});

const ChangeLineStatsSchema = z.strictObject({
  added: count,
  deleted: count,
});

const ChangeSummarySchema = z.strictObject({
  files: ChangeFileSummarySchema,
  lines: ChangeLineStatsSchema,
  entities: z.record(z.string(), count).nullable(),
  classifications: z.record(z.string(), count).nullable(),
});

const ChangeGitStateSchema = z.strictObject({
  staged: z.boolean(),
  unstaged: z.boolean(),
  untracked: z.boolean(),
  committedInBranch: z.boolean().exactOptional(),
});

const ChangeEntitySchema = z.strictObject({
  id: optionalString,
  type: z.string(),
  title: optionalString,
});

const ChangeLocationSchema = z.strictObject({
  path: z.string(),
  line: count.exactOptional(),
});

const SourceDiffHunkSchema = z.strictObject({
  id: z.string(),
  header: z.string(),
  oldStart: count,
  oldLines: count,
  newStart: count,
  newLines: count,
  patch: z.string(),
});

const RenderedSectionChangeSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  titleBefore: optionalString,
  titleAfter: optionalString,
  anchorBefore: optionalString,
  anchorAfter: optionalString,
  sourceBefore: ChangeLocationSchema.exactOptional(),
  sourceAfter: ChangeLocationSchema.exactOptional(),
});

const MermaidBlockChangeSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  caption: optionalString,
  before: optionalString,
  after: optionalString,
  sourceBefore: ChangeLocationSchema.exactOptional(),
  sourceAfter: ChangeLocationSchema.exactOptional(),
});

const AssetMetadataSchema = z.strictObject({
  mediaType: z.string(),
  width: z.int().exactOptional(),
  height: z.int().exactOptional(),
  aspectRatio: z.number().exactOptional(),
  transparency: z.boolean().exactOptional(),
});

const AssetDiffMetadataSchema = z.strictObject({
  before: AssetMetadataSchema.exactOptional(),
  after: AssetMetadataSchema.exactOptional(),
});

const ScreenNodeSnapshotSchema = z.strictObject({
  id: z.string(),
  title: optionalString,
  route: optionalString,
  module: optionalString,
  status: optionalString,
  type: optionalString,
});

const ScreenTransitionSnapshotSchema = z.strictObject({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  action: optionalString,
  condition: optionalString,
  state: optionalString,
  error: optionalString,
  useCase: optionalString,
  line: count.exactOptional(),
});

const ScreenTransitionChangeSchema = z.strictObject({
  id: z.string(),
  status: z.string(),
  before: ScreenTransitionSnapshotSchema.exactOptional(),
  after: ScreenTransitionSnapshotSchema.exactOptional(),
});

const ScreenDiffMetadataSchema = z.strictObject({
  before: ScreenNodeSnapshotSchema.exactOptional(),
  after: ScreenNodeSnapshotSchema.exactOptional(),
  transitions: z.array(ScreenTransitionChangeSchema),
});

const SemanticChangeSchema = z.strictObject({
  kind: z.string(),
  entity: ChangeEntitySchema,
  subject: ChangeEntitySchema.exactOptional(),
  field: optionalString,
  before: z.unknown().exactOptional(),
  after: z.unknown().exactOptional(),
  summary: z.string(),
  sourceBefore: ChangeLocationSchema.exactOptional(),
  sourceAfter: ChangeLocationSchema.exactOptional(),
  compatibility: optionalString,
});

const RelationChangeSchema = z.strictObject({
  kind: z.string(),
  source: ChangeEntitySchema,
  target: ChangeEntitySchema,
});

const DocumentationChangeSchema = z.strictObject({
  status: z.string(),
  path: z.string(),
  oldPath: optionalString,
  gitState: ChangeGitStateSchema,
  lines: ChangeLineStatsSchema,
  binary: z.boolean(),
  oldSize: count.exactOptional(),
  newSize: count.exactOptional(),
  classification: z.string(),
  entitiesBefore: z.array(ChangeEntitySchema),
  entitiesAfter: z.array(ChangeEntitySchema),
  sourceDiffAvailable: z.boolean(),
  renderedDiffAvailable: z.boolean(),
  semanticDiffAvailable: z.boolean(),
  sourceDiff: optionalString,
  renderedBefore: optionalString,
  renderedAfter: optionalString,
  sourceDiffHunks: z.array(SourceDiffHunkSchema),
  renderedSections: z.array(RenderedSectionChangeSchema),
  mermaidBlocks: z.array(MermaidBlockChangeSchema),
  asset: AssetDiffMetadataSchema.exactOptional(),
  screen: ScreenDiffMetadataSchema.exactOptional(),
  semanticChanges: z.array(SemanticChangeSchema),
  relationChanges: z.array(RelationChangeSchema),
  diagnostics: z.array(IssueSchema),
});

const TaskImpactEntrySchema = z.strictObject({
  path: z.string(),
  declared: z.boolean(),
  changed: z.boolean(),
  created: z.boolean().exactOptional(),
  declaredBy: z.array(z.string()).exactOptional(),
});

const TaskImpactReportSchema = z.strictObject({
  taskId: z.string(),
  declared: z.array(TaskImpactEntrySchema),
  actual: z.array(TaskImpactEntrySchema),
  taskChanges: z.array(DocumentationChangeSchema),
  diagnostics: z.array(IssueSchema),
});

export const ChangeSetReportV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  repository: ChangeRepositorySchema,
  comparison: ChangeComparisonSchema,
  changeSetDigest: z.string(),
  summary: ChangeSummarySchema,
  changes: z.array(DocumentationChangeSchema),
  taskImpact: TaskImpactReportSchema.exactOptional(),
  diagnostics: z.array(IssueSchema),
});

export type ChangeSetReportV1 = z.infer<typeof ChangeSetReportV1Schema>;

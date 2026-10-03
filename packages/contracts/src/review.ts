import { z } from 'zod';

const timestamp = z.string();
const humanIntent = z
  .enum(['question', 'change_request', 'change'])
  .transform((intent) => (intent === 'change' ? 'change_request' : intent));

export const ReviewPositionSchema = z.strictObject({
  line: z.int().positive(),
  column: z.int().positive(),
});

export const ReviewRangeSchema = z.strictObject({
  start: ReviewPositionSchema,
  end: ReviewPositionSchema,
});

export const AgentEvidenceSchema = z.strictObject({
  path: z.string(),
  startLine: z.int().nonnegative().exactOptional(),
  endLine: z.int().nonnegative().exactOptional(),
});

export const AgentResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  deliveryId: z.string(),
  discussionId: z.string(),
  outcome: z.enum(['answered', 'changed', 'no_change', 'needs_clarification', 'failed']),
  message: z.string(),
  evidence: z.array(AgentEvidenceSchema).exactOptional(),
  changedPaths: z.array(z.string()).exactOptional(),
});

const ReviewTargetSchema = z.strictObject({
  kind: z.string(),
  path: z.string(),
  documentId: z.string().exactOptional(),
  range: ReviewRangeSchema.nullable().exactOptional(),
});

export const ReviewMutationGuardSchema = z.strictObject({
  expectedRevision: z.int().nonnegative(),
  expectedStateDigest: z.string(),
});

export const CreateDiscussionRequestSchema = ReviewMutationGuardSchema.extend({
  target: ReviewTargetSchema,
  selection: z
    .strictObject({ selectedText: z.string(), occurrence: z.int().nonnegative().exactOptional() })
    .exactOptional(),
  intent: humanIntent,
  text: z
    .string()
    .min(1)
    .max(64 * 1024),
});

export const CreateReviewMessageRequestSchema = ReviewMutationGuardSchema.extend({
  intent: humanIntent,
  text: z
    .string()
    .min(1)
    .max(64 * 1024),
});

export const UpdateDiscussionRequestSchema = ReviewMutationGuardSchema.extend({
  state: z.enum(['open', 'resolved']),
});

export const UpdateReviewMessageRequestSchema = CreateReviewMessageRequestSchema;

const DocumentAnchorSchema = z.strictObject({
  kind: z.string(),
  path: z.string(),
  documentId: z.string().exactOptional(),
  sourceDigest: z.string(),
  range: ReviewRangeSchema.nullable().exactOptional(),
  selectedText: z.string().exactOptional(),
  contextBefore: z.string().exactOptional(),
  contextAfter: z.string().exactOptional(),
});

const AnchorPlacementSchema = z.strictObject({
  status: z.string(),
  path: z.string(),
  range: ReviewRangeSchema.nullable().exactOptional(),
  reason: z.string().exactOptional(),
});

const ReviewMessageSchema = z.strictObject({
  id: z.string(),
  author: z.string(),
  intent: z.string().exactOptional(),
  state: z.string().exactOptional(),
  text: z.string(),
  deliveryId: z.string().exactOptional(),
  outcome: z.string().exactOptional(),
  evidence: z.array(AgentEvidenceSchema),
  changedPaths: z.array(z.string()),
  createdAt: timestamp,
  editedAt: timestamp.nullable().exactOptional(),
  submittedAt: timestamp.nullable().exactOptional(),
});

const DiscussionSchema = z.strictObject({
  id: z.string(),
  state: z.enum(['open', 'resolved']),
  target: ReviewTargetSchema,
  anchor: DocumentAnchorSchema.nullable().exactOptional(),
  placement: AnchorPlacementSchema,
  messages: z.array(ReviewMessageSchema),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const ReviewSessionSchema = z.strictObject({
  id: z.string(),
  createdAt: timestamp,
  discussions: z.array(DiscussionSchema),
});

const AgentDeliverySchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string(),
  sequence: z.int().nonnegative(),
  state: z.enum(['pending', 'claimed', 'responded']),
  discussionId: z.string(),
  messageIds: z.array(z.string()),
  createdAt: timestamp,
  claimedAt: timestamp.nullable().exactOptional(),
  leaseExpiresAt: timestamp.nullable().exactOptional(),
  respondedAt: timestamp.nullable().exactOptional(),
  responseDigest: z.string().exactOptional(),
});

export const ReviewStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  storeVersion: z.literal(1).exactOptional(),
  revision: z.int().nonnegative(),
  stateDigest: z.string(),
  repositoryRevision: z.string().exactOptional(),
  docsPath: z.string().exactOptional(),
  nextSequence: z.int().nonnegative().exactOptional(),
  session: ReviewSessionSchema.nullable().exactOptional(),
  deliveries: z.array(AgentDeliverySchema),
});

export const AgentRequestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pending: z.boolean(),
  deliveryId: z.string().exactOptional(),
  discussion: z.record(z.string(), z.unknown()).exactOptional(),
  target: z.record(z.string(), z.unknown()).exactOptional(),
  repository: z.strictObject({ head: z.string() }).exactOptional(),
  pendingCount: z.int().nonnegative().exactOptional(),
  hasMore: z.boolean().exactOptional(),
});

export const AgentResponseAckSchema = z.strictObject({
  schemaVersion: z.literal(1),
  accepted: z.literal(true),
  revision: z.int().nonnegative(),
  stateDigest: z.string(),
});

export type AgentEvidence = z.infer<typeof AgentEvidenceSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type ReviewState = z.infer<typeof ReviewStateSchema>;
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentResponseAck = z.infer<typeof AgentResponseAckSchema>;
export type CreateDiscussionRequest = z.infer<typeof CreateDiscussionRequestSchema>;
export type CreateReviewMessageRequest = z.infer<typeof CreateReviewMessageRequestSchema>;
export type UpdateDiscussionRequest = z.infer<typeof UpdateDiscussionRequestSchema>;
export type ReviewMutationGuard = z.infer<typeof ReviewMutationGuardSchema>;
export type UpdateReviewMessageRequest = z.infer<typeof UpdateReviewMessageRequestSchema>;

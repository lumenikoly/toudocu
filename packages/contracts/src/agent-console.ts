import { z } from 'zod';

const nonEmpty = z.string().min(1);

export const AgentCapabilitiesSchema = z.strictObject({
  steering: z.boolean(),
  interrupt: z.boolean(),
  approvals: z.boolean(),
  readOnlyTurns: z.boolean(),
});

export const AgentLaunchSchema = z.strictObject({
  cwd: nonEmpty,
  taskID: z.string().optional(),
  preset: z.enum(['default', 'full-access']),
  provider: nonEmpty,
  model: z.string().optional(),
  effort: z.string().optional(),
});

export const AgentSettingsSchema = z.strictObject({
  launch: AgentLaunchSchema,
  effectiveAccess: z.strictObject({ known: z.boolean(), unrestricted: z.boolean() }),
  capabilities: AgentCapabilitiesSchema,
});

export const AgentPendingMessageSchema = z.strictObject({
  id: nonEmpty,
  text: z.string().max(65_536),
  state: z.enum(['queued', 'not-sent']),
  reason: z.string(),
  position: z.number().int().positive(),
  notSent: z.boolean(),
  policy: z.enum(['normal', 'filesystem-read-only']),
});

export const AgentApprovalSchema = z.strictObject({
  requestID: nonEmpty,
  kind: nonEmpty,
  reason: z.string(),
});

export const AgentModelSchema = z.strictObject({
  id: nonEmpty,
  displayName: nonEmpty,
  description: z.string(),
  supportedReasoningEfforts: z.array(
    z.strictObject({ reasoningEffort: nonEmpty, description: z.string() }),
  ),
  defaultReasoningEffort: z.string(),
  isDefault: z.boolean(),
});

export const AgentPreferenceSchema = z.strictObject({
  launchPreset: z.enum(['default', 'full-access']),
  model: z.string().max(128).optional(),
  effort: z.string().max(128).optional(),
});

export const AgentThreadSchema = z.strictObject({
  id: nonEmpty.max(4096),
  preview: z.string(),
  name: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const AgentEventSchema = z.strictObject({
  type: z.enum([
    'session_started',
    'turn_started',
    'turn_completed',
    'user_message',
    'message_delta',
    'command_started',
    'command_output',
    'command_finished',
    'files_changed',
    'approval',
    'error',
  ]),
  threadID: z.string().optional(),
  turnID: z.string().optional(),
  itemID: z.string().optional(),
  text: z.string().optional(),
  command: z.string().optional(),
  cwd: z.string().optional(),
  status: z.string().optional(),
  exitCode: z.number().int().optional(),
  durationMillis: z.number().int().nonnegative().optional(),
  approvalState: z.string().optional(),
  truncated: z.boolean().optional(),
  approval: AgentApprovalSchema.optional(),
});

export const AgentSessionStateSchema = z.strictObject({
  active: z.boolean(),
  status: z.enum(['idle', 'running', 'stopping', 'failed']).optional(),
  activeTurn: z.string().optional(),
  pending: z.array(AgentPendingMessageSchema).optional(),
  approvals: z.array(AgentApprovalSchema).optional(),
  failure: z.string().optional(),
  settings: AgentSettingsSchema.optional(),
  terminal: z.strictObject({
    available: z.boolean(),
    active: z.boolean(),
    failure: z.string().optional(),
  }),
});

export const AgentConsoleStateSchema = z.strictObject({
  schemaVersion: z.literal(1),
  setup: z.strictObject({
    availableProviders: z.array(nonEmpty).min(1),
    selectedProvider: nonEmpty,
    preference: AgentPreferenceSchema,
    models: z.array(AgentModelSchema).optional(),
    skill: z.strictObject({
      state: z.string(),
      diagnostic: z.string(),
      command: z.string().optional(),
    }),
  }),
  state: AgentSessionStateSchema,
});

export const AgentConsoleInputSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('message'),
    text: z.string().min(1).max(65_536),
    policy: z.enum(['normal', 'filesystem-read-only']).optional(),
  }),
  z.strictObject({ action: z.literal('interrupt') }),
  z.strictObject({
    action: z.literal('approval'),
    requestID: nonEmpty,
    decision: z.enum(['accept', 'decline', 'cancel']),
  }),
  z.strictObject({ action: z.literal('terminal-input'), text: z.string().max(65_536) }),
  z.strictObject({
    action: z.literal('terminal-resize'),
    columns: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(500),
  }),
  z.strictObject({ action: z.literal('terminal-interrupt') }),
]);

export const AgentConsoleMessageSchema = z.strictObject({
  sequence: z.number().int().positive(),
  kind: z.enum(['event', 'state', 'replay_gap', 'terminal']),
  event: AgentEventSchema.optional(),
  state: AgentSessionStateSchema.optional(),
  replayGap: z.strictObject({ after: z.number().int(), before: z.number().int() }).optional(),
  terminal: z
    .strictObject({ type: z.enum(['output', 'exit']), data: z.string().optional() })
    .optional(),
});

export type AgentCapabilities = z.infer<typeof AgentCapabilitiesSchema>;
export type AgentLaunch = z.infer<typeof AgentLaunchSchema>;
export type AgentSettings = z.infer<typeof AgentSettingsSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentSessionState = z.infer<typeof AgentSessionStateSchema>;
export type AgentConsoleState = z.infer<typeof AgentConsoleStateSchema>;
export type AgentConsoleInput = z.infer<typeof AgentConsoleInputSchema>;
export type AgentConsoleMessage = z.infer<typeof AgentConsoleMessageSchema>;
export type AgentModel = z.infer<typeof AgentModelSchema>;
export type AgentPreference = z.infer<typeof AgentPreferenceSchema>;
export type AgentThread = z.infer<typeof AgentThreadSchema>;

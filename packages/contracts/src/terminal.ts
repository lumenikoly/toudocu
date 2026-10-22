import { z } from 'zod';

export const TerminalStateSchema = z.strictObject({
  available: z.boolean(),
  active: z.boolean(),
  failure: z.string().optional(),
});
export const TerminalInputSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('terminal-input'), text: z.string().max(65_536) }),
  z.strictObject({
    action: z.literal('terminal-resize'),
    columns: z.number().int().min(2).max(500),
    rows: z.number().int().min(2).max(500),
  }),
  z.strictObject({ action: z.literal('terminal-interrupt') }),
]);
export const TerminalEventSchema = z.strictObject({
  type: z.enum(['output', 'exit']),
  data: z.string().optional(),
});
export const TerminalMessageSchema = z.strictObject({
  sequence: z.number().int().positive(),
  kind: z.enum(['state', 'replay_gap', 'terminal']),
  state: TerminalStateSchema.optional(),
  replayGap: z.strictObject({ after: z.number().int(), before: z.number().int() }).optional(),
  terminal: TerminalEventSchema.optional(),
});
export type TerminalState = z.infer<typeof TerminalStateSchema>;
export type TerminalEvent = z.infer<typeof TerminalEventSchema>;
export type TerminalInput = z.infer<typeof TerminalInputSchema>;
export type TerminalMessage = z.infer<typeof TerminalMessageSchema>;

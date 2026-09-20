import { z } from 'zod';

export const SkillOperationSchema = z.enum(['install', 'status', 'update', 'uninstall']);
export const SkillScopeSchema = z.enum(['project', 'user']);
export const SkillStateSchema = z.enum([
  'not-installed',
  'installed',
  'outdated',
  'newer-than-bundle',
  'modified',
  'unmanaged',
  'invalid-manifest',
  'unsafe-path',
]);
export const SkillFileChecksumSchema = z.strictObject({
  path: z.string(),
  sha256: z.string(),
});

export const SkillManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  managedBy: z.literal('toudocu'),
  skillId: z.string(),
  skillVersion: z.string(),
  cliVersion: z.string(),
  agent: z.string(),
  scope: SkillScopeSchema,
  bundleChecksum: z.string(),
  files: z.array(SkillFileChecksumSchema),
});

export type SkillOperation = z.infer<typeof SkillOperationSchema>;
export type SkillScope = z.infer<typeof SkillScopeSchema>;
export type SkillState = z.infer<typeof SkillStateSchema>;
export type SkillFileChecksum = z.infer<typeof SkillFileChecksumSchema>;
export type SkillManifest = z.infer<typeof SkillManifestSchema>;

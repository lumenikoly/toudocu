import { z } from 'zod';

export const ServeInstanceIdentityV1Schema = z.strictObject({
  instanceId: z.uuid(),
  projectRoot: z.string().min(1),
  documentationRoot: z.string().min(1),
});
export type ServeInstanceIdentityV1 = z.infer<typeof ServeInstanceIdentityV1Schema>;

export const ProjectWorkspaceV1Schema = ServeInstanceIdentityV1Schema.extend({
  url: z
    .url({ protocol: /^http$/ })
    .regex(
      /^http:\/\/[^/?#@\\]+\/?$/,
      'Expected an HTTP origin without credentials, path, query, or fragment.',
    ),
});
export type ProjectWorkspaceV1 = z.infer<typeof ProjectWorkspaceV1Schema>;

export const ProjectInfoV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  projectRoot: z.string().min(1),
  documentationRoot: z.string().min(1),
  configPath: z.string().min(1),
  project: z.strictObject({ id: z.string().min(1), title: z.string().min(1) }),
  workspace: ProjectWorkspaceV1Schema.nullable().optional(),
});
export type ProjectInfoV1 = z.infer<typeof ProjectInfoV1Schema>;

export const ToudocuCapabilitiesV1Schema = z.strictObject({
  schemaVersion: z.literal(1),
  version: z.string().min(1),
  cliContractVersion: z.int().positive(),
  capabilities: z.array(z.string()),
});
export type ToudocuCapabilitiesV1 = z.infer<typeof ToudocuCapabilitiesV1Schema>;

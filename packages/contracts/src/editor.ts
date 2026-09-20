import { z } from 'zod';

const diagnostic = z.strictObject({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  path: z.string(),
  line: z.int().nonnegative(),
  column: z.int().nonnegative(),
});

const fileSummary = z.strictObject({
  path: z.string(),
  language: z.enum(['markdown', 'yaml', 'json']),
  size: z.int().nonnegative(),
  digest: z.string(),
  title: z.string().exactOptional(),
  documentURL: z.string().exactOptional(),
});

export const EditorFileSchema = fileSummary.extend({
  content: z.string(),
  diagnostics: z.array(diagnostic),
});

const templateField = z.strictObject({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'select']),
  required: z.boolean(),
  options: z.array(z.string()).exactOptional(),
});

export const EditorTemplateSchema = z.strictObject({
  key: z.enum([
    'task-init',
    'module',
    'use-case',
    'flow',
    'screen',
    'decision',
    'standard',
    'runbook',
    'draft',
  ]),
  label: z.string(),
  fields: z.array(templateField),
  languages: z.array(z.enum(['ru', 'en'])),
});

export const EditorFileListSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.string(),
  files: z.array(fileSummary),
  templates: z.array(EditorTemplateSchema),
});

export const EditorFileResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: z.string(),
  file: EditorFileSchema,
});

const rebuild = z.strictObject({
  documents: z.int().nonnegative(),
  pages: z.int().nonnegative(),
  warnings: z.int().nonnegative(),
  errors: z.int().nonnegative(),
});

export const EditorSavedFileResponseSchema = EditorFileResponseSchema.extend({ rebuild });

export const EditorContentRequestSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string().max(2 * 1024 * 1024),
});

export const EditorSaveRequestSchema = EditorContentRequestSchema.extend({
  expectedDigest: z.string(),
  confirmOverwrite: z.boolean(),
});

export const EditorCreateRequestSchema = z.strictObject({
  template: EditorTemplateSchema.shape.key,
  language: z.enum(['ru', 'en']),
  fields: z.record(z.string(), z.string()),
});

export const EditorPreviewResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  path: z.string(),
  html: z.string(),
  diagnostics: z.array(diagnostic),
});

export const EditorValidationResponseSchema = EditorPreviewResponseSchema.omit({ html: true });

export type EditorFile = z.infer<typeof EditorFileSchema>;
export type EditorFileList = z.infer<typeof EditorFileListSchema>;
export type EditorFileResponse = z.infer<typeof EditorFileResponseSchema>;
export type EditorSavedFileResponse = z.infer<typeof EditorSavedFileResponseSchema>;
export type EditorContentRequest = z.infer<typeof EditorContentRequestSchema>;
export type EditorSaveRequest = z.infer<typeof EditorSaveRequestSchema>;
export type EditorCreateRequest = z.infer<typeof EditorCreateRequestSchema>;
export type EditorPreviewResponse = z.infer<typeof EditorPreviewResponseSchema>;
export type EditorValidationResponse = z.infer<typeof EditorValidationResponseSchema>;

import type { CompiledProject } from '@toudocu/core';
import {
  EditorPreviewResponseSchema,
  EditorValidationResponseSchema,
  type EditorPreviewResponse,
  type EditorValidationResponse,
  type Issue,
} from '@toudocu/contracts';

function diagnostics(project: CompiledProject, path: string) {
  return project.issues
    .filter((issue) => !issue.documentPath || issue.documentPath === path)
    .map((issue: Issue) => ({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
      path: issue.documentPath ?? path,
      line: issue.line ?? 0,
      column: issue.column ?? 0,
    }));
}

export function previewEditorDocument(
  project: CompiledProject,
  path: string,
): EditorPreviewResponse {
  const document = project.index.byPath.get(path);
  if (!document) throw new Error(`Markdown document not found: ${path}`);
  return EditorPreviewResponseSchema.parse({
    schemaVersion: 1,
    path,
    html: document.markdown.render(),
    diagnostics: diagnostics(project, path),
  });
}

export function validateEditorDocument(
  project: CompiledProject,
  path: string,
): EditorValidationResponse {
  return EditorValidationResponseSchema.parse({
    schemaVersion: 1,
    path,
    diagnostics: diagnostics(project, path),
  });
}

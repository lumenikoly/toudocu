export { parseMarkdown, normalizeMarkdown } from './markdown/parse.js';
export type { MarkdownDocument } from './markdown/parse.js';
export type { MarkdownAnalysis } from './markdown/model.js';
export { checkMermaid } from './markdown/mermaid.js';
export {
  parseSiteConfig,
  defaultSiteConfig,
  normalizeLocale,
  documentationVersion,
  documentationVersionDiagnostic,
  sectionTypes,
} from './config/config.js';
export type { SiteConfig, LocaleProfile, SectionType } from './config/config.js';
export {
  createDocument,
  classifyDocument,
  statusFor,
  outputPathForDocument,
} from './documents/document.js';
export type { Document, DocumentSource, DocumentOptions } from './documents/document.js';
export { buildDocumentIndex, canonicalText, naturalCompare } from './documents/project.js';
export type { DocumentIndex } from './documents/project.js';
export { validateDocumentBasics } from './documents/validate.js';
export { resolveDocumentLinks, resolveLinks } from './documents/links.js';
export type { LinkResolutionOptions, ResolvedLink } from './documents/links.js';
export { parseOpenAPIContract, validateOpenAPIContract } from './openapi/openapi.js';
export type { OpenAPIContract, OpenAPIDiagnostic, OpenAPIParseResult } from './openapi/openapi.js';
export { compileProject, compileDocumentIndex } from './knowledge/compile.js';
export type { CompiledProject, CompilationOptions } from './knowledge/compile.js';
export { buildProjectSummary } from './knowledge/summary.js';
export {
  findWorkItem,
  taskReadiness,
  taskRelatedDocumentPaths,
  readinessIssue,
  blockingReadinessIssues,
} from './tasks/readiness.js';
export type { DocumentationPathStatus } from './tasks/readiness.js';
export type { WorkItem } from './tasks/work-items.js';
export { buildSkillPlan, deduplicateSkillTargets } from './skills/planner.js';
export type {
  SkillBundleMetadata,
  SkillPlan,
  SkillPlanInput,
  SkillSnapshot,
  SkillTarget,
} from './skills/planner.js';
export { renderScaffold, renderTaskInit } from './tasks/scaffold.js';
export type {
  ScaffoldInput,
  ScaffoldRender,
  ScaffoldSourceEntry,
  TaskInitInput,
  TaskInitRender,
} from './tasks/scaffold.js';
export { parseSourceDiffHunks, countPatchLines, classifyChangePath } from './changes/patch.js';
export { addChangeSummary, coalesceEntityRenames } from './changes/aggregate.js';
export {
  buildTaskImpact,
  declaredTaskDocumentation,
  normalizeTaskDocumentationPath,
  pathMatchesTaskScope,
  taskScopePaths,
} from './changes/task-impact.js';
export type { TaskImpactOptions, TaskImpactTask } from './changes/task-impact.js';
export { mermaidBlockDiff } from './changes/mermaid.js';
export { renderedSectionDiff } from './changes/sections.js';
export { buildScreenDiffMetadata, buildScreenDiffFromSnapshots } from './changes/screen.js';
export type {
  ScreenDiffMetadata,
  ScreenNodeSnapshot,
  ScreenTransitionSnapshot,
} from './changes/screen.js';
export { buildDocumentationChange } from './changes/document-change.js';
export type {
  DocumentChangeInput,
  DocumentChangeOptions,
  DocumentChangeResult,
} from './changes/document-change.js';

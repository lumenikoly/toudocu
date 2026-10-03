import type { Issue } from '@toudocu/contracts';
import {
  createDocument,
  statusFor,
  type Document,
  type DocumentOptions,
  type DocumentSource,
} from '../documents/document.js';
import { buildDocumentIndex, naturalCompare, type DocumentIndex } from '../documents/project.js';
import {
  connectUseCasesAndModules,
  resolveLinks,
  type LinkResolutionOptions,
} from '../documents/links.js';
import { parseOpenAPIContract } from '../openapi/openapi.js';
import { compileScreens, type ScreenCompileOptions } from '../screens/screens.js';
import { compileWorkItems, type RepositoryInventory } from '../tasks/work-items.js';
import { compileBaseKnowledge, uniqueStrings } from './entities.js';
import { compileQuality } from './quality.js';
import { compileRoadmap } from './roadmap.js';
import { validateRelationships } from './relationships.js';
import type { LocaleProfile } from '../config/config.js';

export interface CompilationOptions extends DocumentOptions {
  links: LinkResolutionOptions;
  repository: RepositoryInventory;
  projectChangelog?: DocumentSource;
  projectChangelogTitle?: string;
  screens?: Pick<ScreenCompileOptions, 'assets' | 'hotspots'>;
  openAPI?: readonly { sourcePath: string; content: string | Uint8Array }[];
  sourceIssues?: readonly Issue[];
  localization?: { locale: string; profile: LocaleProfile | undefined };
}

/** One pure compilation pass shared by check, build, task context and the server. */
export function compileProject(sources: readonly DocumentSource[], options: CompilationOptions) {
  return compileDocumentIndex(buildDocumentIndex(sources, options), options);
}

function compileProjectChangelog(
  source: DocumentSource | undefined,
  options: CompilationOptions,
): Document | undefined {
  if (!source) {
    return undefined;
  }
  const document = createDocument(source, options);
  document.id = 'CHANGELOG.md';
  document.type = 'changelog';
  document.sectionType = '';
  document.typeLabel = options.projectChangelogTitle?.trim() || 'Project changelog';
  document.outputPath = 'project-changelog.html';
  document.status = statusFor('');
  if (!document.markdown.analysis.title) {
    document.title = options.projectChangelogTitle?.trim() || 'Project changelog';
  }
  return document;
}

/** Finish an already parsed index after the adapter resolves referenced asset facts. */
export function compileDocumentIndex(index: DocumentIndex, options: CompilationOptions) {
  const links = resolveLinks(index, options.links);
  const relations = connectUseCasesAndModules(index, links.linksByPath);
  const knowledge = compileBaseKnowledge(index.documents, (document) =>
    (links.linksByPath.get(document.sourcePath) ?? []).flatMap((link) =>
      link.repositoryPath ? [link.repositoryPath] : [],
    ),
  );
  const tasks = compileWorkItems(index.documents, options.repository);
  const quality = compileQuality(index.documents, options, links.linksByPath);
  const roadmap = compileRoadmap(index.documents);
  const issues: Issue[] = [
    ...(options.sourceIssues ?? []),
    ...index.issues,
    ...links.issues,
    ...relations.issues,
    ...knowledge.issues,
    ...tasks.issues,
    ...quality.issues,
    ...roadmap.issues,
    ...validateRelationships(index, links.linksByPath, options.localization),
  ];
  const modules = new Set(knowledge.modules.map((item) => item.id)),
    useCases = new Set(knowledge.useCases.map((item) => item.id));
  for (const item of tasks.items) {
    const document = index.byPath.get(item.document);
    const line =
      document?.headings.find((heading) => heading.id === item.anchor)?.range.start.line ??
      document?.headings[0]?.range.start.line ??
      1;
    const report = (code: string, message: string): void => {
      issues.push({ severity: 'error', code, message, documentPath: item.document, line });
    };
    if (
      (!item.moduleId && document?.metadata.status !== 'draft') ||
      (item.moduleId && !modules.has(item.moduleId))
    )
      report(
        'dangling-module-reference',
        `Task ${item.id} references unknown module ${item.moduleId || '—'}.`,
      );
    if (item.useCaseId && !useCases.has(item.useCaseId))
      report(
        'dangling-use-case-reference',
        `Task ${item.id} references unknown use case ${item.useCaseId}.`,
      );
    if (item.flowId && knowledge.documentsById.get(item.flowId)?.type !== 'flow')
      report('dangling-flow-reference', `Task ${item.id} references unknown flow ${item.flowId}.`);
    for (const id of item.standardIds)
      if (!quality.standardIds.has(id))
        report('dangling-standard-reference', `Task ${item.id} references unknown standard ${id}.`);
    for (const id of item.runbookIds)
      if (!quality.runbookIds.has(id))
        report('dangling-runbook-reference', `Task ${item.id} references unknown runbook ${id}.`);
  }
  const screens = compileScreens(index.documents, {
    ...options.screens,
    contractLinks: links.linksByPath,
    modules: knowledge.modules,
    useCases: knowledge.useCases.map((item) => ({
      ...item,
      startScreenID: item.startScreen,
      screenIDs: item.screenIds,
    })),
    workItems: tasks.items.map((item) => ({
      id: item.id,
      document: item.document,
      line: index.byPath.get(item.document)?.headings[0]?.range.start.line ?? 1,
      screenIDs: item.screenIds,
      transitionIDs: item.transitionIds,
      verification: item.verification.map((check) => ({
        criterionID: check.criterionId,
        transitions: check.transitions,
        references: check.verificationReferences,
      })),
    })),
  });
  issues.push(...screens.issues);
  for (const module of knowledge.modules)
    module.screenIds = screens.screens
      .filter((screen) => screen.moduleID === module.id)
      .map((screen) => screen.id);
  for (const useCase of knowledge.useCases)
    useCase.screenIds = uniqueStrings([
      ...useCase.screenIds,
      ...screens.screens
        .filter((screen) => screen.useCaseIDs.includes(useCase.id))
        .map((screen) => screen.id),
    ]).sort(naturalCompare);
  const parsedContracts = (options.openAPI ?? []).map((source) =>
    parseOpenAPIContract(source.sourcePath, source.content),
  );
  for (const contract of parsedContracts) issues.push(...contract.issues);
  const contracts = parsedContracts
    .filter((result) => result.issues.length === 0)
    .map((result) => result.contract)
    .sort((left, right) => naturalCompare(left.path, right.path));
  const openAPIDiagnostics = parsedContracts.flatMap((result) => result.diagnostics);
  return {
    index,
    projectChangelog: compileProjectChangelog(options.projectChangelog, options),
    links,
    relations,
    knowledge: {
      ...knowledge,
      workItems: tasks.items,
      standards: quality.standards,
      runbooks: quality.runbooks,
      ...screens,
    },
    roadmapStages: roadmap.stages,
    risks: roadmap.risks,
    openAPI: contracts,
    openAPIDiagnostics,
    issues,
  };
}
export type CompiledProject = ReturnType<typeof compileProject>;

import type { Issue } from '@toudocu/contracts';
import type { Document, DocumentStatus } from '../documents/document.js';
import { naturalCompare } from '../documents/project.js';

export interface KnowledgeModule {
  id: string;
  title: string;
  status: DocumentStatus;
  document: string;
  repositoryPaths: string[];
  useCaseIds: string[];
  screenIds: string[];
  businessRuleIds: string[];
}
export interface KnowledgeUseCase {
  id: string;
  title: string;
  status: DocumentStatus;
  moduleId: string;
  document: string;
  repositoryPaths: string[];
  businessRuleIds: string[];
  flowIds: string[];
  screenIds: string[];
  startScreen: string;
  terminalScreens: string[];
  allowCycle: boolean;
}
export interface KnowledgeFlow {
  id: string;
  title: string;
  moduleId: string;
  useCaseIds: string[];
  document: string;
}
export interface BusinessRule {
  id: string;
  title: string;
  moduleId: string;
  document: string;
  anchor: string;
  line: number;
}
export interface BaseKnowledge {
  modules: KnowledgeModule[];
  useCases: KnowledgeUseCase[];
  flows: KnowledgeFlow[];
  businessRules: BusinessRule[];
  issues: Issue[];
  documentsById: ReadonlyMap<string, Document>;
}
export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
export function splitReferences(value: string): string[] {
  return uniqueStrings(value.split(/[,; \t\n]+/));
}
export function sectionByKind(document: Document, kind: string) {
  return document.sections.find((section) => section.heading.level === 2 && section.kind === kind);
}
export function sectionText(document: Document, kind: string): string {
  return sectionByKind(document, kind)?.text.trim() ?? '';
}
export function useCaseReadiness(document: Document) {
  const section = sectionByKind(document, 'acceptance-criteria');
  const total = section?.tasks.length ?? 0;
  const completed = section?.tasks.filter((task) => task.completed).length ?? 0;
  const statusDone = document.status.kind === 'done';
  return {
    statusDone,
    effectiveCompleted: statusDone && total > 0 && total === completed,
    acceptance: {
      found: !!section,
      total,
      completed,
      remaining: total - completed,
      headingLine: section?.heading.range.start.line ?? 0,
      firstOpenLine: section?.tasks.find((task) => !task.completed)?.range.start.line ?? 0,
    },
  };
}

/** Compile stable entities before task and screen graphs are connected. */
export function compileBaseKnowledge(
  documents: readonly Document[],
  repositoryPaths: (document: Document) => readonly string[] = () => [],
): BaseKnowledge {
  const result: BaseKnowledge = {
    modules: [],
    useCases: [],
    flows: [],
    businessRules: [],
    issues: [],
    documentsById: new Map(),
  };
  const ids = new Map<string, Document>();
  const report = (document: Document, code: string, message: string, line = 0): void => {
    result.issues.push({
      severity: 'error',
      code,
      message,
      documentPath: document.sourcePath,
      ...(line ? { line } : {}),
    });
  };
  const prefixes = new Map([
    ['module', 'MOD-'],
    ['use-case', 'UC-'],
    ['decision', 'ADR-'],
    ['flow', 'FLOW-'],
    ['screen', 'SC-'],
  ]);
  for (const document of documents) {
    const id = document.metadata.id ?? '';
    const prefix = prefixes.get(document.type);
    if (prefix && !id)
      report(
        document,
        'missing-document-id',
        `Document type ${document.type} requires an Identifier field.`,
      );
    else if (prefix && !id.startsWith(prefix))
      report(document, 'invalid-document-id', `The identifier must start with ${prefix}.`);
    if (id) {
      const previous = ids.get(id);
      if (previous)
        report(
          document,
          'duplicate-id',
          `Identifier ${id} is already used in ${previous.sourcePath}.`,
        );
      else ids.set(id, document);
    }
    const paths = (): string[] => uniqueStrings(repositoryPaths(document)).sort(naturalCompare);
    if (document.type === 'module') {
      result.modules.push({
        id,
        title: document.title,
        status: document.status,
        document: document.sourcePath,
        repositoryPaths: paths(),
        useCaseIds: [],
        screenIds: [],
        businessRuleIds: [],
      });
      for (const heading of document.headings) {
        const match = /^(BR-[A-Z0-9-]+)\s*[:—-]\s*(.+)$/.exec(heading.title);
        if (match)
          result.businessRules.push({
            id: match[1] ?? '',
            title: match[2] ?? '',
            moduleId: id,
            document: document.sourcePath,
            anchor: heading.id,
            line: heading.range.start.line,
          });
      }
    } else if (document.type === 'use-case') {
      result.useCases.push({
        id,
        title: document.title,
        status: document.status,
        moduleId: document.metadata.module ?? '',
        document: document.sourcePath,
        repositoryPaths: paths(),
        businessRuleIds: [],
        flowIds: [],
        screenIds: splitReferences(document.metadata.screens ?? ''),
        startScreen: document.metadata.startScreen?.trim() ?? '',
        terminalScreens: splitReferences(document.metadata.terminalScreens ?? ''),
        allowCycle: document.metadata.allowCycle === 'true',
      });
      const readiness = useCaseReadiness(document);
      if (readiness.statusDone && !readiness.acceptance.total)
        report(
          document,
          'done-use-case-missing-acceptance-criteria',
          'A done use case must have a non-empty Acceptance criteria section.',
          readiness.acceptance.headingLine ||
            document.headings.find((heading) => heading.level === 1)?.range.start.line ||
            1,
        );
      else if (readiness.statusDone && readiness.acceptance.remaining)
        report(
          document,
          'done-use-case-has-open-acceptance-criteria',
          'A done use case must not have open acceptance criteria.',
          readiness.acceptance.firstOpenLine,
        );
    } else if (document.type === 'flow') {
      result.flows.push({
        id,
        title: document.title,
        moduleId: document.metadata.module ?? '',
        useCaseIds: splitReferences(document.metadata.useCase ?? ''),
        document: document.sourcePath,
      });
    }
  }
  const byPath = new Map(documents.map((document) => [document.sourcePath, document]));
  const modules = new Map(result.modules.filter((item) => item.id).map((item) => [item.id, item]));
  const useCases = new Map(
    result.useCases.filter((item) => item.id).map((item) => [item.id, item]),
  );
  const rules = new Map<string, BusinessRule>();
  for (const rule of result.businessRules) {
    const previous = rules.get(rule.id);
    const owner = byPath.get(rule.document);
    if (previous && owner)
      report(
        owner,
        'duplicate-id',
        `Business rule ${rule.id} is already declared in ${previous.document}.`,
        rule.line,
      );
    else rules.set(rule.id, rule);
    modules.get(rule.moduleId)?.businessRuleIds.push(rule.id);
  }
  for (const useCase of result.useCases) {
    const owner = byPath.get(useCase.document);
    if (!owner) continue;
    const module = modules.get(useCase.moduleId);
    if (!module)
      report(
        owner,
        'dangling-module-reference',
        `The use case references unknown module ${useCase.moduleId.trim() || '—'}.`,
      );
    else if (useCase.id) module.useCaseIds.push(useCase.id);
    useCase.businessRuleIds = uniqueStrings(owner.content.match(/\bBR-[A-Z0-9-]+\b/g) ?? []).sort(
      naturalCompare,
    );
    for (const id of useCase.businessRuleIds)
      if (!rules.has(id))
        report(owner, 'dangling-rule-reference', `The use case references unknown rule ${id}.`);
  }
  for (const flow of result.flows) {
    flow.useCaseIds = uniqueStrings(flow.useCaseIds).sort(naturalCompare);
    for (const id of flow.useCaseIds) useCases.get(id)?.flowIds.push(flow.id);
  }
  for (const useCase of result.useCases)
    useCase.flowIds = uniqueStrings(useCase.flowIds).sort(naturalCompare);
  for (const module of result.modules) {
    module.useCaseIds = uniqueStrings(module.useCaseIds).sort(naturalCompare);
    module.businessRuleIds = uniqueStrings(module.businessRuleIds).sort(naturalCompare);
  }
  result.documentsById = ids;
  return result;
}

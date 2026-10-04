import { buildProjectSummary, type CompiledProject } from '@toudocu/core';
import { ProjectReportV1Schema, type ProjectReportV1 } from '@toudocu/contracts';

function omitEmpty<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  const result = { ...value };
  for (const key of keys) if (result[key] === '') delete result[key];
  return result;
}

export function projectKnowledge(project: CompiledProject): ProjectReportV1['knowledge'] {
  const knowledge = project.knowledge;
  return {
    modules: knowledge.modules,
    useCases: knowledge.useCases.map((item) => omitEmpty(item, ['moduleId', 'startScreen'])),
    flows: knowledge.flows.map((item) => omitEmpty(item, ['moduleId'])),
    standards: knowledge.standards.map((item) =>
      omitEmpty(item, ['scope', 'updated', 'supersededBy', 'rules', 'automaticChecks']),
    ),
    runbooks: knowledge.runbooks.map((item) =>
      omitEmpty(item, ['environment', 'risk', 'lastVerified']),
    ),
    businessRules: knowledge.businessRules.map((item) => omitEmpty(item, ['moduleId'])),
    workItems: knowledge.workItems.map(({ verification, ...item }) => ({
      ...omitEmpty(item, [
        'type',
        'archiveYear',
        'priority',
        'severity',
        'reproducibility',
        'regression',
        'updated',
        'moduleId',
        'useCaseId',
        'flowId',
        'result',
        'behaviorChange',
        'before',
        'after',
        'outOfScope',
        'plan',
        'documentationImpact',
        'blocker',
      ]),
      verificationMatrix: verification,
    })),
  };
}

export function projectScreens(project: CompiledProject): ProjectReportV1['screens'] {
  return project.knowledge.screens.map((screen) =>
    omitEmpty(
      {
        id: screen.id,
        title: screen.title,
        description: screen.description,
        module: screen.moduleID,
        type: screen.kind,
        status: screen.status.kind === 'done' ? 'implemented' : screen.status.kind,
        route: screen.route,
        preview: screen.preview,
        component: screen.component,
        updated: screen.updated,
        parent: screen.parentID,
        states: screen.states.map((state) => omitEmpty(state, ['title', 'preview'])),
        incomingTransitions: screen.incomingTransitionIDs,
        outgoingTransitions: screen.outgoingTransitionIDs,
        useCases: screen.useCaseIDs,
        workItems: screen.workItemIDs,
        contracts: screen.contractDocuments,
        document: screen.document,
      },
      ['description', 'route', 'preview', 'component', 'updated', 'parent'],
    ),
  );
}

export function projectTransitions(
  project: CompiledProject,
): NonNullable<ProjectReportV1['transitions']> {
  return project.knowledge.transitions.map((item) =>
    omitEmpty(
      {
        id: item.id,
        useCase: item.useCaseID,
        source: item.fromID,
        target: item.toID,
        action: item.action,
        condition: item.condition,
        state: item.stateID,
        error: item.errorID,
        message: item.message,
        contract: item.contract,
        type: item.kind,
        document: item.document,
        line: item.line,
      },
      ['useCase', 'state', 'error', 'message', 'contract'],
    ),
  );
}

/** Project reports are a versioned boundary, not a dump of internal compiler objects. */
export function buildProjectReport(
  project: CompiledProject,
  options: {
    version: string;
    generatedAt: Date;
    sourceDirectory: string;
    staleDays: number;
    title?: string;
  },
): ProjectReportV1 {
  const summary = buildProjectSummary(project, {
    root: options.sourceDirectory,
    ...(options.title ? { requestedTitle: options.title } : {}),
  });
  const {
    overviewDocument: _overview,
    statusDocument: _status,
    ...projectInfo
  } = summary.projectInfo;
  const knowledge = project.knowledge;
  const back = new Map<string, string[]>();
  const related = new Map<string, string[]>();
  for (const document of project.index.documents)
    for (const link of project.links.linksByPath.get(document.sourcePath) ?? []) {
      if (link.image || !link.targetDocumentPath || link.targetDocumentPath === document.sourcePath)
        continue;
      const incoming = back.get(link.targetDocumentPath) ?? [];
      if (!incoming.includes(document.sourcePath)) incoming.push(document.sourcePath);
      back.set(link.targetDocumentPath, incoming);
      const outgoing = related.get(document.sourcePath) ?? [];
      if (!outgoing.includes(link.targetDocumentPath)) outgoing.push(link.targetDocumentPath);
      related.set(document.sourcePath, outgoing);
    }
  return ProjectReportV1Schema.parse({
    schemaVersion: 1,
    generator: { name: 'Toudocu', version: options.version },
    generatedAt: options.generatedAt.toISOString().replace(/\.000Z$/u, 'Z'),
    sourceDirectory:
      options.sourceDirectory.replaceAll('\\', '/').replace(/\/+$/u, '').split('/').at(-1) ?? '',
    staleDays: options.staleDays,
    project: projectInfo,
    currentStatus: {
      ...summary.currentStatus,
      activeWork: summary.currentStatus.activeWork.map((item) => omitEmpty(item, ['moduleId'])),
    },
    stats: summary.stats,
    documents: project.index.documents.map((document) => ({
      id: document.metadata.id ?? '',
      sourcePath: document.sourcePath,
      outputPath: document.outputPath,
      type: document.type,
      ...(document.sectionType ? { sectionType: document.sectionType } : {}),
      title: document.title,
      description: document.description,
      metadata: Object.fromEntries(
        Object.entries(document.metadata).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      status: document.status,
      taskStats: document.taskStats,
      updatedAt: document.updatedAt.toISOString().replace(/\.000Z$/u, 'Z'),
      stale: document.stale,
      warnings: project.issues.filter(
        (issue) => issue.documentPath === document.sourcePath && issue.severity === 'warning',
      ).length,
      errors: project.issues.filter(
        (issue) => issue.documentPath === document.sourcePath && issue.severity === 'error',
      ).length,
      links: (project.links.linksByPath.get(document.sourcePath) ?? []).map((link) => ({
        destination: link.destination,
        broken: link.broken,
        blocked: link.blocked,
        targetKind: link.targetDocumentPath
          ? 'document'
          : link.repositoryPath
            ? 'repository'
            : link.assetPath
              ? 'asset'
              : link.generatedTarget
                ? 'directory'
                : link.external
                  ? 'external'
                  : '',
        target:
          link.targetDocumentPath ??
          link.repositoryPath ??
          link.assetPath ??
          link.generatedTarget ??
          '',
        href: link.href,
      })),
      backlinks: back.get(document.sourcePath) ?? [],
      relatedDocuments: related.get(document.sourcePath) ?? [],
    })),
    roadmap: project.roadmapStages.map(({ text: _text, ...stage }) => stage),
    risks: project.risks.map(({ fullTitle: _title, text: _text, ...risk }) => risk),
    knowledge: projectKnowledge(project),
    screens: projectScreens(project),
    transitions: projectTransitions(project),
    playableFlows: knowledge.playableFlows.map((item) =>
      omitEmpty(
        {
          useCase: item.useCaseID,
          startScreen: item.startScreenID,
          reachableScreens: item.reachableScreens,
          terminalScreens: item.terminalScreens,
          transitions: item.transitionIDs,
          result: item.result,
          valid: item.valid,
          issueCodes: item.issueCodes,
        },
        ['result'],
      ),
    ),
    hotspots: knowledge.hotspots.map((item) => ({
      screen: item.screenID,
      transition: item.transitionID,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      ...(item.allowDuplicate ? { allowDuplicate: true } : {}),
    })),
    errorDefinitions: knowledge.errors,
    traceability: knowledge.traceability.map((item) =>
      omitEmpty(
        {
          useCase: item.useCaseID,
          screen: item.screenID,
          transition: item.transitionID,
          task: item.taskID,
          criterion: item.criterionID,
          verification: item.verification,
        },
        ['useCase'],
      ),
    ),
    issues: project.issues,
  });
}

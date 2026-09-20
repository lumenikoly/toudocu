import {
  PortalSnapshotV1Schema,
  type NavigationItem,
  type PageViewV1,
  type PortalSnapshotV1,
  type RuntimeCapabilitiesV1,
  type TaskHierarchyNode,
} from '@toudocu/contracts';
import {
  buildProjectSummary,
  naturalCompare,
  type CompiledProject,
  type Document,
} from '@toudocu/core';
import {
  buildPortalRouteRegistry,
  portalRouteIds,
  type PortalEnvironment,
  type PortalRouteRegistry,
} from './routes.js';

export interface PortalMapperOptions {
  version: string;
  sourceDirectory?: string;
  title?: string;
  generatedAt?: Date;
  environment?: PortalEnvironment;
  screenMapEnabled?: boolean;
  healthOutputPath?: string;
  editing?: boolean;
  changes?: boolean;
  discussions?: boolean;
  rebuild?: boolean;
  agentConsole?: boolean;
  terminal?: boolean;
  taskActions?: boolean;
}

function optional(value: string): string | undefined {
  return value.trim() ? value : undefined;
}

function iso(value: Date): string {
  return value.toISOString().replace(/\.000Z$/u, 'Z');
}

function documentLinks(project: CompiledProject, document: Document) {
  return (project.links.linksByPath.get(document.sourcePath) ?? []).map((link) => ({
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
  }));
}

function documentView(
  project: CompiledProject,
  document: Document,
  back: ReadonlyMap<string, readonly string[]>,
  related: ReadonlyMap<string, readonly string[]>,
) {
  const resolvedLinks = project.links.linksByPath.get(document.sourcePath) ?? [];
  return {
    id: document.metadata.id ?? '',
    sourcePath: document.sourcePath,
    outputPath: document.outputPath,
    type: document.type,
    ...(document.sectionType ? { sectionType: document.sectionType } : {}),
    title: document.title,
    description: document.description,
    metadata: Object.fromEntries(
      Object.entries(document.metadata).sort(([left], [right]) => naturalCompare(left, right)),
    ),
    status: document.status,
    taskStats: document.taskStats,
    updatedAt: iso(document.updatedAt),
    stale: document.stale,
    warnings: project.issues.filter(
      (issue) => issue.documentPath === document.sourcePath && issue.severity === 'warning',
    ).length,
    errors: project.issues.filter(
      (issue) => issue.documentPath === document.sourcePath && issue.severity === 'error',
    ).length,
    links: documentLinks(project, document),
    backlinks: [...(back.get(document.sourcePath) ?? [])],
    relatedDocuments: [...(related.get(document.sourcePath) ?? [])],
    content: document.content,
    html: document.markdown.render({
      skipH1: true,
      resolveLink: (destination, image) => {
        const link = resolvedLinks.find(
          (candidate) => candidate.destination === destination && candidate.image === image,
        );
        return link
          ? {
              href: link.href,
              external: link.external,
              blocked: link.blocked,
            }
          : { href: '', external: false, blocked: true };
      },
    }),
    sections: document.sections.map((section) => ({
      id: section.heading.id,
      title: section.heading.title,
      level: section.heading.level,
      ...(section.kind ? { kind: section.kind } : {}),
      markdown: section.markdown,
      line: section.heading.range.start.line,
    })),
  };
}

function allDocumentViews(project: CompiledProject) {
  const back = new Map<string, string[]>();
  const related = new Map<string, string[]>();
  for (const document of project.index.documents) {
    for (const link of project.links.linksByPath.get(document.sourcePath) ?? []) {
      const target = link.targetDocumentPath;
      if (!target || target === document.sourcePath || link.image) {
        continue;
      }
      const incoming = back.get(target) ?? [];
      if (!incoming.includes(document.sourcePath)) {
        incoming.push(document.sourcePath);
      }
      back.set(target, incoming);
      const outgoing = related.get(document.sourcePath) ?? [];
      if (!outgoing.includes(target)) {
        outgoing.push(target);
      }
      related.set(document.sourcePath, outgoing);
    }
  }
  const views = new Map(
    project.index.documents.map((document) => [
      document.sourcePath,
      documentView(project, document, back, related),
    ]),
  );
  if (project.projectChangelog) {
    views.set(
      project.projectChangelog.sourcePath,
      documentView(project, project.projectChangelog, back, related),
    );
  }
  return views;
}

function projectInfo(project: CompiledProject, sourceDirectory: string, title?: string) {
  const summary = buildProjectSummary(project, { root: sourceDirectory });
  const {
    overviewDocument: _overview,
    statusDocument: _status,
    ...projectView
  } = summary.projectInfo;
  return {
    summary,
    project: { ...projectView, ...(title?.trim() ? { title: title.trim() } : {}) },
    stats: summary.stats,
  };
}

function workItemView(item: CompiledProject['knowledge']['workItems'][number]) {
  return {
    id: item.id,
    title: item.title,
    status: item.status,
    archived: item.archived,
    ...(optional(item.type) ? { type: item.type } : {}),
    ...(optional(item.archiveYear) ? { archiveYear: item.archiveYear } : {}),
    ...(optional(item.priority) ? { priority: item.priority } : {}),
    ...(optional(item.severity) ? { severity: item.severity } : {}),
    ...(optional(item.reproducibility) ? { reproducibility: item.reproducibility } : {}),
    ...(optional(item.regression) ? { regression: item.regression } : {}),
    ...(optional(item.updated) ? { updated: item.updated } : {}),
    ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
    ...(optional(item.useCaseId) ? { useCaseId: item.useCaseId } : {}),
    ...(optional(item.flowId) ? { flowId: item.flowId } : {}),
    screenIds: item.screenIds,
    transitionIds: item.transitionIds,
    standardIds: item.standardIds,
    runbookIds: item.runbookIds,
    dependsOn: item.dependsOn,
    parentId: item.parentId,
    childIds: item.childIds,
    document: item.document,
    anchor: item.anchor,
    criteria: item.criteria,
    verificationMatrix: item.verification,
    checks: item.checks,
    repositoryPaths: item.repositoryPaths,
    ...(optional(item.result) ? { result: item.result } : {}),
    ...(optional(item.behaviorChange) ? { behaviorChange: item.behaviorChange } : {}),
    ...(optional(item.before) ? { before: item.before } : {}),
    ...(optional(item.after) ? { after: item.after } : {}),
    ...(optional(item.outOfScope) ? { outOfScope: item.outOfScope } : {}),
    ...(optional(item.plan) ? { plan: item.plan } : {}),
    ...(optional(item.documentationImpact)
      ? { documentationImpact: item.documentationImpact }
      : {}),
    documentationPaths: item.documentationPaths,
    ...(optional(item.blocker) ? { blocker: item.blocker } : {}),
  };
}

function taskHierarchy(project: CompiledProject, rootId?: string): TaskHierarchyNode[] {
  const byID = new Map(project.knowledge.workItems.map((item) => [item.id, item]));
  const node = (
    item: CompiledProject['knowledge']['workItems'][number],
    seen: Set<string>,
  ): TaskHierarchyNode => ({
    id: item.id,
    title: item.title,
    status: item.status,
    children: item.childIds.flatMap((id) => {
      const child = byID.get(id);
      if (!child || seen.has(child.id)) {
        return [];
      }
      return [node(child, new Set(seen).add(child.id))];
    }),
  });
  if (rootId) {
    const root = byID.get(rootId);
    return root ? [node(root, new Set([root.id]))] : [];
  }
  return project.knowledge.workItems
    .filter((item) => !item.parentId || !byID.has(item.parentId))
    .map((item) => node(item, new Set([item.id])));
}

function pages(
  project: CompiledProject,
  registry: PortalRouteRegistry,
  views: ReadonlyMap<string, ReturnType<typeof documentView>>,
  summary: ReturnType<typeof projectInfo>,
): PageViewV1[] {
  const get = (pageId: string) => {
    const result = registry.get(pageId);
    if (!result) {
      throw new Error(`missing portal route ${pageId}`);
    }
    return result;
  };
  const pages: PageViewV1[] = [];
  const home = get('home');
  pages.push({
    kind: 'home',
    pageId: home.pageId,
    route: home,
    project: summary.project,
    currentStatus: summary.summary.currentStatus,
    stats: summary.stats,
    search: summary.summary.searchIndex,
    document: views.get('index.md') ?? null,
  });
  const workItemsByDocument = new Map(
    project.knowledge.workItems.map((item) => [item.document, item]),
  );
  for (const document of project.index.documents) {
    const view = views.get(document.sourcePath);
    if (!view) {
      continue;
    }
    const workItem = workItemsByDocument.get(document.sourcePath);
    const route = registry.get(
      workItem ? portalRouteIds.task(workItem.id) : portalRouteIds.document(document.sourcePath),
    );
    if (!route) {
      continue;
    }
    if (workItem) {
      pages.push({
        kind: 'task',
        pageId: route.pageId,
        route,
        document: view,
        workItem: workItemView(workItem),
        hierarchy: taskHierarchy(project, workItem.id),
        relations: { related: view.relatedDocuments, backlinks: view.backlinks },
      });
      continue;
    }
    pages.push({
      kind: 'document',
      pageId: route.pageId,
      route,
      document: view,
      relations: { related: view.relatedDocuments, backlinks: view.backlinks },
    });
  }
  const addCatalog = (
    pageId: string,
    section: string,
    documents: Document[],
    entities: Extract<PageViewV1, { kind: 'catalog' }>['data']['entities'] = [],
  ): void => {
    const route = registry.get(pageId);
    if (!route) {
      return;
    }
    pages.push({
      kind: 'catalog',
      pageId,
      route,
      data: {
        section,
        title: section,
        documents: documents.flatMap((document) => {
          const view = views.get(document.sourcePath);
          return view ? [view] : [];
        }),
        entities,
      },
    });
  };
  addCatalog(
    'use-cases',
    'use-cases',
    project.index.documents.filter((item) => item.type === 'use-case'),
    project.knowledge.useCases,
  );
  addCatalog(
    'screens',
    'screens',
    project.index.documents.filter((item) => item.type === 'screen'),
  );
  addCatalog(
    'quality',
    'quality',
    project.index.documents.filter((item) => item.type === 'standard'),
    project.knowledge.standards,
  );
  addCatalog(
    'runbooks',
    'runbooks',
    project.index.documents.filter((item) => item.type === 'runbook'),
    project.knowledge.runbooks,
  );
  addCatalog(
    'drafts',
    'drafts',
    project.index.documents.filter((item) => item.type === 'draft'),
  );
  if (registry.get('processes')) {
    const route = get('processes');
    pages.push({
      kind: 'processes',
      pageId: route.pageId,
      route,
      useCases: project.knowledge.useCases.map((item) => ({
        ...item,
        ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
        ...(optional(item.startScreen) ? { startScreen: item.startScreen } : {}),
      })),
      flows: project.knowledge.flows.map((item) => ({
        ...item,
        ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
      })),
    });
  }
  if (registry.get('screen-map')) {
    const route = get('screen-map');
    pages.push({
      kind: 'screens',
      pageId: route.pageId,
      route,
      screens: project.knowledge.screens.map(screenView),
      transitions: project.knowledge.transitions.map(transitionView),
      playableFlows: project.knowledge.playableFlows.map(playableFlowView),
      hotspots: project.knowledge.hotspots.map(hotspotView),
      errors: project.knowledge.errors,
    });
  }
  if (registry.get('traceability')) {
    const route = get('traceability');
    pages.push({
      kind: 'traceability',
      pageId: route.pageId,
      route,
      rows: project.knowledge.traceability.map(traceabilityView),
    });
  }
  const health = get('health');
  pages.push({
    kind: 'health',
    pageId: health.pageId,
    route: health,
    stats: summary.stats,
    issues: project.issues,
    reportRoute: get('report'),
  });
  const search = get('search');
  pages.push({
    kind: 'search',
    pageId: search.pageId,
    route: search,
    entries: summary.summary.searchIndex,
  });
  if (registry.get('roadmap')) {
    const route = get('roadmap');
    pages.push({
      kind: 'roadmap',
      pageId: route.pageId,
      route,
      stages: project.roadmapStages.map(({ text: _text, ...stage }) => stage),
      risks: project.risks.map(({ fullTitle: _fullTitle, text: _text, ...risk }) => risk),
    });
  }
  if (project.projectChangelog) {
    const route = get('changelog');
    const view = views.get(project.projectChangelog.sourcePath);
    if (view) {
      pages.push({ kind: 'changelog', pageId: route.pageId, route, document: view });
    }
  }
  const workspace = registry.get('task-workspace');
  if (workspace) {
    pages.push({
      kind: 'task-workspace',
      pageId: workspace.pageId,
      route: workspace,
      workItems: project.knowledge.workItems.map(workItemView),
      hierarchy: taskHierarchy(project),
    });
  }
  for (const pageId of ['editor', 'changes', 'discussions', 'api-docs'] as const) {
    const route = registry.get(pageId);
    if (route) {
      pages.push({ kind: pageId, pageId, route });
    }
  }
  for (const route of registry.routes.filter(
    (item) => item.kind === 'catalog' && item.pageId.startsWith('directory:'),
  )) {
    const directory = route.pageId.slice('directory:'.length);
    pages.push({
      kind: 'catalog',
      pageId: route.pageId,
      route,
      data: {
        section: directory,
        title: directory,
        documents: project.index.documents.flatMap((document) => {
          if (!document.sourcePath.startsWith(`${directory}/`)) {
            return [];
          }
          const view = views.get(document.sourcePath);
          return view ? [view] : [];
        }),
        entities: [],
      },
    });
  }
  const notFound = get('not-found');
  pages.push({ kind: 'not-found', pageId: notFound.pageId, route: notFound });
  return pages;
}

function screenView(screen: CompiledProject['knowledge']['screens'][number]) {
  return {
    id: screen.id,
    title: screen.title,
    ...(optional(screen.description) ? { description: screen.description } : {}),
    module: screen.moduleID,
    type: screen.kind,
    status: screen.status.kind === 'done' ? 'implemented' : screen.status.kind,
    ...(optional(screen.route) ? { route: screen.route } : {}),
    ...(optional(screen.preview) ? { preview: screen.preview } : {}),
    ...(optional(screen.component) ? { component: screen.component } : {}),
    ...(optional(screen.updated) ? { updated: screen.updated } : {}),
    ...(optional(screen.parentID) ? { parent: screen.parentID } : {}),
    states: screen.states.map((state) => ({
      id: state.id,
      ...(optional(state.title) ? { title: state.title } : {}),
      ...(optional(state.preview) ? { preview: state.preview } : {}),
    })),
    incomingTransitions: screen.incomingTransitionIDs,
    outgoingTransitions: screen.outgoingTransitionIDs,
    useCases: screen.useCaseIDs,
    workItems: screen.workItemIDs,
    contracts: screen.contractDocuments,
    document: screen.document,
  };
}

function transitionView(item: CompiledProject['knowledge']['transitions'][number]) {
  return {
    id: item.id,
    ...(optional(item.useCaseID) ? { useCase: item.useCaseID } : {}),
    source: item.fromID,
    target: item.toID,
    action: item.action,
    condition: item.condition,
    ...(optional(item.stateID) ? { state: item.stateID } : {}),
    ...(optional(item.errorID) ? { error: item.errorID } : {}),
    ...(optional(item.message) ? { message: item.message } : {}),
    ...(optional(item.contract) ? { contract: item.contract } : {}),
    type: item.kind,
    document: item.document,
    line: item.line,
  };
}

function playableFlowView(item: CompiledProject['knowledge']['playableFlows'][number]) {
  return {
    useCase: item.useCaseID,
    startScreen: item.startScreenID,
    reachableScreens: item.reachableScreens,
    terminalScreens: item.terminalScreens,
    transitions: item.transitionIDs,
    ...(optional(item.result) ? { result: item.result } : {}),
    valid: item.valid,
    issueCodes: item.issueCodes,
  };
}

function hotspotView(item: CompiledProject['knowledge']['hotspots'][number]) {
  return {
    screen: item.screenID,
    transition: item.transitionID,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    ...(item.allowDuplicate ? { allowDuplicate: true } : {}),
  };
}

function traceabilityView(item: CompiledProject['knowledge']['traceability'][number]) {
  return {
    ...(optional(item.useCaseID) ? { useCase: item.useCaseID } : {}),
    screen: item.screenID,
    transition: item.transitionID,
    task: item.taskID,
    criterion: item.criterionID,
    verification: item.verification,
  };
}

function navigation(project: CompiledProject, registry: PortalRouteRegistry): NavigationItem[] {
  const items: NavigationItem[] = [];
  const home = registry.get('home');
  if (home) {
    items.push({
      id: 'home',
      title: 'home',
      pageId: home.pageId,
      href: home.href,
      kind: home.kind,
      children: [],
    });
  }
  for (const document of project.index.documents) {
    const route = registry.get(portalRouteIds.document(document.sourcePath));
    if (!route) {
      continue;
    }
    items.push({
      id: document.sourcePath,
      title: document.title,
      pageId: route.pageId,
      href: route.href,
      kind: document.type,
      ...(document.status.label ? { status: document.status } : {}),
      children: [],
    });
  }
  const workItems = new Map(project.knowledge.workItems.map((item) => [item.id, item]));
  const taskNavigation = (
    item: CompiledProject['knowledge']['workItems'][number],
    seen: Set<string>,
  ): NavigationItem | undefined => {
    const route = registry.get(portalRouteIds.task(item.id));
    if (!route) {
      return undefined;
    }
    const nextSeen = new Set(seen).add(item.id);
    return {
      id: item.id,
      title: item.title,
      pageId: route.pageId,
      href: route.href,
      kind: route.kind,
      status: item.status,
      children: item.childIds.flatMap((id) => {
        const child = workItems.get(id);
        if (!child || nextSeen.has(id)) {
          return [];
        }
        const navigation = taskNavigation(child, nextSeen);
        return navigation ? [navigation] : [];
      }),
    };
  };
  for (const item of project.knowledge.workItems) {
    if (item.parentId && workItems.has(item.parentId)) {
      continue;
    }
    const navigation = taskNavigation(item, new Set());
    if (navigation) {
      items.push(navigation);
    }
  }
  for (const pageId of [
    'use-cases',
    'processes',
    'screens',
    'screen-map',
    'traceability',
    'roadmap',
    'changelog',
    'health',
    'task-workspace',
    'editor',
    'changes',
    'discussions',
    'api-docs',
  ] as const) {
    const route = registry.get(pageId);
    if (route) {
      items.push({
        id: pageId,
        title: pageId,
        pageId,
        href: route.href,
        kind: route.kind,
        children: [],
      });
    }
  }
  return items;
}

function capabilities(options: PortalMapperOptions): RuntimeCapabilitiesV1 {
  const environment = options.environment ?? 'static';
  const serve = environment === 'serve';
  return {
    schemaVersion: 1,
    mode: environment,
    editing: serve && options.editing !== false,
    changes: serve && options.changes !== false,
    discussions: serve && options.discussions !== false,
    agentConsole: serve && options.agentConsole === true,
    terminal: serve && options.terminal !== false,
    taskActions: serve && options.taskActions !== false,
    rebuild: serve && options.rebuild !== false,
  };
}

export function buildPortalSnapshot(
  project: CompiledProject,
  options: PortalMapperOptions,
): PortalSnapshotV1 {
  const sourceDirectory = options.sourceDirectory ?? '';
  const registry = buildPortalRouteRegistry(project, options);
  const views = allDocumentViews(project);
  const summary = projectInfo(project, sourceDirectory, options.title);
  const mappedPages = pages(project, registry, views, summary);
  const totalTasks = summary.stats.totalTasks;
  const completedTasks = summary.stats.completedTasks;
  return PortalSnapshotV1Schema.parse({
    schemaVersion: 1,
    kind: 'portal',
    generator: { name: 'Toudocu', version: options.version },
    capabilities: capabilities(options),
    project: summary.project,
    navigation: { schemaVersion: 1, items: navigation(project, registry) },
    routes: registry.routes,
    pages: mappedPages,
    stats: summary.stats,
    issues: project.issues,
    taskStats: {
      total: totalTasks,
      completed: completedTasks,
      remaining: totalTasks - completedTasks,
      percent: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : null,
    },
    relations: project.knowledge.modules.map((module) => ({
      id: module.id,
      useCases: module.useCaseIds,
      screens: module.screenIds,
      rules: module.businessRuleIds,
    })),
    knowledge: {
      modules: project.knowledge.modules,
      useCases: project.knowledge.useCases.map((item) => ({
        ...item,
        ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
        ...(optional(item.startScreen) ? { startScreen: item.startScreen } : {}),
      })),
      flows: project.knowledge.flows.map((item) => ({
        ...item,
        ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
      })),
      standards: project.knowledge.standards.map((item) => ({
        ...item,
        ...(optional(item.scope) ? { scope: item.scope } : {}),
        ...(optional(item.updated) ? { updated: item.updated } : {}),
        ...(optional(item.supersededBy) ? { supersededBy: item.supersededBy } : {}),
        ...(optional(item.rules) ? { rules: item.rules } : {}),
        ...(optional(item.automaticChecks) ? { automaticChecks: item.automaticChecks } : {}),
      })),
      runbooks: project.knowledge.runbooks.map((item) => ({
        ...item,
        ...(optional(item.environment) ? { environment: item.environment } : {}),
        ...(optional(item.risk) ? { risk: item.risk } : {}),
        ...(optional(item.lastVerified) ? { lastVerified: item.lastVerified } : {}),
      })),
      businessRules: project.knowledge.businessRules.map((item) => ({
        ...item,
        ...(optional(item.moduleId) ? { moduleId: item.moduleId } : {}),
      })),
    },
  });
}

import { naturalCompare, type CompiledProject, type Document } from '@toudocu/core';
import { PortalRouteSchema, type PortalRoute } from '@toudocu/contracts';

export type PortalEnvironment = 'static' | 'serve';

export interface PortalRouteOptions {
  environment?: PortalEnvironment;
  screenMapEnabled?: boolean;
  healthOutputPath?: string;
}

export interface PortalRouteRegistry {
  routes: readonly PortalRoute[];
  byPageId: ReadonlyMap<string, PortalRoute>;
  get(pageId: string): PortalRoute | undefined;
  href(pageId: string): string | undefined;
  outputPath(pageId: string): string | undefined;
}

export const portalRouteIds = {
  document: (sourcePath: string): `document:${string}` => `document:${sourcePath}`,
  task: (id: string): `task:${string}` => `task:${id}`,
  directory: (path: string): `directory:${string}` => `directory:${path}`,
} as const;

function route(
  pageId: string,
  kind: PortalRoute['kind'],
  outputPath: string,
  availability: PortalRoute['availability'],
): PortalRoute {
  return PortalRouteSchema.parse({
    pageId,
    href: availability === 'serve' && !outputPath.startsWith('/') ? `/${outputPath}` : outputPath,
    outputPath,
    kind,
    availability,
    serveOnly: availability === 'serve',
  });
}

function healthPath(project: CompiledProject, requested?: string): string {
  if (requested?.trim()) {
    return requested;
  }
  return project.index.healthOutputPath;
}

function documentPageAllowed(document: Document): boolean {
  if (
    document.sourcePath === 'index.md' ||
    document.sourcePath === 'roadmap.md' ||
    document.sourcePath === 'work/index.md' ||
    document.type === 'screen-index'
  ) {
    return false;
  }
  const directory = document.sourcePath.split('/')[0] ?? '';
  return !(
    document.fileName.toLowerCase() === 'index.md' &&
    ['use-cases', 'flows', 'quality', 'runbooks', 'drafts'].includes(directory)
  );
}

function collectRoutes(project: CompiledProject, options: PortalRouteOptions): PortalRoute[] {
  const routes: PortalRoute[] = [];
  const pageIds = new Set<string>();
  const outputOwners = new Map<string, string>();
  const add = (item: PortalRoute): void => {
    const outputKey = item.outputPath.toLowerCase();
    const previous = outputOwners.get(outputKey);
    if (pageIds.has(item.pageId)) {
      throw new Error(`duplicate portal page identifier: ${item.pageId}`);
    }
    if (previous) {
      throw new Error(`portal output path collision: ${previous} and ${item.pageId}`);
    }
    pageIds.add(item.pageId);
    outputOwners.set(outputKey, item.pageId);
    routes.push(item);
  };

  add(route('home', 'home', 'index.html', 'both'));
  add(route('not-found', 'not-found', '404.html', 'both'));
  const workItemsByDocument = new Map(
    project.knowledge.workItems.map((item) => [item.document, item]),
  );
  for (const document of project.index.documents) {
    if (!documentPageAllowed(document)) {
      continue;
    }
    const workItem = workItemsByDocument.get(document.sourcePath);
    add(
      workItem
        ? route(portalRouteIds.task(workItem.id), 'task', document.outputPath, 'both')
        : route(
            portalRouteIds.document(document.sourcePath),
            'document',
            document.outputPath,
            'both',
          ),
    );
  }
  if (project.projectChangelog) {
    add(route('changelog', 'changelog', project.projectChangelog.outputPath, 'both'));
  }
  if (project.knowledge.useCases.length > 0) {
    add(route('use-cases', 'catalog', 'use-cases/index.html', 'both'));
  }
  add(route('processes', 'processes', 'processes/index.html', 'both'));
  if (project.knowledge.screens.length > 0) {
    add(route('screens', 'catalog', 'screens/catalog.html', 'both'));
    add(route('traceability', 'traceability', 'traceability.html', 'both'));
    if (options.screenMapEnabled !== false) {
      add(route('screen-map', 'screen-map', 'screens/index.html', 'both'));
    }
  }
  const topLevelDirectories = new Set(
    [...project.index.directories].map((directory) => directory.split('/')[0] ?? ''),
  );
  for (const directory of ['quality', 'runbooks', 'drafts'] as const) {
    if (topLevelDirectories.has(directory)) {
      add(route(directory, 'catalog', `${directory}/index.html`, 'both'));
    }
  }
  if (project.index.byPath.has('roadmap.md')) {
    add(route('roadmap', 'roadmap', 'roadmap.html', 'both'));
  }
  add(route('health', 'health', healthPath(project, options.healthOutputPath), 'both'));
  add(route('report', 'report', 'report.json', 'both'));
  add(route('search', 'search', 'search.html', 'both'));
  if (topLevelDirectories.has('work') || project.knowledge.workItems.length > 0) {
    add(route('task-workspace', 'task-workspace', 'work/index.html', 'both'));
  }
  add(route('editor', 'editor', '/_toudocu/editor/', 'serve'));
  add(route('changes', 'changes', '/_toudocu/changes/', 'serve'));
  add(route('discussions', 'discussions', '/_toudocu/discussions/', 'serve'));
  add(route('api-docs', 'api-docs', '/_toudocu/api-docs/', 'serve'));

  const reservedDirectories = new Set([
    'use-cases',
    'flows',
    'quality',
    'runbooks',
    'drafts',
    'screens',
    'work',
  ]);
  for (const directory of [...project.index.directories].sort(naturalCompare)) {
    if (
      reservedDirectories.has(directory.split('/')[0] ?? '') ||
      project.index.byPath.has(`${directory}/index.md`)
    ) {
      continue;
    }
    add(route(portalRouteIds.directory(directory), 'catalog', `${directory}/index.html`, 'both'));
  }
  return routes;
}

export function buildPortalRouteRegistry(
  project: CompiledProject,
  options: PortalRouteOptions = {},
): PortalRouteRegistry {
  const environment = options.environment ?? 'static';
  const routes = collectRoutes(project, options).filter(
    (item) => item.availability === 'both' || item.availability === environment,
  );
  const byPageId = new Map(routes.map((item) => [item.pageId, item]));
  return {
    routes,
    byPageId,
    get: (pageId) => byPageId.get(pageId),
    href: (pageId) => byPageId.get(pageId)?.href,
    outputPath: (pageId) => byPageId.get(pageId)?.outputPath,
  };
}

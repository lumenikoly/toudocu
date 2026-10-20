import {
  PageViewV1Schema,
  PortalSearchEntrySchema,
  PortalSnapshotV1Schema,
  StaticPortalIndexV1Schema,
  type PageViewV1,
  type PortalSnapshotV1,
  type StaticPortalIndexV1,
} from '@toudocu/contracts';

export interface PortalDataSource {
  load(): Promise<PortalSnapshotV1>;
}

export type SearchPage = Extract<PageViewV1, { kind: 'search' }>;

async function requestJson(endpoint: string, request: typeof fetch): Promise<unknown> {
  const response = await request.call(globalThis, endpoint, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Portal request failed with status ${response.status}`);
  return response.json();
}

export class StaticRenderDataSource implements PortalDataSource {
  constructor(private readonly snapshot: PortalSnapshotV1) {}

  async load(): Promise<PortalSnapshotV1> {
    return PortalSnapshotV1Schema.parse(this.snapshot);
  }
}

export class StaticBrowserDataSource implements PortalDataSource {
  private index: StaticPortalIndexV1 | undefined;
  private endpoint = '';
  private readonly pages = new Map<string, Promise<PageViewV1>>();

  constructor(
    private readonly document: Document = globalThis.document,
    private readonly request: typeof fetch = globalThis.fetch,
  ) {}

  private loadPage(pageId: string): Promise<PageViewV1> {
    const cached = this.pages.get(pageId);
    if (cached) return cached;
    const route = this.index?.routes.find((candidate) => candidate.pageId === pageId);
    if (!route) return Promise.reject(new Error(`Portal route is missing: ${pageId}`));
    const pending = (async (): Promise<PageViewV1> => {
      // Filenames contain encoded IDs; escape the percent signs for HTTP URL decoding.
      const path =
        route.kind === 'search'
          ? 'search.json'
          : `pages/${encodeURIComponent(encodeURIComponent(pageId))}.json`;
      const value = await requestJson(new URL(path, this.endpoint).href, this.request);
      const page =
        route.kind === 'search'
          ? PageViewV1Schema.parse({
              kind: 'search',
              pageId,
              route,
              entries: PortalSearchEntrySchema.array().parse(value),
            })
          : PageViewV1Schema.parse(value);
      if (
        page.pageId !== pageId ||
        page.route.outputPath !== route.outputPath ||
        page.route.pageId !== pageId
      ) {
        throw new Error(`Portal page does not match its route: ${pageId}`);
      }
      return page;
    })();
    this.pages.set(pageId, pending);
    void pending.catch(() => {
      this.pages.delete(pageId);
    });
    return pending;
  }

  async loadSearch(): Promise<SearchPage> {
    const route = this.index?.routes.find((candidate) => candidate.kind === 'search');
    if (!route) throw new Error('Portal search route is missing');
    const page = await this.loadPage(route.pageId);
    if (page.kind !== 'search') throw new Error('Portal search page is invalid');
    return page;
  }

  async load(): Promise<PortalSnapshotV1> {
    try {
      const element = this.document.querySelector('#toudocu-portal-data');
      const path = element?.getAttribute('data-src');
      if (path) {
        this.endpoint = new URL(path, this.document.baseURI).href;
        this.index = StaticPortalIndexV1Schema.parse(
          await requestJson(this.endpoint, this.request),
        );
        const pageId = element?.getAttribute('data-page');
        if (!pageId) throw new Error('Portal page ID is missing');
        const ids = [...new Set([pageId, ...(this.index.pageDependencies[pageId] ?? [])])];
        const pages = await Promise.all(ids.map((id) => this.loadPage(id)));
        const { pageDependencies: _dependencies, ...shared } = this.index;
        return PortalSnapshotV1Schema.parse({ ...shared, kind: 'portal', pages });
      }
      const source = element?.textContent;
      if (!source?.trim()) throw new Error('Portal snapshot is missing');
      return PortalSnapshotV1Schema.parse(JSON.parse(source));
    } catch (cause) {
      throw new Error('Failed to load static portal snapshot', { cause });
    }
  }
}

export class ServeApiDataSource implements PortalDataSource {
  constructor(
    private readonly endpoint = '/_toudocu/api/portal',
    private readonly request: typeof fetch = globalThis.fetch,
  ) {}

  async load(): Promise<PortalSnapshotV1> {
    return PortalSnapshotV1Schema.parse(await requestJson(this.endpoint, this.request));
  }
}

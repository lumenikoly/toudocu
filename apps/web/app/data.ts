import { PortalSnapshotV1Schema, type PortalSnapshotV1 } from '@toudocu/contracts';

export interface PortalDataSource {
  load(): Promise<PortalSnapshotV1>;
}

export class StaticRenderDataSource implements PortalDataSource {
  constructor(private readonly snapshot: PortalSnapshotV1) {}

  async load(): Promise<PortalSnapshotV1> {
    return PortalSnapshotV1Schema.parse(this.snapshot);
  }
}

export class StaticBrowserDataSource implements PortalDataSource {
  constructor(private readonly document: Document = globalThis.document) {}

  async load(): Promise<PortalSnapshotV1> {
    const source = this.document.querySelector('#toudocu-portal-data')?.textContent;
    if (!source?.trim()) {
      throw new Error('Portal snapshot is missing');
    }
    return PortalSnapshotV1Schema.parse(JSON.parse(source));
  }
}

export class ServeApiDataSource implements PortalDataSource {
  constructor(
    private readonly endpoint = '/_toudocu/api/portal',
    private readonly request: typeof fetch = globalThis.fetch,
  ) {}

  async load(): Promise<PortalSnapshotV1> {
    const response = await this.request.call(globalThis, this.endpoint, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Portal request failed with status ${response.status}`);
    }
    return PortalSnapshotV1Schema.parse(await response.json());
  }
}

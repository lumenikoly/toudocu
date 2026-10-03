import type { PortalRoute, PortalSnapshotV1 } from '@toudocu/contracts';

export interface StaticAssetManifest {
  script: string;
  styles: readonly string[];
}

export interface StaticBundle {
  assetsDirectory: string;
  manifest: StaticAssetManifest;
}

export interface RenderRouteInput {
  route: PortalRoute;
  snapshot: PortalSnapshotV1;
  runtime: { mode: 'static'; locale: 'en' | 'ru' };
  assetManifest: StaticAssetManifest;
}

export interface RenderServeShellInput {
  locale: 'en' | 'ru';
  title: string;
  assetManifest: StaticAssetManifest;
}

export function renderRoute(input: RenderRouteInput): string;
export function renderServeShell(input: RenderServeShellInput): string;
export function loadStaticBundle(): Promise<StaticBundle>;

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import type { PortalRoute, PortalSnapshotV1 } from '@toudocu/contracts';
import { PortalApp } from '../app/root.js';
import { relativePortalHref } from '../app/routing.js';

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

interface ViteManifestEntry {
  file: string;
  css?: string[];
  isEntry?: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function json(value: unknown): string {
  return JSON.stringify(value).replace(/[<\u2028\u2029]/gu, (character) =>
    character === '<' ? '\\u003c' : `\\u${character.charCodeAt(0).toString(16)}`,
  );
}

export function renderRoute({ route, snapshot, runtime, assetManifest }: RenderRouteInput): string {
  const page = snapshot.pages.find((candidate) => candidate.pageId === route.pageId);
  if (!page) throw new Error(`portal page is missing for route ${route.pageId}`);
  const locale = runtime.locale;
  const initialPath = route.pageId === 'home' ? '/' : `/${route.href}`;
  const markup = renderToString(
    <PortalApp snapshot={snapshot} locale={locale} initialPath={initialPath} />,
  );
  const asset = (path: string): string => relativePortalHref(route.outputPath, path);
  const styles = assetManifest.styles
    .map((path) => `<link rel="stylesheet" href="${escapeHtml(asset(path))}">`)
    .join('');
  return `<!doctype html><html lang="${locale}" data-toudocu-mode="static" data-toudocu-route="${escapeHtml(route.href)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(snapshot.project.title)}</title>${styles}</head><body><div id="root" data-toudocu-prerendered="true">${markup}</div><script id="toudocu-portal-data" type="application/json">${json(snapshot)}</script><script type="module" src="${escapeHtml(asset(assetManifest.script))}"></script></body></html>`;
}

export function renderServeShell({ locale, title, assetManifest }: RenderServeShellInput): string {
  const styles = assetManifest.styles
    .map((path) => `<link rel="stylesheet" href="/${escapeHtml(path)}">`)
    .join('');
  return `<!doctype html><html lang="${locale}" data-toudocu-mode="serve" data-toudocu-base="/"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>${styles}</head><body><div id="root"></div><script type="module" src="/${escapeHtml(assetManifest.script)}"></script></body></html>`;
}

export async function loadStaticBundle(): Promise<StaticBundle> {
  const clientDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../client');
  const source = await readFile(resolve(clientDirectory, '.vite/manifest.json'), 'utf8');
  const manifest = JSON.parse(source) as Record<string, ViteManifestEntry>;
  const entry = Object.values(manifest).find((candidate) => candidate.isEntry);
  if (!entry) throw new Error('prebuilt portal client entry is missing');
  return {
    assetsDirectory: resolve(clientDirectory, 'assets'),
    manifest: {
      script: entry.file,
      styles: entry.css ?? [],
    },
  };
}

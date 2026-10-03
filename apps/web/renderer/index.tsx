import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import type { PortalRoute, PortalSnapshotV1 } from '@toudocu/contracts';
import { PortalApp } from '../app/root.js';
import { relativePortalHref } from '../app/routing.js';

const designContract = `<!--
THESIS: A project knowledge workbench, not a SaaS dashboard or landing page.
OWN-WORLD: An engineering control surface: neutral planes, a persistent command bar, monospace IDs, topology lines and semantic status marks.
STORY: Orient in the project, see active work, inspect the knowledge graph and move from entities into execution or Agent Console.
FIRST VIEWPORT: A two-row workspace header separates centered search and compact tools from navigation; the project tree stays left and the agent docks right.
FORM: User-pinned structured workbench, first and only eligible direction; seed37148608. Entity diagrams and centered reading surfaces separate identity, content and context.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

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
  const appearance = snapshot.appearance;
  const theme = appearance?.theme ?? 'classic';
  const colorScheme = appearance?.colorScheme ?? 'system';
  const accent = appearance?.accent ?? 'indigo';
  const density = appearance?.density ?? 'comfortable';
  return `<!doctype html><html lang="${locale}" data-toudocu-mode="static" data-toudocu-route="${escapeHtml(route.href)}" data-site-theme="${theme}" data-color-scheme="${colorScheme}" data-accent="${accent}" data-density="${density}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(snapshot.project.title)}</title>${styles}</head><body>${designContract}<div id="root" data-toudocu-prerendered="true">${markup}</div><script id="toudocu-portal-data" type="application/json">${json(snapshot)}</script><script type="module" src="${escapeHtml(asset(assetManifest.script))}"></script></body></html>`;
}

export function renderServeShell({ locale, title, assetManifest }: RenderServeShellInput): string {
  const styles = assetManifest.styles
    .map((path) => `<link rel="stylesheet" href="/${escapeHtml(path)}">`)
    .join('');
  return `<!doctype html><html lang="${locale}" data-toudocu-mode="serve" data-toudocu-base="/"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title>${styles}</head><body>${designContract}<div id="root"></div><script type="module" src="/${escapeHtml(assetManifest.script)}"></script></body></html>`;
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

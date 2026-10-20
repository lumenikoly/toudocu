import { copyFile, lstat, mkdir, mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve } from 'node:path';
import type { PortalRoute, PortalSnapshotV1, StaticPortalIndexV1 } from '@toudocu/contracts';
import { assertSafeOutput, isInside, isMissing } from './filesystem/path-policy.js';

export interface StaticAssetManifest {
  script: string;
  styles: readonly string[];
}

export interface StaticBuildOptions {
  outputDirectory: string;
  protectedRoots: readonly string[];
  clean?: boolean;
  snapshot: PortalSnapshotV1;
  report: unknown;
  locale: 'en' | 'ru';
  assetsDirectory: string;
  assetManifest: StaticAssetManifest;
  projectFiles?: ReadonlyMap<string, string>;
  signal?: AbortSignal;
  renderRoute(input: {
    route: PortalRoute;
    snapshot: PortalSnapshotV1;
    runtime: { mode: 'static'; locale: 'en' | 'ru' };
    assetManifest: StaticAssetManifest;
  }): string | Promise<string>;
}

export interface StaticBuildResult {
  outputDirectory: string;
  pages: number;
}

function outputPath(root: string, path: string): string {
  const target = resolve(root, path);
  if (!isInside(root, target)) throw new Error(`static output path escapes staging: ${path}`);
  return target;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function copyTree(source: string, destination: string, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`static build refuses symbolic link: ${source}`);
  if (info.isFile()) {
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
    return;
  }
  if (!info.isDirectory())
    throw new Error(`static build input is not a file or directory: ${source}`);
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source)) {
    await copyTree(join(source, entry), join(destination, entry), signal);
  }
}

async function writeOutput(root: string, path: string, content: string): Promise<void> {
  const target = outputPath(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

function formattedJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function staticIndex(snapshot: PortalSnapshotV1): StaticPortalIndexV1 {
  const { pages, ...shared } = snapshot;
  const pageDependencies: Record<string, string[]> = {};
  for (const page of pages) {
    if (page.kind !== 'document') continue;
    const useCase = snapshot.knowledge.useCases.find(
      (item) => item.id === page.document.id || item.document === page.document.sourcePath,
    );
    if (!useCase) continue;
    const flows = snapshot.knowledge.flows.filter(
      (flow) => flow.useCaseIds.includes(useCase.id) || useCase.flowIds.includes(flow.id),
    );
    pageDependencies[page.pageId] = pages
      .filter(
        (candidate) =>
          candidate.kind === 'screens' ||
          (candidate.kind === 'document' &&
            flows.some((flow) => flow.document === candidate.document.sourcePath)),
      )
      .map((candidate) => candidate.pageId);
  }
  return { ...shared, kind: 'static-portal-index', pageDependencies };
}

async function commit(staging: string, output: string): Promise<void> {
  if (!(await pathExists(output))) {
    await rename(staging, output);
    return;
  }
  const backup = `${output}.previous-${randomUUID()}`;
  await rename(output, backup);
  try {
    await rename(staging, output);
  } catch (error) {
    await rename(backup, output);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

export async function buildStaticPortal(options: StaticBuildOptions): Promise<StaticBuildResult> {
  const output = await assertSafeOutput(options.outputDirectory, options.protectedRoots);
  if ((await pathExists(output)) && !(await lstat(output)).isDirectory()) {
    throw new Error('static output must be a directory');
  }
  await mkdir(dirname(output), { recursive: true });
  const staging = await mkdtemp(join(dirname(output), `.${basename(output)}.staging-`));
  let published = false;
  try {
    if (!options.clean && (await pathExists(output))) {
      await copyTree(output, staging, options.signal);
    }
    options.signal?.throwIfAborted();
    // These namespaces belong to the generator, including obsolete JSON and hashed assets.
    await rm(outputPath(staging, '_toudocu'), { recursive: true, force: true });
    await rm(outputPath(staging, 'assets'), { recursive: true, force: true });
    for (const [path, source] of options.projectFiles ?? []) {
      await copyTree(source, outputPath(staging, path), options.signal);
    }
    await copyTree(options.assetsDirectory, outputPath(staging, 'assets'), options.signal);
    await writeOutput(staging, 'report.json', formattedJson(options.report));
    await writeOutput(
      staging,
      '_toudocu/portal.json',
      JSON.stringify(staticIndex(options.snapshot)),
    );
    const search = options.snapshot.pages.find((page) => page.kind === 'search');
    await writeOutput(staging, '_toudocu/search.json', JSON.stringify(search?.entries ?? []));
    let pages = 0;
    for (const page of options.snapshot.pages) {
      options.signal?.throwIfAborted();
      const html = await options.renderRoute({
        route: page.route,
        snapshot: options.snapshot,
        runtime: { mode: 'static', locale: options.locale },
        assetManifest: options.assetManifest,
      });
      await writeOutput(staging, page.route.outputPath, html);
      if (page.kind !== 'search') {
        await writeOutput(
          staging,
          `_toudocu/pages/${encodeURIComponent(page.pageId)}.json`,
          JSON.stringify(page),
        );
      }
      pages += 1;
    }
    options.signal?.throwIfAborted();
    await commit(staging, output);
    published = true;
    return { outputDirectory: output, pages };
  } finally {
    if (!published) await rm(staging, { recursive: true, force: true });
  }
}

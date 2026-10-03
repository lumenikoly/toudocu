import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rm } from 'node:fs/promises';
import { get } from 'node:http';
import { homedir, hostname } from 'node:os';
import { join, resolve } from 'node:path';
import {
  ProjectWorkspaceV1Schema,
  ServeInstanceIdentityV1Schema,
  ToudocuError,
  type ProjectWorkspaceV1,
} from '@toudocu/contracts';
import { isInside, resolveForSafety } from './filesystem/path-policy.js';
import { contentDigest } from './filesystem/write.js';

const byteLimit = 16 * 1024;
const probeTimeoutMs = 500;

export interface ServeInstanceOptions {
  projectRoot: string;
  documentationRoot: string;
  stateHome?: string;
  signal?: AbortSignal;
}

export interface RegisteredServeInstance {
  workspace: ProjectWorkspaceV1;
  unregister(): Promise<void>;
}

function stateHome(options: ServeInstanceOptions): string {
  if (options.stateHome?.trim()) return resolve(options.stateHome);
  if (process.env.TOUDOCU_STATE_HOME?.trim()) return resolve(process.env.TOUDOCU_STATE_HOME);
  if (process.platform === 'win32' && process.env.LOCALAPPDATA?.trim())
    return resolve(process.env.LOCALAPPDATA);
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support');
  return resolve(process.env.XDG_STATE_HOME?.trim() || join(homedir(), '.local', 'state'));
}

async function registry(options: ServeInstanceOptions) {
  options.signal?.throwIfAborted();
  const [projectRoot, documentationRoot] = await Promise.all([
    realpath(options.projectRoot),
    realpath(options.documentationRoot),
  ]);
  options.signal?.throwIfAborted();
  const directory = await resolveForSafety(
    join(
      stateHome(options),
      'toudocu',
      'serve-instances',
      contentDigest(hostname()),
      contentDigest(JSON.stringify([projectRoot, documentationRoot])),
    ),
  );
  if (isInside(projectRoot, directory) || isInside(documentationRoot, directory))
    throw new ToudocuError('invalid_path', 'Serve instance state must be outside the project.');
  return { directory, projectRoot, documentationRoot };
}

/** Register only after listen succeeds. Each server owns one private, atomic record. */
export async function registerServeInstance(
  options: ServeInstanceOptions & { instanceId: string; url: string },
): Promise<RegisteredServeInstance> {
  const { directory, projectRoot, documentationRoot } = await registry(options);
  const address = new URL(ProjectWorkspaceV1Schema.shape.url.parse(options.url));
  if (address.hostname === '0.0.0.0') address.hostname = '127.0.0.1';
  if (address.hostname === '[::]') address.hostname = '[::1]';
  const workspace = ProjectWorkspaceV1Schema.parse({
    instanceId: options.instanceId,
    projectRoot,
    documentationRoot,
    url: address.origin,
  });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  options.signal?.throwIfAborted();
  const path = join(directory, `${workspace.instanceId}.json`);
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(JSON.stringify(workspace));
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    options.signal?.throwIfAborted();
    await rename(temporary, path);
  } finally {
    await handle.close();
    await rm(temporary, { force: true });
  }
  return { workspace, unregister: () => rm(path, { force: true }) };
}

/** Files and HTTP responses are bounded; every failed or stale candidate is ignored. */
export async function discoverServeInstance(
  options: ServeInstanceOptions,
): Promise<ProjectWorkspaceV1 | null> {
  try {
    const roots = await registry(options);
    const names = await readdir(roots.directory);
    options.signal?.throwIfAborted();
    // Probe concurrently so stale instances do not multiply the discovery timeout.
    const candidates = await Promise.all(
      names
        .filter((name) => /^[\da-f-]+\.json$/i.test(name))
        .sort()
        .map(async (name): Promise<ProjectWorkspaceV1 | null> => {
          try {
            options.signal?.throwIfAborted();
            const path = join(roots.directory, name);
            if (!(await lstat(path)).isFile()) return null;
            const handle = await open(path, 'r');
            let value: unknown;
            try {
              const buffer = Buffer.alloc(byteLimit + 1);
              const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
              if (bytesRead > byteLimit) return null;
              value = JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')) as unknown;
            } finally {
              await handle.close();
            }
            options.signal?.throwIfAborted();
            const parsed = ProjectWorkspaceV1Schema.safeParse(value);
            if (!parsed.success) return null;
            const workspace = parsed.data;
            if (
              workspace.projectRoot !== roots.projectRoot ||
              workspace.documentationRoot !== roots.documentationRoot ||
              name !== `${workspace.instanceId}.json`
            )
              return null;
            return (await probe(workspace, options.signal)) ? workspace : null;
          } catch {
            options.signal?.throwIfAborted();
            return null;
          }
        }),
    );
    options.signal?.throwIfAborted();
    return candidates.find((candidate) => candidate !== null) ?? null;
  } catch {
    options.signal?.throwIfAborted();
    return null;
  }
}

function probe(workspace: ProjectWorkspaceV1, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolveProbe, reject) => {
    signal?.throwIfAborted();
    const request = get(new URL('/_toudocu/api/instance', workspace.url), {
      agent: false,
      ...(signal ? { signal } : {}),
    });
    const timer = setTimeout(() => request.destroy(), probeTimeoutMs);
    const finish = (valid: boolean): void => {
      clearTimeout(timer);
      request.destroy();
      if (signal?.aborted) reject(signal.reason);
      else resolveProbe(valid);
    };
    request.on('error', () => finish(false));
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        response.destroy();
        finish(false);
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > byteLimit) {
          response.destroy();
          finish(false);
        } else chunks.push(chunk);
      });
      response.on('error', () => finish(false));
      response.on('end', () => {
        try {
          const identity = ServeInstanceIdentityV1Schema.parse(
            JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          );
          finish(
            identity.instanceId === workspace.instanceId &&
              identity.projectRoot === workspace.projectRoot &&
              identity.documentationRoot === workspace.documentationRoot,
          );
        } catch {
          finish(false);
        }
      });
    });
  });
}

import {
  buildSkillPlan,
  deduplicateSkillTargets,
  type SkillPlan,
  type SkillPlanInput,
  type SkillSnapshot,
  type SkillTarget,
} from '@toudocu/core';
import {
  SkillManifestSchema,
  ToudocuError,
  type SkillFileChecksum,
  type SkillManifest,
  type SkillOperation,
  type SkillScope,
  type SkillState,
} from '@toudocu/contracts';
import { loadSkillBundle, type SkillBundle } from '@toudocu/skills';
import { publishNoReplace } from './native-helper.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const manifestName = '.toudocu-skill.json';
const agents = [
  { name: 'codex', project: '.agents/skills/toudocu', user: '.agents/skills/toudocu' },
  { name: 'claude-code', project: '.claude/skills/toudocu', user: '.claude/skills/toudocu' },
  { name: 'copilot', project: '.github/skills/toudocu', user: '.copilot/skills/toudocu' },
] as const;

export interface SkillTargetOptions {
  agent: string;
  scope: SkillScope;
  repositoryRoot: string;
  home: string;
}

export interface SkillBundleRuntime extends SkillBundle {
  metadata: {
    id: string;
    version: string;
    checksum: string;
    files: readonly SkillFileChecksum[];
  };
}

export interface SkillResult {
  plan: SkillPlan;
  state: SkillState;
  code?: string;
  error?: string;
}

export async function loadRuntimeSkillBundle(): Promise<SkillBundleRuntime> {
  const bundle = await loadSkillBundle();
  return {
    ...bundle,
    metadata: {
      id: bundle.id,
      version: bundle.version,
      checksum: bundle.checksum,
      files: bundle.files.map((file) => ({
        path: file.path,
        sha256: checksum(file.data),
      })),
    },
  };
}

export function resolveSkillTargets(options: SkillTargetOptions): SkillTarget[] {
  const selected =
    options.agent === 'all' ? agents : agents.filter((item) => item.name === options.agent);
  if (selected.length === 0) {
    throw new ToudocuError(
      'SKILL_AGENT_INVALID',
      `unsupported agent ${JSON.stringify(options.agent)}`,
    );
  }
  const boundary = resolve(options.scope === 'user' ? options.home : options.repositoryRoot);
  return deduplicateSkillTargets(
    selected.map((agent) => ({
      agent: agent.name,
      scope: options.scope,
      boundary,
      path: resolve(boundary, options.scope === 'user' ? agent.user : agent.project),
    })),
  );
}

export async function findSkillProjectRoot(
  repositoryRoot: string | undefined,
  currentDirectory: string,
): Promise<string> {
  if (repositoryRoot !== undefined) {
    return resolve(repositoryRoot);
  }
  let current = resolve(currentDirectory);
  for (;;) {
    try {
      await lstat(join(current, '.git'));
      return current;
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(currentDirectory);
    }
    current = parent;
  }
}

export async function detectSkillAgents(
  repositoryRoot: string,
  home: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  const result: string[] = [];
  for (const agent of agents) {
    const hasEnvironment =
      (agent.name === 'codex' && Boolean(environment.CODEX_HOME)) ||
      (agent.name === 'claude-code' &&
        Boolean(environment.CLAUDE_CONFIG_DIR || environment.CLAUDE_CODE_ENTRYPOINT)) ||
      (agent.name === 'copilot' && Boolean(environment.GITHUB_COPILOT));
    const directories =
      agent.name === 'copilot'
        ? [resolve(repositoryRoot, '.github')]
        : [resolve(home, agent.name === 'codex' ? '.codex' : '.claude')];
    if (hasEnvironment || (await awaitsDirectory(directories))) {
      result.push(agent.name);
    }
  }
  return result;
}

async function awaitsDirectory(directories: readonly string[]): Promise<boolean> {
  for (const directory of directories) {
    try {
      const info = await stat(directory);
      if (info.isDirectory()) {
        return true;
      }
    } catch {
      continue;
    }
  }
  return false;
}

export async function inspectSkillTarget(
  target: SkillTarget,
  bundle: SkillBundleRuntime,
): Promise<SkillSnapshot> {
  const unsafe = await validateTarget(target);
  if (unsafe !== undefined) {
    return { state: 'unsafe-path', fingerprint: '', detail: unsafe };
  }
  let info;
  try {
    info = await lstat(target.path);
  } catch (error) {
    if (isMissing(error)) {
      return { state: 'not-installed', fingerprint: 'missing' };
    }
    throw error;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    return { state: 'unsafe-path', fingerprint: '', detail: 'target is not a regular directory' };
  }
  const scanned = await scanSkillTree(target.path);
  if (scanned.unsafe) {
    return {
      state: 'modified',
      fingerprint: scanned.fingerprint,
      detail: 'managed file set contains a symlink or non-regular file',
    };
  }
  const manifestFile = scanned.files.get(manifestName);
  if (!manifestFile) {
    return {
      state: 'unmanaged',
      fingerprint: scanned.fingerprint,
      detail: 'management manifest is absent',
    };
  }
  if (!modeMatches(manifestFile.mode, 0o644)) {
    return {
      state: 'modified',
      fingerprint: scanned.fingerprint,
      detail: 'management manifest mode changed',
    };
  }
  let manifest: SkillManifest;
  try {
    if (manifestFile.data.byteLength > 2 << 20) {
      throw new Error('manifest exceeds size limit');
    }
    manifest = parseManifest(manifestFile.data);
    validateManifest(manifest, target, bundle);
  } catch (error) {
    return {
      state: 'invalid-manifest',
      fingerprint: scanned.fingerprint,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  const files = new Map(scanned.files);
  files.delete(manifestName);
  const declared = new Map(manifest.files.map((file) => [file.path, file.sha256]));
  if (files.size !== declared.size) {
    return {
      state: 'modified',
      fingerprint: scanned.fingerprint,
      manifest,
      detail: 'managed file set changed',
    };
  }
  for (const [path, file] of files) {
    const expectedMode = path.startsWith('scripts/') ? 0o755 : 0o644;
    if (declared.get(path) !== checksum(file.data) || !modeMatches(file.mode, expectedMode)) {
      return {
        state: 'modified',
        fingerprint: scanned.fingerprint,
        manifest,
        detail: 'managed file content changed',
      };
    }
  }
  const comparison = compareVersions(manifest.skillVersion, bundle.version);
  if (comparison > 0) {
    return { state: 'newer-than-bundle', fingerprint: scanned.fingerprint, manifest };
  }
  if (
    comparison < 0 ||
    manifest.bundleChecksum !== bundle.checksum ||
    !matchesBundle(manifest, bundle)
  ) {
    return { state: 'outdated', fingerprint: scanned.fingerprint, manifest };
  }
  return { state: 'installed', fingerprint: scanned.fingerprint, manifest };
}

export async function buildSkillPlanForTarget(
  operation: SkillOperation,
  target: SkillTarget,
  bundle: SkillBundleRuntime,
): Promise<SkillPlanInput> {
  return {
    operation,
    target,
    before: await inspectSkillTarget(target, bundle),
    bundle: bundle.metadata,
  };
}

export async function planSkillTarget(
  operation: SkillOperation,
  target: SkillTarget,
  bundle: SkillBundleRuntime,
): Promise<SkillPlan> {
  return buildSkillPlan(await buildSkillPlanForTarget(operation, target, bundle));
}

export async function executeSkillPlan(
  input: SkillPlanInput,
  bundle: SkillBundleRuntime,
  cliVersion: string,
): Promise<SkillResult> {
  const plan = buildSkillPlan(input);
  if (plan.conflict || plan.action === 'none') {
    return { plan, state: plan.before.state, ...(plan.code ? { code: plan.code } : {}) };
  }
  const current = await inspectSkillTarget(plan.target, bundle);
  if (current.state !== plan.before.state || current.fingerprint !== plan.before.fingerprint) {
    return {
      plan,
      state: current.state,
      code: 'SKILL_TARGET_CHANGED',
      error: 'target changed after planning',
    };
  }
  try {
    if (plan.action === 'create') {
      await installNew(plan.target, bundle, cliVersion);
    } else if (plan.action === 'replace') {
      await replaceManaged(plan.target, bundle, cliVersion, plan.before);
    } else {
      await removeManaged(plan.target, plan.before, bundle);
    }
  } catch (error) {
    return {
      plan,
      state: plan.before.state,
      code: errorCode(error),
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return {
    plan,
    state:
      plan.action === 'remove'
        ? 'not-installed'
        : (await inspectSkillTarget(plan.target, bundle)).state,
  };
}

async function installNew(
  target: SkillTarget,
  bundle: SkillBundleRuntime,
  cliVersion: string,
): Promise<void> {
  const stage = await prepareStage(target, bundle, cliVersion);
  try {
    await publishStage(stage, target.path);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function replaceManaged(
  target: SkillTarget,
  bundle: SkillBundleRuntime,
  cliVersion: string,
  before: SkillSnapshot,
): Promise<void> {
  const stage = await prepareStage(target, bundle, cliVersion);
  const backup = `${target.path}.backup-${randomUUID()}`;
  try {
    try {
      await rename(target.path, backup);
    } catch (error) {
      throw new ToudocuError('SKILL_BACKUP_FAILED', 'could not move the current skill aside', {
        cause: error,
      });
    }
    const backupSnapshot = await inspectSkillTarget({ ...target, path: backup }, bundle);
    if (
      backupSnapshot.state !== before.state ||
      backupSnapshot.fingerprint !== before.fingerprint
    ) {
      await restoreBackup(target.path, backup);
      throw new ToudocuError('SKILL_PUBLISH_FAILED', 'target changed while creating backup');
    }
    try {
      await publishStage(stage, target.path);
    } catch (error) {
      await restoreBackup(target.path, backup);
      throw error;
    }
    try {
      await rm(backup, { recursive: true, force: true });
    } catch (error) {
      throw new ToudocuError(
        'SKILL_BACKUP_CLEANUP_FAILED',
        `new copy installed; backup retained at ${backup}`,
        { cause: error },
      );
    }
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

async function removeManaged(
  target: SkillTarget,
  before: SkillSnapshot,
  bundle: SkillBundleRuntime,
): Promise<void> {
  const backup = `${target.path}.backup-${randomUUID()}`;
  try {
    await rename(target.path, backup);
  } catch (error) {
    throw new ToudocuError('SKILL_BACKUP_FAILED', 'could not move the current skill aside', {
      cause: error,
    });
  }
  const snapshot = await inspectSkillTarget({ ...target, path: backup }, bundle);
  if (snapshot.state !== before.state || snapshot.fingerprint !== before.fingerprint) {
    await restoreBackup(target.path, backup);
    throw new ToudocuError('SKILL_PUBLISH_FAILED', 'target changed while creating backup');
  }
  try {
    await rm(backup, { recursive: true, force: true });
  } catch (error) {
    throw new ToudocuError(
      'SKILL_UNINSTALL_FAILED',
      `installation moved to backup ${backup} but could not be removed`,
      { cause: error },
    );
  }
}

async function prepareStage(
  target: SkillTarget,
  bundle: SkillBundleRuntime,
  cliVersion: string,
): Promise<string> {
  await mkdir(dirname(target.path), { recursive: true });
  const unsafe = await validateTarget(target);
  if (unsafe !== undefined) {
    throw new ToudocuError('SKILL_PATH_UNSAFE', unsafe);
  }
  const stage = join(
    dirname(target.path),
    `.${target.path.split(sep).pop()}.stage-${randomUUID()}`,
  );
  await mkdir(stage);
  try {
    for (const file of bundle.files) {
      const destination = join(stage, ...file.path.split('/'));
      await mkdir(dirname(destination), { recursive: true });
      const handle = await open(destination, 'wx', file.mode);
      try {
        await handle.writeFile(file.data);
        await handle.chmod(file.mode);
      } finally {
        await handle.close();
      }
    }
    const manifest = createManifest(bundle, target, cliVersion);
    await writeFile(join(stage, manifestName), `${JSON.stringify(manifest, null, 2)}\n`, {
      mode: 0o644,
      flag: 'wx',
    });
    return stage;
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function publishStage(stage: string, target: string): Promise<void> {
  try {
    publishNoReplace(stage, target);
  } catch (error) {
    throw new ToudocuError(
      'SKILL_PUBLISH_FAILED',
      error instanceof Error ? error.message : String(error),
      { cause: error },
    );
  }
}

async function restoreBackup(target: string, backup: string): Promise<void> {
  if (await exists(target)) {
    throw new ToudocuError(
      'SKILL_RESTORE_FAILED',
      `backup retained at ${backup} because target is occupied`,
    );
  }
  try {
    await rename(backup, target);
  } catch (error) {
    throw new ToudocuError('SKILL_RESTORE_FAILED', `backup retained at ${backup}`, {
      cause: error,
    });
  }
}

async function validateTarget(target: SkillTarget): Promise<string | undefined> {
  let boundary: string;
  try {
    boundary = resolve(target.boundary);
    const info = await lstat(boundary);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      return 'boundary is not a regular directory';
    }
  } catch (error) {
    return isMissing(error) ? 'boundary is unavailable' : String(error);
  }
  const targetPath = resolve(target.path);
  const rel = relative(boundary, targetPath);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`) || rel === '.') {
    return 'target escapes or equals its boundary';
  }
  let current = boundary;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        return `symlink in target path: ${current}`;
      }
    } catch (error) {
      if (isMissing(error)) {
        break;
      }
      return String(error);
    }
  }
  return undefined;
}

async function scanSkillTree(root: string): Promise<{
  fingerprint: string;
  files: Map<string, { data: Uint8Array; mode: number }>;
  unsafe: boolean;
}> {
  const hash = createHash('sha256');
  const files = new Map<string, { data: Uint8Array; mode: number }>();
  let unsafe = false;
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      const info = await lstat(absolute);
      hash.update(`${path}\0${info.mode.toString(8)}\0`);
      if (info.isSymbolicLink()) {
        unsafe = true;
        continue;
      }
      if (info.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!info.isFile()) {
        unsafe = true;
        continue;
      }
      const data = await readFile(absolute);
      files.set(path, { data, mode: info.mode & 0o777 });
      hash.update(data);
      hash.update('\0');
    }
  };
  await visit(root);
  return { fingerprint: hash.digest('hex'), files, unsafe };
}

function parseManifest(data: Uint8Array): SkillManifest {
  try {
    return SkillManifestSchema.parse(JSON.parse(new TextDecoder().decode(data)));
  } catch {
    throw new Error('manifest is not valid schema v1 JSON');
  }
}

function validateManifest(
  manifest: SkillManifest,
  target: SkillTarget,
  bundle: SkillBundleRuntime,
): void {
  if (
    manifest.skillId !== bundle.id ||
    manifest.agent !== target.agent ||
    manifest.scope !== target.scope ||
    manifest.bundleChecksum === '' ||
    !parseVersion(manifest.skillVersion) ||
    !parseVersion(manifest.cliVersion)
  ) {
    throw new Error('manifest identity does not match target');
  }
  let previous = '';
  for (const file of manifest.files) {
    if (
      file.path <= previous ||
      !file.path ||
      file.path.startsWith('/') ||
      file.path.includes('\\') ||
      file.path.split('/').some((part) => !part || part === '.' || part === '..') ||
      !/^[0-9a-f]{64}$/u.test(file.sha256)
    ) {
      throw new Error('manifest contains an invalid or unsorted file table');
    }
    previous = file.path;
  }
}

function createManifest(
  bundle: SkillBundleRuntime,
  target: SkillTarget,
  cliVersion: string,
): SkillManifest {
  const files: SkillFileChecksum[] = bundle.files
    .map((file) => ({ path: file.path, sha256: checksum(file.data) }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return {
    schemaVersion: 1,
    managedBy: 'toudocu',
    skillId: bundle.id,
    skillVersion: bundle.version,
    cliVersion,
    agent: target.agent,
    scope: target.scope,
    bundleChecksum: bundle.checksum,
    files,
  };
}

function matchesBundle(manifest: SkillManifest, bundle: SkillBundleRuntime): boolean {
  if (manifest.files.length !== bundle.files.length) {
    return false;
  }
  return manifest.files.every((file, index) => {
    const bundled = bundle.files[index];
    return (
      bundled !== undefined && file.path === bundled.path && file.sha256 === checksum(bundled.data)
    );
  });
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) {
    return 0;
  }
  for (let index = 0; index < a.length; index += 1) {
    const leftPart = a[index]!;
    const rightPart = b[index]!;
    if (leftPart < rightPart) {
      return -1;
    }
    if (leftPart > rightPart) {
      return 1;
    }
  }
  return 0;
}

function parseVersion(value: string): [number, number, number] | undefined {
  const parts = value.split('.');
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^\d+$/u.test(part) || (part.length > 1 && part.startsWith('0')))
  ) {
    return undefined;
  }
  const numbers = parts.map(Number);
  if (numbers.some((part) => !Number.isSafeInteger(part))) {
    return undefined;
  }
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

function checksum(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function modeMatches(actual: number, expected: number): boolean {
  if (process.platform === 'win32') {
    return (actual & 0o222) !== 0;
  }
  return actual === expected;
}

function errorCode(error: unknown): string {
  if (error instanceof ToudocuError) {
    return error.code;
  }
  return 'SKILL_OPERATION_FAILED';
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { AgentPreferenceSchema, type AgentPreference, ToudocuError } from '@toudocu/contracts';

interface PreferenceFile {
  version: 1;
  roots: Record<string, AgentPreference>;
}

export class AgentPreferenceStore {
  readonly #path: string;
  readonly #rootKey: Promise<string>;

  constructor(repositoryRoot: string, configDirectory = defaultConfigDirectory()) {
    this.#path = join(configDirectory, 'agent-preferences.json');
    this.#rootKey = canonicalKey(repositoryRoot);
  }

  async load(): Promise<AgentPreference> {
    const fallback: AgentPreference = { launchPreset: 'default' };
    try {
      const file = JSON.parse(await readFile(this.#path, 'utf8')) as unknown;
      if (!isPreferenceFile(file)) return fallback;
      return AgentPreferenceSchema.safeParse(file.roots[await this.#rootKey]).data ?? fallback;
    } catch {
      return fallback;
    }
  }

  async save(preference: AgentPreference): Promise<void> {
    const valid = AgentPreferenceSchema.safeParse(preference);
    if (!valid.success) {
      throw new ToudocuError('agent_preference_invalid', 'invalid agent preference');
    }
    const file = await this.#readForUpdate();
    file.roots[await this.#rootKey] = valid.data;
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${process.pid}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(file), { mode: 0o600 });
      await rename(temporary, this.#path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async #readForUpdate(): Promise<PreferenceFile> {
    try {
      const file = JSON.parse(await readFile(this.#path, 'utf8')) as unknown;
      if (isPreferenceFile(file)) return file;
    } catch {
      // A missing or invalid file is replaced only after an explicit save.
    }
    return { version: 1, roots: {} };
  }
}

function defaultConfigDirectory(): string {
  const base =
    process.env.XDG_CONFIG_HOME ??
    (process.platform === 'win32' ? process.env.APPDATA : undefined) ??
    join(homedir(), '.config');
  return join(base, 'toudocu');
}

async function canonicalKey(repositoryRoot: string): Promise<string> {
  const absolute = resolve(repositoryRoot);
  const canonical = await realpath(absolute).catch(() => absolute);
  return createHash('sha256').update(canonical).digest('hex');
}

function isPreferenceFile(value: unknown): value is PreferenceFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<PreferenceFile>;
  return file.version === 1 && Boolean(file.roots) && typeof file.roots === 'object';
}

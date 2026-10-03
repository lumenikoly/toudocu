import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const skillID = 'toudocu';
export const skillVersion = '0.0.7';

const maxFileSize = 2 << 20;
const maxBundleSize = 10 << 20;

export interface SkillBundleFile {
  path: string;
  data: Uint8Array;
  mode: number;
}

export interface SkillBundle {
  id: string;
  version: string;
  files: readonly SkillBundleFile[];
  checksum: string;
}

export async function loadSkillBundle(root = defaultSkillRoot()): Promise<SkillBundle> {
  const files: SkillBundleFile[] = [];
  const seen = new Set<string>();
  const folded = new Map<string, string>();
  let total = 0;

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).replaceAll('\\', '/');
      if (entry.isSymbolicLink()) {
        throw new Error(`invalid embedded skill path ${JSON.stringify(path)}`);
      }
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`invalid embedded skill file ${JSON.stringify(path)}`);
      }
      const clean = path;
      const lower = clean.toLowerCase();
      if (seen.has(clean) || (folded.has(lower) && folded.get(lower) !== clean)) {
        throw new Error(`invalid embedded skill path ${JSON.stringify(clean)}`);
      }
      seen.add(clean);
      folded.set(lower, clean);
      const info = await lstat(absolute);
      if (!info.isFile() || info.size > maxFileSize) {
        throw new Error(`invalid embedded skill file ${JSON.stringify(clean)}`);
      }
      total += info.size;
      if (total > maxBundleSize) {
        throw new Error('embedded skill exceeds size limit');
      }
      const data = await readFile(absolute);
      const mode = clean === 'scripts' || clean.startsWith('scripts/') ? 0o755 : 0o644;
      files.push({ path: clean, data, mode });
    }
  };

  await visit(resolve(root));
  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const skill = files.find((file) => file.path === 'SKILL.md');
  if (!skill || !frontMatterName(skill.data, skillID)) {
    throw new Error(`embedded SKILL.md must declare name: ${skillID}`);
  }
  const checksum = createHash('sha256');
  for (const file of files) {
    checksum.update(`${file.path}\0${file.mode}\0`);
    checksum.update(file.data);
    checksum.update('\0');
  }
  return { id: skillID, version: skillVersion, files, checksum: checksum.digest('hex') };
}

function defaultSkillRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const packagedRoot = join(moduleDirectory, 'toudocu');
  if (existsSync(packagedRoot)) {
    return packagedRoot;
  }
  if (moduleDirectory.endsWith(`${sep}src`)) {
    return resolve(moduleDirectory, '../../../skills/toudocu');
  }
  return packagedRoot;
}

function frontMatterName(data: Uint8Array, expected: string): boolean {
  const lines = new TextDecoder().decode(data).split('\n');
  if (lines.length < 3 || lines[0]?.trim() !== '---') {
    return false;
  }
  for (const line of lines.slice(1)) {
    if (line.trim() === '---') {
      break;
    }
    const separator = line.indexOf(':');
    if (separator < 0 || line.slice(0, separator).trim() !== 'name') {
      continue;
    }
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/gu, '');
    return value === expected;
  }
  return false;
}

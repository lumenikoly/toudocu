import { afterEach, expect, test } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  executeSkillPlan,
  inspectSkillTarget,
  loadRuntimeSkillBundle,
  planSkillTarget,
} from './skills.js';
import { publishNoReplace } from './native-helper.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test('installs, detects local changes, updates, and uninstalls a managed skill', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-skills-'));
  temporary.push(root);
  const bundle = await loadRuntimeSkillBundle();
  const target = {
    agent: 'codex',
    scope: 'project' as const,
    boundary: root,
    path: join(root, '.agents', 'skills', 'toudocu'),
  };

  const initial = await planSkillTarget('install', target, bundle);
  const installed = await executeSkillPlan(
    { operation: 'install', target, before: initial.before, bundle: initial.bundle },
    bundle,
    '0.0.7',
  );
  expect(installed.state).toBe('installed');
  expect(await inspectSkillTarget(target, bundle)).toMatchObject({ state: 'installed' });

  await writeFile(join(target.path, 'local.txt'), 'keep');
  const modified = await planSkillTarget('update', target, bundle);
  expect(modified).toMatchObject({ conflict: true, code: 'SKILL_LOCAL_CHANGES' });
  expect(await readFile(join(target.path, 'local.txt'), 'utf8')).toBe('keep');

  await rm(join(target.path, 'local.txt'));
  const manifestPath = join(target.path, '.toudocu-skill.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { skillVersion: string };
  manifest.skillVersion = '0.0.0';
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
  const outdated = await planSkillTarget('update', target, bundle);
  expect(outdated.before.state).toBe('outdated');
  const updated = await executeSkillPlan(
    { operation: 'update', target, before: outdated.before, bundle: outdated.bundle },
    bundle,
    '0.0.7',
  );
  expect(updated.state).toBe('installed');

  const removed = await executeSkillPlan(
    {
      operation: 'uninstall',
      target,
      before: (await planSkillTarget('uninstall', target, bundle)).before,
      bundle: outdated.bundle,
    },
    bundle,
    '0.0.7',
  );
  expect(removed.state).toBe('not-installed');
});

test('blocks unmanaged, newer, invalid, and unsafe targets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-skills-'));
  temporary.push(root);
  const bundle = await loadRuntimeSkillBundle();
  const target = {
    agent: 'codex',
    scope: 'project' as const,
    boundary: root,
    path: join(root, '.agents', 'skills', 'toudocu'),
  };

  await mkdir(target.path, { recursive: true });
  await writeFile(join(target.path, 'local.txt'), 'keep');
  const unmanaged = await planSkillTarget('install', target, bundle);
  expect(unmanaged).toMatchObject({ conflict: true, code: 'SKILL_UNMANAGED' });

  await rm(target.path, { recursive: true, force: true });
  const initial = await planSkillTarget('install', target, bundle);
  await executeSkillPlan(
    { operation: 'install', target, before: initial.before, bundle: initial.bundle },
    bundle,
    '0.0.7',
  );
  const manifestPath = join(target.path, '.toudocu-skill.json');
  const newerManifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    skillVersion: string;
  };
  newerManifest.skillVersion = '9.0.0';
  await writeFile(manifestPath, `${JSON.stringify(newerManifest)}\n`);
  const newer = await planSkillTarget('install', target, bundle);
  expect(newer).toMatchObject({ conflict: true, code: 'SKILL_DOWNGRADE_BLOCKED' });

  await writeFile(manifestPath, '{not-json');
  const invalid = await planSkillTarget('update', target, bundle);
  expect(invalid).toMatchObject({ conflict: true, code: 'SKILL_MANIFEST_INVALID' });

  await rm(target.path, { recursive: true, force: true });
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-outside-'));
  temporary.push(outside);
  await symlink(outside, target.path);
  const unsafe = await planSkillTarget('install', target, bundle);
  expect(unsafe).toMatchObject({ conflict: true, code: 'SKILL_PATH_UNSAFE' });
});

test('publishes a staged directory without replacing an existing target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-skills-'));
  temporary.push(root);
  const stage = join(root, 'stage');
  const target = join(root, 'target');
  await mkdir(stage);
  await writeFile(join(stage, 'value.txt'), 'first');

  publishNoReplace(stage, target);
  expect(await readFile(join(target, 'value.txt'), 'utf8')).toBe('first');

  const secondStage = join(root, 'second-stage');
  await mkdir(secondStage);
  await writeFile(join(secondStage, 'value.txt'), 'second');
  expect(() => publishNoReplace(secondStage, target)).toThrow();
  expect(await readFile(join(target, 'value.txt'), 'utf8')).toBe('first');
});

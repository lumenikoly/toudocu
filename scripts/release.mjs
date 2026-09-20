#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const platformPackage = join(repositoryRoot, 'packages', 'platform-node');
const requireFromPlatform = createRequire(join(platformPackage, 'package.json'));
const targets = [
  'linux-x64',
  'linux-arm64',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
  'win32-arm64',
];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || !process.argv[index + 1]) {
    if (fallback) return resolve(fallback);
    throw new Error(`missing --${name}`);
  }
  return resolve(process.argv[index + 1]);
}

async function releaseVersion() {
  const index = process.argv.indexOf('--version');
  const manifest = JSON.parse(
    await readFile(join(repositoryRoot, 'apps', 'cli', 'package.json'), 'utf8'),
  );
  const value = index === -1 ? manifest.version : process.argv[index + 1];
  if (!value || !/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/u.test(value)) {
    throw new Error('missing or invalid --version');
  }
  return value;
}

async function copyDirectory(source, destination) {
  await cp(source, destination, { recursive: true, force: true, dereference: true });
}

async function collectNative(outputRoot) {
  const target = `${process.platform}-${process.arch}`;
  if (!targets.includes(target)) {
    throw new Error(`unsupported release target: ${target}`);
  }

  const output = join(outputRoot, target);
  const helper = join(platformPackage, 'native', 'build', target, 'toudocu-native.node');
  const nodePty = dirname(requireFromPlatform.resolve('node-pty/package.json'));
  const prebuild = join(nodePty, 'prebuilds', target);
  const localBuild = join(nodePty, 'build', 'Release');

  await rm(output, { recursive: true, force: true });
  await mkdir(join(output, 'node-pty'), { recursive: true });
  await copyFile(helper, join(output, 'toudocu-native.node'));
  await copyDirectory(
    (await isDirectory(prebuild)) ? prebuild : localBuild,
    join(output, 'node-pty'),
  );
  await writeFile(join(output, 'target.json'), `${JSON.stringify({ target })}\n`);
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function verifyNativeArtifacts(nativeRoot) {
  for (const target of targets) {
    const metadata = JSON.parse(await readFile(join(nativeRoot, target, 'target.json'), 'utf8'));
    if (metadata.target !== target) {
      throw new Error(`native artifact mismatch for ${target}`);
    }
    await stat(join(nativeRoot, target, 'toudocu-native.node'));
    await stat(join(nativeRoot, target, 'node-pty', 'pty.node'));
  }
}

async function findPackages(root) {
  const found = [];
  const pending = [root];
  const visited = new Set();

  while (pending.length > 0) {
    const directory = pending.pop();
    const real = await realpath(directory);
    if (visited.has(real)) continue;
    visited.add(real);

    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name === 'package.json') {
        found.push(path);
      } else if (entry.isDirectory() || entry.isSymbolicLink()) {
        pending.push(path);
      }
    }
  }
  return found;
}

async function licenseText(packageDirectory) {
  const entries = await readdir(packageDirectory);
  const license = entries.find((entry) => /^(?:licen[cs]e|copying)(?:\.|$)/iu.test(entry));
  return license ? readFile(join(packageDirectory, license), 'utf8') : undefined;
}

async function generateNotices(stage) {
  const lockfile = await readFile(join(repositoryRoot, 'pnpm-lock.yaml'));
  const packages = new Map();

  for (const manifestPath of await findPackages(join(stage, 'node_modules'))) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (!manifest.name || !manifest.version || manifest.name.startsWith('@toudocu/')) continue;
    const key = `${manifest.name}@${manifest.version}`;
    if (packages.has(key)) continue;
    packages.set(key, {
      key,
      license: manifest.license ?? 'UNKNOWN',
      text: await licenseText(dirname(manifestPath)),
    });
  }

  const sections = [...packages.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(
      ({ key, license, text }) =>
        `## ${key}\n\nLicense: ${license}\n${text ? `\n${text.trim()}\n` : ''}`,
    );
  const digest = createHash('sha256').update(lockfile).digest('hex');
  return `# Third-party notices\n\nGenerated from pnpm-lock.yaml (${digest}) and the deployed runtime dependency graph.\n\n${sections.join('\n')}\n`;
}

async function injectNativeArtifacts(stage, nativeRoot) {
  const platformNode = join(stage, 'node_modules', '@toudocu', 'platform-node');
  const nodePty = join(stage, 'node_modules', 'node-pty');

  for (const target of targets) {
    const source = join(nativeRoot, target);
    await copyDirectory(join(source, 'node-pty'), join(nodePty, 'prebuilds', target));
    await mkdir(join(platformNode, 'native', 'prebuilds', target), { recursive: true });
    await copyFile(
      join(source, 'toudocu-native.node'),
      join(platformNode, 'native', 'prebuilds', target, 'toudocu-native.node'),
    );
  }
}

async function bundledManifest(stage, version) {
  const dependencies = {};

  for (const path of await topLevelPackageManifests(stage)) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    dependencies[manifest.name] = manifest.version;
  }

  return {
    name: 'toudocu',
    version,
    description: 'Documentation-as-code CLI and local portal',
    license: 'Apache-2.0',
    type: 'module',
    bin: { toudocu: 'dist/main.js' },
    engines: { node: '>=24' },
    dependencies,
    bundledDependencies: Object.keys(dependencies),
  };
}

async function topLevelPackageManifests(stage) {
  return packageManifests(join(stage, 'node_modules'));
}

async function packageManifests(nodeModules) {
  const manifests = [];
  for (const entry of await readdir(nodeModules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    if (!entry.name.startsWith('@')) {
      manifests.push(join(nodeModules, entry.name, 'package.json'));
      continue;
    }
    for (const child of await readdir(join(nodeModules, entry.name), { withFileTypes: true })) {
      if (child.isDirectory()) {
        manifests.push(join(nodeModules, entry.name, child.name, 'package.json'));
      }
    }
  }
  return manifests;
}

async function flattenDependencies(stage) {
  const nodeModules = join(stage, 'node_modules');
  const hoisted = join(nodeModules, '.pnpm', 'node_modules');
  const rootManifest = JSON.parse(await readFile(join(stage, 'package.json'), 'utf8'));

  for (const manifestPath of await packageManifests(hoisted)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (manifest.name === rootManifest.name) continue;
    await copyDirectory(dirname(manifestPath), join(nodeModules, ...manifest.name.split('/')));
  }
  await rm(join(nodeModules, '.pnpm'), { recursive: true, force: true });
}

async function rewriteWorkspaceDependencies(stage) {
  const versions = new Map();
  const manifests = [];

  for (const path of await findPackages(join(stage, 'node_modules'))) {
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (!isInstalledPackageManifest(path, manifest.name)) continue;
    if (manifest.name.startsWith('@toudocu/')) versions.set(manifest.name, manifest.version);
    manifests.push({ path, manifest });
  }
  for (const { path, manifest } of manifests) {
    for (const field of ['dependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        const version = versions.get(dependency);
        if (version) manifest[field][dependency] = version;
      }
    }
    manifest.bundledDependencies = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ];
    await replaceFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function isInstalledPackageManifest(path, name) {
  if (typeof name !== 'string' || !name) return false;
  const suffix = ['node_modules', ...name.split('/'), 'package.json'];
  const segments = path.split('/');
  return suffix.every((part, index) => part === segments[segments.length - suffix.length + index]);
}

async function replaceFile(path, contents) {
  const replacement = `${path}.release`;
  await writeFile(replacement, contents);
  await rename(replacement, path);
}

async function createTarball(sourceName, parent, destination, prefix, excludes = []) {
  await mkdir(dirname(destination), { recursive: true });
  execFileSync(
    'tar',
    [
      '--dereference',
      '--hard-dereference',
      '--sort=name',
      '--mtime=@0',
      '--owner=0',
      '--group=0',
      ...excludes.map((path) => `--exclude=${path}`),
      '-czf',
      destination,
      '-C',
      parent,
      '--transform',
      `s,^${sourceName},${prefix},`,
      sourceName,
    ],
    { stdio: 'inherit' },
  );
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function buildRelease(nativeRoot, output, version) {
  await verifyNativeArtifacts(nativeRoot);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const temporary = await mkdtemp(join(tmpdir(), 'toudocu-release-'));
  const deployed = join(temporary, 'deployed');
  const stage = join(temporary, 'package');
  const workspaceStatePath = join(repositoryRoot, 'node_modules', '.pnpm-workspace-state-v1.json');
  const workspaceState = await readFile(workspaceStatePath).catch(() => undefined);
  try {
    try {
      execFileSync('pnpm', ['--filter', 'toudocu-ts', 'deploy', '--prod', '--legacy', deployed], {
        cwd: repositoryRoot,
        stdio: 'inherit',
      });
    } finally {
      if (workspaceState) await replaceFile(workspaceStatePath, workspaceState);
      else await rm(workspaceStatePath, { force: true });
    }
    await copyDirectory(deployed, stage);
    await flattenDependencies(stage);
    await injectNativeArtifacts(stage, nativeRoot);
    await rewriteWorkspaceDependencies(stage);
    await rm(join(stage, 'node_modules', '.bin'), { recursive: true, force: true });
    await copyFile(join(repositoryRoot, 'LICENSE'), join(stage, 'LICENSE'));
    await writeFile(join(stage, 'THIRD_PARTY_NOTICES.md'), await generateNotices(stage));
    await replaceFile(
      join(stage, 'package.json'),
      `${JSON.stringify(await bundledManifest(stage, version), null, 2)}\n`,
    );
    await chmod(join(stage, 'dist', 'main.js'), 0o755);

    const npmTarball = join(output, `toudocu-${version}.tgz`);
    await createTarball('package', temporary, npmTarball, 'package');

    for (const target of targets) {
      const excludedTargets = targets.filter((candidate) => candidate !== target);
      await createTarball(
        'package',
        temporary,
        join(output, `toudocu-${target}.tar.gz`),
        'toudocu',
        excludedTargets.flatMap((excluded) => [
          `package/node_modules/node-pty/prebuilds/${excluded}`,
          `package/node_modules/@toudocu/platform-node/native/prebuilds/${excluded}`,
        ]),
      );
    }
    await copyFile(join(repositoryRoot, 'scripts', 'install.sh'), join(output, 'install.sh'));
    await copyFile(join(repositoryRoot, 'scripts', 'install.ps1'), join(output, 'install.ps1'));

    const assets = (await readdir(output)).filter((name) => name !== 'checksums.txt').sort();
    const checksums = await Promise.all(
      assets.map(async (name) => `${await sha256(join(output, name))}  ${name}`),
    );
    await writeFile(join(output, 'checksums.txt'), `${checksums.join('\n')}\n`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function smokeTest(packagePath) {
  const temporary = await mkdtemp(join(tmpdir(), 'toudocu-install-'));
  try {
    execFileSync('npm', ['install', '--prefix', temporary, packagePath], {
      stdio: 'inherit',
    });
    const executable = join(
      temporary,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'toudocu.cmd' : 'toudocu',
    );
    execFileSync(executable, ['version'], { cwd: temporary, stdio: 'inherit' });

    const testScript = `
      import { mkdtemp, writeFile } from 'node:fs/promises';
      import { tmpdir } from 'node:os';
      import { join } from 'node:path';
      import { execFileSync } from 'node:child_process';
      const platform = await import('./node_modules/toudocu/node_modules/@toudocu/platform-node/dist/index.js');
      const { ProjectTerminal, tryLockReviewFile, unlockReviewFile } = platform;
      const root = await mkdtemp(join(tmpdir(), 'toudocu-release-smoke-'));
      await writeFile(join(root, 'file.txt'), 'ok');
      execFileSync('git', ['init', '--quiet'], { cwd: root });
      const lock = tryLockReviewFile(join(root, 'review.md'));
      if (!lock) throw new Error('native lock unavailable');
      unlockReviewFile(lock);
      const terminal = new ProjectTerminal(root);
      const exit = new Promise((resolve) => terminal.subscribe((event) => {
        if (event.type === 'exit') resolve();
      }));
      terminal.start();
      terminal.write('exit\\n');
      await exit;
    `;
    const smokePath = join(temporary, 'release-smoke.mjs');
    await writeFile(smokePath, testScript);
    execFileSync(process.execPath, [smokePath], {
      cwd: temporary,
      stdio: 'inherit',
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const command = process.argv[2];
if (command === 'collect-native') {
  await collectNative(option('output'));
} else if (command === 'package') {
  await buildRelease(option('native-root'), option('output'), await releaseVersion());
} else if (command === 'smoke') {
  const version = await releaseVersion();
  await smokeTest(
    option('package', join(repositoryRoot, 'dist', 'release', `toudocu-${version}.tgz`)),
  );
} else {
  throw new Error(`unknown release command: ${command ?? '(missing)'}`);
}

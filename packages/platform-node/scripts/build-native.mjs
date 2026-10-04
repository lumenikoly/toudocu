import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDirectory = fileURLToPath(new URL('..', import.meta.url));
const sourcePath = join(packageDirectory, 'native', 'review_lock.c');
const platformDirectory = `${process.platform}-${process.arch}`;
const outputDirectory = join(packageDirectory, 'native', 'build', platformDirectory);
const outputPath = join(outputDirectory, 'toudocu-native.node');
const require = createRequire(import.meta.url);

function nodeIncludeDirectory() {
  const candidates = [
    process.env.NODE_INCLUDE_DIR,
    join(dirname(process.execPath), '..', 'include', 'node'),
    '/usr/include/node',
  ].filter((candidate) => candidate);
  const includeDirectory = candidates.find((candidate) =>
    existsSync(join(candidate, 'node_api.h')),
  );
  if (!includeDirectory) {
    throw new Error('could not find node_api.h; set NODE_INCLUDE_DIR to the Node headers');
  }
  return includeDirectory;
}

function compilerArguments(includeDirectory) {
  if (process.platform === 'darwin') {
    return [
      '-bundle',
      '-undefined',
      'dynamic_lookup',
      '-I',
      includeDirectory,
      '-o',
      outputPath,
      sourcePath,
    ];
  }
  return ['-shared', '-fPIC', '-I', includeDirectory, '-o', outputPath, sourcePath];
}

function compilerCommand() {
  return process.env.CC || 'cc';
}

if (process.platform === 'win32') {
  execFileSync(process.execPath, [require.resolve('node-gyp/bin/node-gyp.js'), 'rebuild'], {
    cwd: join(packageDirectory, 'native'),
    stdio: 'inherit',
  });
  mkdirSync(outputDirectory, { recursive: true });
  copyFileSync(
    join(packageDirectory, 'native', 'build', 'Release', 'toudocu-native.node'),
    outputPath,
  );
} else {
  mkdirSync(outputDirectory, { recursive: true });
  execFileSync(compilerCommand(), compilerArguments(nodeIncludeDirectory()), {
    cwd: packageDirectory,
    stdio: 'inherit',
  });
}

if (process.platform === 'darwin') {
  const ptyRoot = dirname(require.resolve('node-pty/package.json'));
  for (const directory of [
    join(ptyRoot, 'prebuilds', platformDirectory),
    join(ptyRoot, 'build', 'Release'),
  ]) {
    const helper = join(directory, 'spawn-helper');
    if (existsSync(helper)) chmodSync(helper, 0o755);
  }
}

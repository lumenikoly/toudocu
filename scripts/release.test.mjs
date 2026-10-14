import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  injectNativeArtifacts,
  npmInvocation,
  smokeTest,
  verifyNativeArtifacts,
} from './release.mjs';

async function nativeFixture(root) {
  const nativeRoot = join(root, 'native');
  for (const target of ['linux-x64', 'darwin-arm64', 'win32-x64']) {
    const directory = join(nativeRoot, target);
    await mkdir(join(directory, 'node-pty'), { recursive: true });
    await writeFile(join(directory, 'target.json'), JSON.stringify({ target }));
    await writeFile(join(directory, 'toudocu-native.node'), `helper-${target}`);
    await writeFile(join(directory, 'node-pty', 'pty.node'), `pty-${target}`);
  }
  const helper = join(nativeRoot, 'darwin-arm64', 'node-pty', 'spawn-helper');
  await writeFile(helper, '#!/bin/sh\nexit 0\n');
  await chmod(helper, 0o644);
  await writeFile(join(nativeRoot, 'win32-x64', 'node-pty', 'conpty.node'), 'conpty');
  return { nativeRoot, helper };
}

function smokeExecutor(failure) {
  const calls = [];
  const execute = (file, args, options) => {
    calls.push({ file, args, options });
    if (calls.length === 1) {
      const temporary = args[args.indexOf('--prefix') + 1];
      const bin = join(temporary, 'node_modules', '.bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(
        join(bin, process.platform === 'win32' ? 'toudocu.cmd' : 'toudocu'),
        'This launcher must not be executed directly.\n',
      );
    } else if (args[0].endsWith('release-smoke.mjs') && failure) {
      throw failure;
    }
  };
  return { calls, execute };
}

test('Windows npm uses its JavaScript entrypoint without a command shell', () => {
  const args = ['install', '--prefix', 'C:\\Runner Name\\temp', 'C:\\packages\\a & b.tgz'];
  const invocation = npmInvocation(args, 'win32');
  assert.equal(invocation.file, process.execPath);
  assert.deepEqual(invocation.args, [
    join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ...args,
  ]);
  assert.equal(invocation.shell, undefined);
});

test('POSIX npm keeps its normal executable and argument boundaries', () => {
  const args = ['install', '--prefix', '/tmp/path with spaces', '/tmp/a & b.tgz'];
  for (const platform of ['linux', 'darwin']) {
    assert.deepEqual(npmInvocation(args, platform), { file: 'npm', args });
  }
});

test(
  'packaging restores macOS spawn-helper permissions after artifact download',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'toudocu-native-artifacts-'));
    try {
      const { nativeRoot, helper } = await nativeFixture(root);
      await verifyNativeArtifacts(nativeRoot);
      const stage = join(root, 'package');
      await injectNativeArtifacts(stage, nativeRoot);
      const nodePty = join(stage, 'node_modules', 'node-pty', 'prebuilds');
      const packagedHelper = join(nodePty, 'darwin-arm64', 'spawn-helper');
      assert.equal((await stat(packagedHelper)).mode & 0o777, 0o755);
      assert.equal(await readFile(packagedHelper, 'utf8'), await readFile(helper, 'utf8'));
      assert.equal((await stat(helper)).mode & 0o777, 0o644);
      assert.equal(await readFile(join(nodePty, 'linux-x64', 'pty.node'), 'utf8'), 'pty-linux-x64');
      assert.equal(await readFile(join(nodePty, 'win32-x64', 'conpty.node'), 'utf8'), 'conpty');
      assert.equal(
        await readFile(
          join(
            stage,
            'node_modules',
            '@toudocu',
            'platform-node',
            'native',
            'prebuilds',
            'darwin-arm64',
            'toudocu-native.node',
          ),
          'utf8',
        ),
        'helper-darwin-arm64',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('native artifact validation requires the macOS spawn helper', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-native-artifacts-'));
  try {
    const { nativeRoot, helper } = await nativeFixture(root);
    await rm(helper);
    await assert.rejects(verifyNativeArtifacts(nativeRoot), { code: 'ENOENT', path: helper });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('invalid native metadata aborts release validation rather than being ignored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-native-artifacts-'));
  try {
    const { nativeRoot } = await nativeFixture(root);
    await writeFile(join(nativeRoot, 'linux-x64', 'target.json'), '{invalid');
    await assert.rejects(verifyNativeArtifacts(nativeRoot), SyntaxError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('smoke runs the installed CLI through Node and still exercises the PTY', async () => {
  const { calls, execute } = smokeExecutor();
  await smokeTest('/tmp/package with spaces & punctuation.tgz', (file, args, options) => {
    execute(file, args, options);
    if (args[0].endsWith('release-smoke.mjs')) {
      const script = readFileSync(args[0], 'utf8');
      assert.match(script, /terminal\.start\(\)/);
      assert(
        script.includes("terminal.write(process.platform === 'win32' ? 'exit\\r' : 'exit\\n')"),
      );
      assert.match(script, /tryLockReviewFile\(/);
    }
  });
  assert.equal(calls.length, 3);
  const temporary = calls[0].args[calls[0].args.indexOf('--prefix') + 1];
  assert.deepEqual(calls[1], {
    file: process.execPath,
    args: [join(temporary, 'node_modules', 'toudocu', 'dist', 'main.js'), 'version'],
    options: { cwd: temporary, stdio: 'inherit' },
  });
  assert.equal(calls[2].file, process.execPath);
  assert.deepEqual(calls[2].args, [join(temporary, 'release-smoke.mjs')]);
  assert(calls.every(({ options }) => options.shell === undefined));
  await assert.rejects(stat(temporary), { code: 'ENOENT' });
});

test('smoke propagates PTY failures and cleans its temporary installation', async () => {
  const failure = new Error('terminal_spawn_failed');
  const { calls, execute } = smokeExecutor(failure);
  await assert.rejects(smokeTest('/tmp/package.tgz', execute), failure);
  const temporary = calls[0].args[calls[0].args.indexOf('--prefix') + 1];
  assert.equal(calls.length, 3);
  await assert.rejects(stat(temporary), { code: 'ENOENT' });
});

test('the standalone release CLI still rejects unknown commands', () => {
  const script = fileURLToPath(new URL('./release.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown release command: unknown/);
});

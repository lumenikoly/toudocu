import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
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

function installedSmokeExecutor(echoOnly = false) {
  const mock = smokeExecutor();
  const execute = (file, args, options) => {
    mock.execute(file, args, options);
    const prefixIndex = args.indexOf('--prefix');
    if (prefixIndex !== -1) {
      const temporary = args[prefixIndex + 1];
      const platform = join(
        temporary,
        'node_modules',
        'toudocu',
        'node_modules',
        '@toudocu',
        'platform-node',
      );
      mkdirSync(join(platform, 'dist'), { recursive: true });
      writeFileSync(join(platform, 'package.json'), '{"type":"module"}');
      writeFileSync(
        join(platform, 'dist', 'index.js'),
        String.raw`
        import assert from 'node:assert/strict';
        import { Worker } from 'node:worker_threads';
        const echoOnly = ${echoOnly};
        if (echoOnly) {
          const schedule = globalThis.setTimeout;
          globalThis.setTimeout = (callback, milliseconds, ...args) =>
            schedule(callback, milliseconds === 30_000 ? 25 : milliseconds, ...args);
        }
        export const tryLockReviewFile = () => ({});
        export const unlockReviewFile = () => {};
        export class ProjectTerminal {
          #listeners = new Set();
          #active = false;
          #worker;
          subscribe(listener) {
            this.#listeners.add(listener);
            return () => this.#listeners.delete(listener);
          }
          #output(data) {
            for (const listener of this.#listeners)
              listener({ type: 'output', data: Buffer.from(data).toString('base64') });
          }
          #exit() {
            for (const listener of this.#listeners) listener({ type: 'exit' });
          }
          start() {
            this.#active = true;
            this.#worker = new Worker('setInterval(() => {}, 1000)', { eval: true });
          }
          write(data) {
            if (data.startsWith('exit')) {
              // Mirror node-pty's natural-exit leak: exit arrives, but the worker stays alive.
              this.#active = false;
              this.#exit();
              return;
            }
            const marker = process.env.TOUDOCU_RELEASE_SMOKE_MARKER;
            assert.equal(typeof marker, 'string');
            assert(!data.includes(marker), 'input echo must not contain the expected output');
            this.#output(data);
            if (!echoOnly) {
              this.#output(marker.slice(0, 15));
              this.#output(marker.slice(15));
            }
          }
          snapshot() { return { active: this.#active }; }
          async close() {
            if (!this.#active) return;
            this.#active = false;
            await this.#worker.terminate();
            console.log('[fixture] Worker closed.');
            this.#exit();
          }
        }
      `,
      );
    } else if (args[0].endsWith('release-smoke.mjs')) {
      const temporary = join(options.cwd, 'tmp');
      mkdirSync(temporary);
      return execFileSync(file, args, {
        ...options,
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 3_000,
        env: { ...process.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary },
      });
    }
  };
  return { calls: mock.calls, execute };
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
      assert.match(script, /terminal\.write\(command\)/);
      assert.match(script, /await terminal\.close\(\)/);
      assert.match(script, /PTY command timed out/);
      assert.match(script, /tryLockReviewFile\(/);
    }
  });
  assert.equal(calls.length, 3);
  assert(calls[0].args.includes('--no-audit'));
  assert(calls[0].args.includes('--no-fund'));
  assert.deepEqual(
    calls.map(({ options }) => options.timeout),
    [600_000, 30_000, 60_000],
  );
  assert(calls.every(({ options }) => options.killSignal === 'SIGKILL'));
  const temporary = calls[0].args[calls[0].args.indexOf('--prefix') + 1];
  assert.deepEqual(calls[1], {
    file: process.execPath,
    args: [join(temporary, 'node_modules', 'toudocu', 'dist', 'main.js'), 'version'],
    options: { cwd: temporary, stdio: 'inherit', timeout: 30_000, killSignal: 'SIGKILL' },
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

test('native smoke verifies command output and closes the worker before exiting', async () => {
  const { calls, execute } = installedSmokeExecutor();
  let output;
  await smokeTest('/tmp/package.tgz', (file, args, options) => {
    const result = execute(file, args, options);
    if (args[0].endsWith('release-smoke.mjs')) output = result;
  });
  assert.match(output, /PTY command verified/);
  assert.match(output, /\[fixture\] Worker closed/);
  assert.match(output, /PTY closed/);
  const temporary = calls[0].args[calls[0].args.indexOf('--prefix') + 1];
  await assert.rejects(stat(temporary), { code: 'ENOENT' });
});

test('native smoke times out on input echo alone and still closes its worker', async () => {
  const { calls, execute } = installedSmokeExecutor(true);
  await assert.rejects(smokeTest('/tmp/package.tgz', execute), (error) => {
    assert.equal(error.status, 1);
    assert.match(String(error.stderr), /PTY command timed out/);
    assert.match(String(error.stdout), /\[fixture\] Worker closed/);
    return true;
  });
  const temporary = calls[0].args[calls[0].args.indexOf('--prefix') + 1];
  await assert.rejects(stat(temporary), { code: 'ENOENT' });
});

test('the standalone release CLI still rejects unknown commands', () => {
  const script = fileURLToPath(new URL('./release.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, 'unknown'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown release command: unknown/);
});

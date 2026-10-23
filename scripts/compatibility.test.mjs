import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normalizeHtml } from '../fixtures/compatibility-html.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const root = dirname(scripts);
const harness = join(scripts, 'compatibility.mjs');
const mismatch = join(root, 'fixtures', 'candidate-mismatch.mjs');
const sideEffect = join(root, 'fixtures', 'candidate-side-effect.mjs');
const invalidDigest = join(root, 'fixtures', 'candidate-invalid-digest.mjs');
const candidateVersion = join(root, 'fixtures', 'candidate-version.mjs');
const candidateTaskReport = join(root, 'fixtures', 'candidate-task-report.mjs');

function run(candidate, name, environment = { PATH: '' }) {
  return spawnSync(process.execPath, [harness, '--candidate', candidate, '--case', name], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

test('candidate-only mode needs no Go and catches stdout, stderr, and exit mismatches', () => {
  const result = run(mismatch, 'version');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL version/);
});

test('plain version output uses the allowed generator-version normalization', () => {
  const result = run(candidateVersion, 'version');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /compatibility corpus passed/);
});

test('task verification ignores the Go toolchain version and platform but preserves command output mismatches', () => {
  for (const stdout of [
    'go version go1.24.13 linux/amd64\n',
    'go version go1.25.0 windows/amd64\r\n',
  ]) {
    const result = run(candidateTaskReport, 'task-verify-run', { COMPAT_GO_STDOUT: stdout });
    assert.equal(result.status, 0, result.stderr);
  }
  const mismatch = run(candidateTaskReport, 'task-verify-run', {
    COMPAT_GO_STDOUT: 'unexpected output\n',
  });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /FAIL task-verify-run/);
});

test('compatibility catches a candidate side effect', () => {
  const result = run(sideEffect, 'task-init');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL task-init/);
});

test('default TypeScript candidate verifies the generated route set without Go', () => {
  const result = spawnSync(process.execPath, [harness, '--case', 'static-routes'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok static-routes/);
});

test('HTML fingerprints ignore bundle names but preserve markup and asset kinds', () => {
  const html =
    '<h1>Portal</h1><script src="./assets/index-abc.js"></script><link href="assets/index-abc.css">';
  const rebuilt = html.replaceAll('index-abc', 'index-other');
  assert.equal(normalizeHtml(html), normalizeHtml(rebuilt));
  assert.notEqual(normalizeHtml(html), normalizeHtml(html.replace('Portal', 'Broken')));
  assert.notEqual(normalizeHtml(html), normalizeHtml(html.replace('.css', '.js')));
});

test('read-only serve probe succeeds with the intentionally absent version endpoint', () => {
  const result = spawnSync(process.execPath, [harness, '--case', 'serve-read-only'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ok serve-read-only/);
});

test('change reports reject a digest that does not match its fields', () => {
  const result = run(invalidDigest, 'changes-staged', { PATH: process.env.PATH });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /changeSetDigest/);
});

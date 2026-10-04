import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const entrypoint = 'apps/cli/dist/main.js';

test('temporary TypeScript CLI exposes migrated commands', () => {
  const version = spawnSync(process.execPath, [entrypoint, 'version'], { encoding: 'utf8' });
  assert.equal(version.status, 0);
  assert.equal(version.stdout, '0.0.7\n');
  assert.equal(version.stderr, '');

  const help = spawnSync(process.execPath, [entrypoint, 'check', '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Validates structure, links, IDs/);
  assert.equal(help.stderr, '');
  const serve = spawnSync(process.execPath, [entrypoint, 'serve', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(serve.status, 0);
  assert.match(serve.stdout, /Serves the React portal/);
  assert.equal(serve.stderr, '');
});

function git(project, args) {
  const result = spawnSync('git', ['-C', project, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CLI test',
      GIT_AUTHOR_EMAIL: 'cli@example.test',
      GIT_COMMITTER_NAME: 'CLI test',
      GIT_COMMITTER_EMAIL: 'cli@example.test',
    },
  });
  assert.equal(result.status, 0, result.stderr);
}

function changesFixture() {
  const temporary = mkdtempSync(join(tmpdir(), 'toudocu-cli-changes-'));
  const project = join(temporary, 'project');
  cpSync('fixtures/projects/compat-basic', project, { recursive: true });
  git(project, ['init', '-q']);
  git(project, ['add', '.']);
  git(project, ['commit', '-q', '-m', 'baseline']);
  const index = join(project, 'docs', 'index.md');
  writeFileSync(index, `${readFileSync(index, 'utf8')}\nCLI staged change.\n`);
  git(project, ['add', 'docs/index.md']);
  return { project, temporary };
}

function runChanges(args) {
  return spawnSync(process.execPath, [entrypoint, ...args], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

test('temporary TypeScript CLI reports staged changes in every read-only format', () => {
  const { project, temporary } = changesFixture();
  try {
    const common = [
      'changes',
      join(project, 'docs'),
      '--repository-root',
      project,
      '--base',
      'HEAD',
      '--target',
      'index',
    ];
    const json = runChanges([...common, '--format', 'json']);
    assert.equal(json.status, 0, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.equal(report.changes.length, 1);
    assert.equal(report.changes[0].path, 'docs/index.md');

    const text = runChanges(common);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /Documentation changes/);

    const markdown = runChanges([...common, '--format', 'markdown']);
    assert.equal(markdown.status, 0, markdown.stderr);
    assert.match(markdown.stdout, /^# Documentation changes/m);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('temporary TypeScript CLI supports changes file, task changes, output, and validation', () => {
  const { project, temporary } = changesFixture();
  try {
    const file = runChanges([
      'changes',
      'file',
      'docs/index.md',
      join(project, 'docs'),
      '--repository-root',
      project,
      '--base',
      'HEAD',
      '--target',
      'index',
      '--format',
      'json',
    ]);
    assert.equal(file.status, 0, file.stderr);
    assert.equal(JSON.parse(file.stdout).changes.length, 1);

    const task = runChanges([
      'task',
      'changes',
      'TASK-COMPAT-001',
      join(project, 'docs'),
      '--repository-root',
      project,
      '--base',
      'HEAD',
      '--target',
      'index',
      '--format',
      'json',
    ]);
    assert.equal(task.status, 0, task.stderr);
    assert.ok(JSON.parse(task.stdout).taskImpact);

    const output = join(temporary, 'reports', 'changes.json');
    const saved = runChanges([
      'changes',
      join(project, 'docs'),
      '--repository-root',
      project,
      '--base',
      'HEAD',
      '--target',
      'index',
      '--format',
      'json',
      '--output',
      output,
    ]);
    assert.equal(saved.status, 0, saved.stderr);
    assert.equal(saved.stdout, `Report saved: ${output}\n`);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).changes.length, 1);

    const missingFile = runChanges(['changes', 'file']);
    assert.equal(missingFile.status, 2);
    assert.match(missingFile.stderr, /usage: toudocu changes file PATH/);

    const badBase = runChanges([
      'changes',
      join(project, 'docs'),
      '--repository-root',
      project,
      '--base',
      'missing-revision',
      '--target',
      'index',
      '--format',
      'json',
    ]);
    assert.equal(badBase.status, 2, badBase.stderr);
    assert.equal(badBase.stdout, '');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

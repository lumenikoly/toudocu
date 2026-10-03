import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { ToudocuClient } from '../src/toudocu/client.js';
import { runProcess } from '../src/toudocu/process.js';

const contractVersion = 1;
const capabilities = [
  'project-info',
  'task-candidates',
  'task-list',
  'task-context',
  'task-ready',
  'task-changes',
  'task-verify',
  'search',
  'changes',
  'check',
];

function reports(root: string, overrides: Record<string, unknown> = {}) {
  return {
    capabilities: {
      schemaVersion: 1,
      version: '2.5.0',
      cliContractVersion: contractVersion,
      capabilities,
      ...((overrides.capabilities as object | undefined) ?? {}),
    },
    project: {
      schemaVersion: 1,
      projectRoot: root,
      documentationRoot: join(root, 'docs'),
      configPath: join(root, '.toudocu/config.yml'),
      project: { id: basename(root), title: basename(root) },
      ...((overrides.project as object | undefined) ?? {}),
    },
  };
}

async function fakeCLI(
  root: string,
  options: {
    finalStdout?: string;
    finalStderr?: string;
    finalExitCode?: number;
    capabilities?: unknown;
    project?: unknown;
    logPath?: string;
  } = {},
) {
  const executable = join(root, 'fake toudocu');
  const logPath = options.logPath ?? join(root, 'argv.jsonl');
  const caps = JSON.stringify(options.capabilities ?? reports(root).capabilities);
  const project = JSON.stringify(options.project ?? reports(root).project);
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ cwd: process.cwd(), args }) + '\\n');
if (args[0] === 'capabilities') process.stdout.write(${JSON.stringify(caps)});
else if (args[0] === 'project') process.stdout.write(${JSON.stringify(project)});
else {
  process.stdout.write(${JSON.stringify(options.finalStdout ?? JSON.stringify({ schemaVersion: 1, kind: 'search', generator: { name: 'Toudocu', version: '2.5.0' }, query: 'default', total: 0, limit: 20, results: [] }))});
  process.stderr.write(${JSON.stringify(options.finalStderr ?? '')});
  process.exitCode = ${options.finalExitCode ?? 0};
}
`,
  );
  await chmod(executable, 0o755);
  return { executable, logPath };
}

async function initFixture(root: string) {
  await cp('fixtures/projects/compat-basic', root, { recursive: true });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Toudocu Tests',
      '-c',
      'user.email=tests@example.invalid',
      'commit',
      '-qm',
      'fixture',
    ],
    { cwd: root },
  );
}

async function realCLI(root: string) {
  const cliEntrypoint = join(process.cwd(), 'apps/cli/dist/main.js');
  const executable = join(root, 'real toudocu');
  await writeFile(
    executable,
    `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, [${JSON.stringify(cliEntrypoint)}, ...process.argv.slice(2)], { cwd: process.cwd(), encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exitCode = result.status ?? 1;
`,
  );
  await chmod(executable, 0o755);
  return executable;
}

test('fake CLI receives separate argv values and preserves workspace cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb adapter space; '));
  try {
    const { executable, logPath } = await fakeCLI(root);
    const client = new ToudocuClient(root, executable);
    const query = `guide; touch ${join(root, 'injected')}`;
    const result = await client.call('search', query);
    expect(result).toMatchObject({ kind: 'search', query: 'default' });
    const calls = (await readFile(logPath, 'utf8')).trim().split('\n').map(JSON.parse);
    expect(calls.map((call) => call.args.slice(0, 2)).sort()).toEqual(
      [
        ['capabilities', '--format'],
        ['project', 'info'],
        ['search', query],
      ].sort(),
    );
    expect(calls.every((call) => call.cwd === root)).toBe(true);
    await expect(readFile(join(root, 'injected'))).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('fake CLI rejects malformed, incompatible, unsupported, and missing installations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb adapter errors '));
  try {
    const cases = [
      {
        name: 'invalid JSON',
        options: { finalStdout: '{' },
        message: 'invalid or unsupported JSON',
      },
      {
        name: 'invalid report schema',
        options: { finalStdout: JSON.stringify({ schemaVersion: 2 }) },
        message: 'invalid or unsupported JSON',
      },
      {
        name: 'unsupported contract version',
        options: {
          capabilities: reports(root, { capabilities: { cliContractVersion: 2 } }).capabilities,
        },
        message: 'CLI contract v2',
      },
      {
        name: 'missing capability',
        options: {
          capabilities: reports(root, { capabilities: { capabilities: ['project-info'] } })
            .capabilities,
        },
        message: 'does not support search',
      },
    ];
    for (const item of cases) {
      const { executable } = await fakeCLI(root, item.options);
      await expect(new ToudocuClient(root, executable).call('search', 'guide')).rejects.toThrow(
        item.message,
      );
    }
    await expect(
      new ToudocuClient(root, join(root, 'missing')).call('search', 'guide'),
    ).rejects.toThrow('not installed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exit code 1 remains usable when it carries a valid task diagnostic report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb adapter diagnostic '));
  try {
    const ready = {
      schemaVersion: 1,
      kind: 'task-ready',
      generator: { name: 'Toudocu', version: '2.5.0' },
      task: {
        id: 'TASK-COMPAT-001',
        title: 'Fixture task',
        status: { kind: 'planned', symbol: '~', label: 'draft', recognized: true },
        type: 'maintenance',
        document: 'work/TASK-COMPAT-001.md',
      },
      status: 'blocked',
      contractComplete: false,
      readyForWork: false,
      issues: [],
    };
    const { executable } = await fakeCLI(root, {
      finalStdout: JSON.stringify(ready),
      finalExitCode: 1,
    });
    const result = await new ToudocuClient(root, executable).call('task_ready', 'TASK-COMPAT-001');
    expect(result).toMatchObject({ status: 'blocked', readyForWork: false });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('process cancellation escalates from SIGTERM and caps captured output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb process limits '));
  const controller = new AbortController();
  try {
    const ready = join(root, 'ready');
    const terminated = join(root, 'terminated');
    const code = `import { appendFileSync, writeFileSync } from 'node:fs';
process.on('SIGTERM', () => appendFileSync(${JSON.stringify(terminated)}, 'term'));
writeFileSync(${JSON.stringify(ready)}, 'ready');
setInterval(() => {}, 1000);`;
    const pending = runProcess(process.execPath, ['-e', code], root, controller.signal);
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await readFile(ready);
        break;
      } catch {
        await delay(10);
      }
    }
    expect(await readFile(ready, 'utf8')).toBe('ready');
    const abortedAt = performance.now();
    controller.abort();
    await expect(pending).rejects.toThrow('request cancelled');
    expect(performance.now() - abortedAt).toBeGreaterThanOrEqual(900);
    expect(await readFile(terminated, 'utf8')).toBe('term');

    await expect(
      runProcess(
        process.execPath,
        ['-e', "process.stdout.write('x'.repeat(5 * 1024 * 1024))"],
        root,
      ),
    ).rejects.toThrow('output exceeds 4 MiB');
  } finally {
    controller.abort();
    await rm(root, { recursive: true, force: true });
  }
});

test('real CLI serves project, task, changes, and dry-run verification contracts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb adapter real cli '));
  try {
    await initFixture(root);
    const client = new ToudocuClient(root, await realCLI(root));
    const project = await client.call('project_info');
    expect(project.projectRoot).toBe(root);
    const candidates = await client.call('task_candidates');
    expect(candidates.candidates.some((task) => task.id === 'TASK-COMPAT-001')).toBe(true);
    const tasks = await client.call('task_list');
    const readyTask = tasks.tasks.find(({ task }) => task.id === 'TASK-COMPAT-001')!;
    expect(readyTask.markdown).toContain('## Acceptance criteria');
    expect(readyTask.ready).toMatchObject({ task: { id: 'TASK-COMPAT-001' }, readyForWork: true });
    expect(readyTask.task).toMatchObject({ parentId: null, childIds: [] });
    expect(tasks.tasks.find(({ task }) => task.id === 'TASK-COMPAT-002')?.ready?.readyForWork).toBe(
      false,
    );
    expect((await client.call('task_context', 'TASK-COMPAT-001')).task.id).toBe('TASK-COMPAT-001');
    expect((await client.call('task_ready', 'TASK-COMPAT-001')).readyForWork).toBe(true);
    expect((await client.call('task_changes', 'TASK-COMPAT-001')).schemaVersion).toBe(1);
    const verification = await client.call('task_verify', 'TASK-COMPAT-001');
    expect(verification.mode).toBe('dry-run');
    expect(verification.commands.every((command) => command.status === 'planned')).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

test('real CLI changes stay scoped to each worktree', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bb adapter worktrees '));
  const workspaceA = `${root}-a`;
  const workspaceB = `${root}-b`;
  try {
    await initFixture(root);
    await writeFile(join(root, 'docs', 'workspace-a.md'), '# A\n');
    await writeFile(join(root, 'docs', 'workspace-b.md'), '# B\n');
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Toudocu Tests',
        '-c',
        'user.email=tests@example.invalid',
        'commit',
        '-qm',
        'workspace fixtures',
      ],
      { cwd: root },
    );
    execFileSync('git', ['worktree', 'add', '-q', '--detach', workspaceA, 'HEAD'], { cwd: root });
    execFileSync('git', ['worktree', 'add', '-q', '--detach', workspaceB, 'HEAD'], { cwd: root });
    await writeFile(join(workspaceA, 'docs', 'workspace-a.md'), '# A changed in A\n');
    await writeFile(join(workspaceB, 'docs', 'workspace-b.md'), '# B changed in B\n');
    const executable = await realCLI(root);
    const changesA = await new ToudocuClient(workspaceA, executable).call('changes');
    const changesB = await new ToudocuClient(workspaceB, executable).call('changes');
    const pathsA = changesA.changes.map((change) => change.path);
    const pathsB = changesB.changes.map((change) => change.path);
    expect(pathsA).toContain('docs/workspace-a.md');
    expect(pathsA).not.toContain('docs/workspace-b.md');
    expect(pathsB).toContain('docs/workspace-b.md');
    expect(pathsB).not.toContain('docs/workspace-a.md');
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', workspaceA], {
      cwd: root,
      stdio: 'ignore',
    });
    execFileSync('git', ['worktree', 'remove', '--force', workspaceB], {
      cwd: root,
      stdio: 'ignore',
    });
    await rm(workspaceA, { recursive: true, force: true });
    await rm(workspaceB, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

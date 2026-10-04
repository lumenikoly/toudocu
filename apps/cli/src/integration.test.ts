import { expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { ProjectWorkspaceV1Schema } from '@toudocu/contracts';
import { ProjectInfoV1Schema, ToudocuCapabilitiesV1Schema } from '@toudocu/contracts';
import { runCLI, version } from './cli.js';

async function run(args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await runCLI(
    args,
    (value) => (stdout += value),
    (value) => (stderr += value),
  );
  return { code, stdout, stderr };
}

test('project info discovers config from a nested workspace and returns the public JSON contract', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-project-info-'));
  const previous = cwd();
  try {
    await mkdir(join(root, '.toudocu'), { recursive: true });
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'work', 'nested'), { recursive: true });
    const config = await readFile('fixtures/projects/compat-basic/.toudocu/config.yml', 'utf8');
    await writeFile(
      join(root, '.toudocu/config.yml'),
      `site:\n  title: Integration fixture\n${config}`,
    );
    chdir(join(root, 'work', 'nested'));

    const result = await run(['project', 'info', '--format', 'json']);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(ProjectInfoV1Schema.parse(JSON.parse(result.stdout))).toEqual({
      schemaVersion: 1,
      projectRoot: root,
      documentationRoot: join(root, 'docs'),
      configPath: join(root, '.toudocu/config.yml'),
      project: { id: basename(root), title: 'Integration fixture' },
      workspace: null,
    });
  } finally {
    chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test('serve discovery reports only the matching project until the server shuts down', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-serve-discovery-'));
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-serve-state-'));
  const worktree = await mkdtemp(join(tmpdir(), 'toudocu-serve-worktree-'));
  const previousDirectory = cwd();
  const previousStateHome = process.env.TOUDOCU_STATE_HOME;
  const controller = new AbortController();
  let stdout = '';
  let stderr = '';
  let resolveStarted!: (url: string) => void;
  const started = new Promise<string>((resolve) => {
    resolveStarted = resolve;
  });
  try {
    const config = await readFile('fixtures/projects/compat-basic/.toudocu/config.yml', 'utf8');
    for (const projectRoot of [root, join(root, 'nested'), worktree]) {
      await mkdir(join(projectRoot, '.toudocu'), { recursive: true });
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, '.toudocu/config.yml'), config);
    }
    process.env.TOUDOCU_STATE_HOME = stateHome;
    chdir(root);
    const pending = runCLI(
      ['serve', '--port', '0', '--no-update-check'],
      (value) => {
        stdout += value;
        const match = /started at (http:\/\/[^\s]+)/u.exec(value);
        if (match?.[1]) resolveStarted(match[1]);
      },
      (value) => (stderr += value),
      controller.signal,
    );
    const url = await started;
    expect(stderr).toBe('');

    const instanceResponse = await fetch(`${url}/_toudocu/api/instance`);
    expect(instanceResponse.status).toBe(200);
    expect(instanceResponse.headers.get('cache-control')).toBe('no-store');
    expect(instanceResponse.headers.get('access-control-allow-origin')).toBe('*');
    const identity = await instanceResponse.json();

    const deadline = Date.now() + 1_500;
    let matchingInfo: ReturnType<typeof ProjectInfoV1Schema.parse> | undefined;
    while (Date.now() < deadline) {
      const matching = await run(['project', 'info', '--format', 'json']);
      expect(matching.code).toBe(0);
      const info = ProjectInfoV1Schema.parse(JSON.parse(matching.stdout));
      if (info.workspace) {
        matchingInfo = info;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(matchingInfo).toBeDefined();
    const workspace = ProjectWorkspaceV1Schema.parse(matchingInfo?.workspace);
    expect(workspace).toEqual({
      instanceId: expect.any(String),
      projectRoot: root,
      documentationRoot: join(root, 'docs'),
      url,
    });
    expect(identity).toEqual({
      instanceId: workspace.instanceId,
      projectRoot: workspace.projectRoot,
      documentationRoot: workspace.documentationRoot,
    });

    chdir(join(root, 'nested'));
    const nested = await run(['project', 'info', '--format', 'json']);
    expect(ProjectInfoV1Schema.parse(JSON.parse(nested.stdout)).workspace).toBeNull();

    chdir(worktree);
    const unrelated = await run(['project', 'info', '--format', 'json']);
    expect(ProjectInfoV1Schema.parse(JSON.parse(unrelated.stdout)).workspace).toBeNull();

    controller.abort(Object.assign(new Error('received SIGINT'), { signal: 'SIGINT' }));
    expect(await pending).toBe(130);
    chdir(root);
    const afterShutdown = await run(['project', 'info', '--format', 'json']);
    expect(ProjectInfoV1Schema.parse(JSON.parse(afterShutdown.stdout)).workspace).toBeNull();
    expect(stdout).toContain(url);
  } finally {
    if (!controller.signal.aborted) controller.abort();
    chdir(previousDirectory);
    if (previousStateHome === undefined) delete process.env.TOUDOCU_STATE_HOME;
    else process.env.TOUDOCU_STATE_HOME = previousStateHome;
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
    await rm(worktree, { recursive: true, force: true });
  }
}, 20_000);

test('project info reports structured JSON when no project is discoverable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-no-project-'));
  const previous = cwd();
  try {
    chdir(root);
    const result = await run(['project', 'info', '--format', 'json']);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      schemaVersion: 1,
      error: { code: 'PROJECT_NOT_FOUND' },
    });
  } finally {
    chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});

test('capabilities reports a versioned CLI contract', async () => {
  const result = await run(['capabilities', '--format', 'json']);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  const report = ToudocuCapabilitiesV1Schema.parse(JSON.parse(result.stdout));
  expect(report).toMatchObject({ schemaVersion: 1, version, cliContractVersion: 1 });
  expect(report.capabilities).toEqual(
    expect.arrayContaining(['project-info', 'task-context', 'task-verify', 'changes', 'check']),
  );
});

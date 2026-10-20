import { expect, test } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chdir, cwd } from 'node:process';
import { ProjectWorkspaceV1Schema } from '@toudocu/contracts';
import { PortalSnapshotV1Schema } from '@toudocu/contracts';
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

test('serve opens linked repository sources locally and revalidates access on every read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-serve-links-'));
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-serve-links-state-'));
  const previousStateHome = process.env.TOUDOCU_STATE_HOME;
  const controller = new AbortController();
  let pending: Promise<number> | undefined;
  let stderr = '';
  try {
    process.env.TOUDOCU_STATE_HOME = stateHome;
    await mkdir(join(root, '.toudocu'));
    await mkdir(join(root, 'docs', 'work'), { recursive: true });
    await mkdir(join(root, 'contracts'));
    await writeFile(
      join(root, '.toudocu/config.yml'),
      await readFile('fixtures/projects/compat-basic/.toudocu/config.yml', 'utf8'),
    );
    const sources = new Map([
      ['contracts/api.yaml', 'openapi: 3.1.0\n'],
      ['contracts/event.yaml', 'type: object\n'],
      ['contracts/media.yaml', 'get: {}\n'],
      ['contracts/document schema.json', '{"type":"object"}\n'],
      ['contracts/page.html', '<script>throw new Error("must not execute")</script>'],
    ]);
    const markdown =
      '# Repository sources\n\n' +
      [...sources.keys()]
        .map((path, index) => `[source ${index}](../../${path.replaceAll(' ', '%20')})`)
        .join('\n') +
      '\n[large](../../contracts/large.txt)';
    await writeFile(join(root, 'docs/work/task.md'), markdown);
    for (const [path, content] of sources) await writeFile(join(root, path), content);
    await writeFile(join(root, 'contracts/large.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
    await writeFile(join(root, 'contracts/unlinked.yaml'), 'private: true\n');
    await writeFile(join(stateHome, 'private.yaml'), 'outside repository\n');
    let resolveStarted!: (url: string) => void;
    const started = new Promise<string>((resolve) => {
      resolveStarted = resolve;
    });
    pending = runCLI(
      ['serve', join(root, 'docs'), '--repository-root', root, '--port', '0', '--no-update-check'],
      (value) => {
        const match = /started at (http:\/\/[^\s]+)/u.exec(value);
        if (match?.[1]) resolveStarted(match[1]);
      },
      (value) => (stderr += value),
      controller.signal,
    );
    const url = await Promise.race([
      started,
      pending.then((code) => {
        throw new Error(`serve exited with ${code}: ${stderr}`);
      }),
    ]);
    const portal = PortalSnapshotV1Schema.parse(
      await (await fetch(`${url}/_toudocu/api/portal`)).json(),
    );
    expect(portal.issues.filter((issue) => issue.code === 'blocked-link')).toEqual([]);
    const document = portal.pages
      .flatMap((page) => ('document' in page && page.document ? [page.document] : []))
      .find((document) => document.sourcePath === 'work/task.md');
    if (!document) throw new Error('repository links document is missing');
    expect(document.links).toHaveLength(sources.size + 1);
    for (const link of document.links.filter((link) => sources.has(link.target))) {
      expect(link.blocked).toBe(false);
      expect(link.href).toMatch(/^\/_toudocu\/repository\//u);
      expect(document.html).toContain(`href="${link.href}"`);
      expect(document.html).toContain(
        `href="${link.href}" target="_blank" rel="noopener noreferrer"`,
      );
      const response = await fetch(`${url}${link.href}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.text()).toBe(sources.get(link.target));
    }
    expect((await fetch(`${url}/_toudocu/repository/contracts/large.txt`)).status).toBe(413);
    for (const path of [
      'contracts/unlinked.yaml',
      '.env',
      '.git/config',
      '%2e%2e%2fprivate.yaml',
      '%252e%252e/private.yaml',
    ]) {
      expect((await fetch(`${url}/_toudocu/repository/${path}`)).status).toBe(404);
    }
    const apiUrl = `${url}/_toudocu/repository/contracts/api.yaml`;
    await writeFile(join(root, 'contracts/api.yaml'), 'updated: true\n');
    expect(await (await fetch(apiUrl)).text()).toBe('updated: true\n');
    await rm(join(root, 'contracts/api.yaml'));
    await symlink(join(stateHome, 'private.yaml'), join(root, 'contracts/api.yaml'));
    expect((await fetch(apiUrl)).status).toBe(403);
    await rm(join(root, 'contracts/api.yaml'));
    expect((await fetch(apiUrl)).status).toBe(404);
    await writeFile(join(root, 'contracts/api.yaml'), 'restored: true\n');
    await writeFile(join(root, 'docs/work/task.md'), '# Sources removed\n');
    const rebuilt = await fetch(`${url}/_toudocu/api/rebuild`, {
      method: 'POST',
      headers: { 'x-toudocu-action': 'rebuild', 'sec-fetch-site': 'same-origin' },
    });
    expect(rebuilt.status).toBe(200);
    expect((await fetch(apiUrl)).status).toBe(404);
    expect(stderr).toBe('');
  } finally {
    controller.abort();
    if (pending) await pending;
    if (previousStateHome === undefined) delete process.env.TOUDOCU_STATE_HOME;
    else process.env.TOUDOCU_STATE_HOME = previousStateHome;
    await rm(root, { recursive: true, force: true });
    await rm(stateHome, { recursive: true, force: true });
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

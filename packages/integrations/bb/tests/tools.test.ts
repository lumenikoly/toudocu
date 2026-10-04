import { expect, test } from 'vitest';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import projectCheck from '../../../../fixtures/expected/compatibility/check.json' with { type: 'json' };
import candidatesCapture from '../../../../fixtures/expected/compatibility/task-candidates.json' with { type: 'json' };
import changesCapture from '../../../../fixtures/expected/compatibility/task-changes.json' with { type: 'json' };
import contextCapture from '../../../../fixtures/expected/compatibility/task-context.json' with { type: 'json' };
import readyCapture from '../../../../fixtures/expected/compatibility/task-ready.json' with { type: 'json' };
import searchCapture from '../../../../fixtures/expected/compatibility/search.json' with { type: 'json' };
import verifyCapture from '../../../../fixtures/expected/compatibility/task-verify-dry-run.json' with { type: 'json' };
import plugin from '../src/plugin.js';

const taskId = 'TASK-COMPAT-001';
function report(capture: { stdout: string }) {
  return JSON.parse(
    capture.stdout
      .replaceAll('<VERSION>', '2.5.0')
      .replaceAll('<TIMESTAMP>', '2026-09-19T00:00:00Z')
      .replaceAll('"<DURATION>"', '0'),
  );
}
const reports: Record<string, unknown> = {
  project_info: {
    schemaVersion: 1,
    projectRoot: '/repo',
    documentationRoot: '/repo/docs',
    configPath: '/repo/.toudocu/config.yml',
    project: { id: 'fixture', title: 'Fixture' },
  },
  task_candidates: report(candidatesCapture),
  task_list: {
    schemaVersion: 1,
    kind: 'task-list',
    generator: { name: 'Toudocu', version: '2.5.0' },
    tasks: (report(projectCheck) as any).knowledge.workItems.map((task: any) => ({
      task,
      markdown: `# ${task.title}`,
      ready: task.id === taskId ? report(readyCapture) : null,
    })),
  },
  task_context: report(contextCapture),
  task_ready: report(readyCapture),
  task_changes: report(changesCapture),
  task_verify: report(verifyCapture),
  search: report(searchCapture),
  changes: report(changesCapture),
  check: report(projectCheck),
};

function environment(id: string, path: string, hostId: string) {
  return {
    id,
    path,
    hostId,
    projectId: 'project-test',
    status: 'ready',
    createdAt: 1,
    updatedAt: 1,
    isGitRepo: true,
    isWorktree: true,
    lifecycle: { phase: 'active', retireAt: null, teardown: null },
    hostLifecycle: 'active',
    managed: true,
    mergeBaseBranch: null,
    name: id,
    branchName: 'task-branch',
    baseBranch: null,
    defaultBranch: null,
    environmentProviderId: null,
    environmentProviderInstanceKey: null,
    environmentProviderSelection: null,
    workspaceProvisionType: 'managed-worktree',
  };
}

function setup(
  override?: (call: {
    operation: string;
    cwd: string;
    hostId: string;
    signal?: AbortSignal;
  }) => unknown,
  sharedPortTunnelIdentities?: Record<string, { label: string; baseDomain: string }>,
) {
  const threads: Record<string, { id: string; projectId: string; environmentId: string }> = {
    'thread-a': { id: 'thread-a', projectId: 'project-test', environmentId: 'env-a' },
    'thread-b': { id: 'thread-b', projectId: 'project-test', environmentId: 'env-b' },
    'thread-c': { id: 'thread-c', projectId: 'project-test', environmentId: 'env-c' },
    'thread-created': { id: 'thread-created', projectId: 'project-test', environmentId: 'env-a' },
    'thread-no-env': { id: 'thread-no-env', projectId: 'project-test', environmentId: '' },
  };
  const environments: Record<string, ReturnType<typeof environment>> = {
    'env-a': environment('env-a', '/workspaces/a', 'host-a'),
    'env-b': environment('env-b', '/workspaces/b', 'host-b'),
    'env-c': environment('env-c', '/workspaces/c', 'host-a'),
  };
  const host = createFakePluginHost({
    pluginId: 'toudocu-bb',
    agentSkillIds: ['toudocu-bb'],
    sharedPortTunnelIdentities,
    sdk: {
      threads: {
        get: async ({ threadId }) => threads[threadId],
        spawn: async () => ({
          id: 'thread-created',
          projectId: 'project-test',
          environmentId: 'env-a',
        }),
      },
      environments: { get: async ({ environmentId }) => environments[environmentId] },
      projects: {
        get: async ({ projectId }) => ({
          createdAt: 1,
          updatedAt: 1,
          gitRemoteUrl: null,
          id: projectId,
          kind: 'standard',
          name: 'Fixture project',
          sources: [
            {
              createdAt: 1,
              hostId: 'host-project',
              id: 'source-project',
              isDefault: true,
              path: '/projects/project',
              projectId,
              type: 'local_path',
              updatedAt: 1,
            },
          ],
        }),
      },
    },
    experimental_callHostRpc: ({ method, input, hostId, signal }) => {
      if (method !== 'read') throw new Error(`Unexpected host method: ${method}`);
      const request = input as { cwd: string; operation: string };
      return override?.({ ...request, hostId, signal }) ?? reports[request.operation];
    },
  });
  return host;
}

test('workspace reads fresh identity for each thread without loading task data', async () => {
  const { bb, harness } = setup(({ cwd }) => ({
    ...reports.project_info,
    workspace:
      cwd === '/projects/project'
        ? null
        : {
            instanceId: cwd.endsWith('/a')
              ? '11111111-1111-4111-8111-111111111111'
              : '22222222-2222-4222-8222-222222222222',
            projectRoot: cwd,
            documentationRoot: `${cwd}/docs`,
            url: 'http://127.0.0.1:4567',
          },
  }));
  await plugin(bb);
  const a = await harness.behavior.callRpc('workspace', { threadId: 'thread-a' });
  const b = await harness.behavior.callRpc('workspace', { threadId: 'thread-b' });
  expect(a).toMatchObject({ projectRoot: '/workspaces/a' });
  expect(b).toMatchObject({ projectRoot: '/workspaces/b' });
  await expect(
    harness.behavior.callRpc('workspace', { projectId: 'project-test' }),
  ).resolves.toBeNull();
  const reads = harness.inspection.experimental_hostRpcCalls;
  expect(reads).toHaveLength(3);
  expect(reads.map(({ hostId, input }) => [hostId, input])).toEqual([
    ['host-a', { cwd: '/workspaces/a', operation: 'project_info', fresh: true }],
    ['host-b', { cwd: '/workspaces/b', operation: 'project_info', fresh: true }],
    ['host-project', { cwd: '/projects/project', operation: 'project_info', fresh: true }],
  ]);
  await harness.lifecycle.dispose();
});

test('sharing checks instance identity and declares ports on the workspace host', async () => {
  const { bb, harness } = setup(
    ({ cwd }) => ({
      ...reports.project_info,
      workspace: {
        instanceId: '11111111-1111-4111-8111-111111111111',
        projectRoot: cwd,
        documentationRoot: `${cwd}/docs`,
        url: 'http://localhost:4567',
      },
    }),
    { 'host-a': { label: 'machine', baseDomain: 'bb.test' } },
  );
  await plugin(bb);
  const url = await harness.behavior.callRpc('shareWorkspace', {
    threadId: 'thread-a',
    instanceId: '11111111-1111-4111-8111-111111111111',
  });
  expect(url).toBe('https://machine--4567.bb.test');
  expect(harness.inspection.sharedPortDeclarations.at(-1)).toMatchObject({
    hostId: 'host-a',
    ports: [4567],
  });
  await expect(
    harness.behavior.callRpc('shareWorkspace', {
      threadId: 'thread-a',
      instanceId: '22222222-2222-4222-8222-222222222222',
    }),
  ).rejects.toThrow(/no longer running/i);
  expect(harness.inspection.sharedPortDeclarations).toHaveLength(1);
  await harness.lifecycle.dispose();
});

test('shared ports from multiple workspaces on one host are declared together', async () => {
  const { bb, harness } = setup(
    ({ cwd }) => ({
      ...reports.project_info,
      workspace: {
        instanceId: '11111111-1111-4111-8111-111111111111',
        projectRoot: cwd,
        documentationRoot: `${cwd}/docs`,
        url: cwd.endsWith('/c') ? 'http://localhost:4568' : 'http://localhost:4567',
      },
    }),
    { 'host-a': { label: 'machine', baseDomain: 'bb.test' } },
  );
  await plugin(bb);
  for (const threadId of ['thread-a', 'thread-c'])
    await harness.behavior.callRpc('shareWorkspace', {
      threadId,
      instanceId: '11111111-1111-4111-8111-111111111111',
    });
  expect(harness.inspection.sharedPortDeclarations.at(-1)).toEqual({
    hostId: 'host-a',
    ports: [4567, 4568],
  });
  await harness.lifecycle.dispose();
});

test('all semantic tools use their calling thread workspace and host', async () => {
  const { bb, harness } = setup();
  await plugin(bb);
  const calls = [
    ['toudocu_project_info', {}, 'project_info'],
    ['toudocu_task_candidates', {}, 'task_candidates'],
    ['toudocu_task_context', { taskId }, 'task_context'],
    ['toudocu_task_ready', { taskId }, 'task_ready'],
    ['toudocu_task_changes', { taskId }, 'task_changes'],
    ['toudocu_task_verify', { taskId }, 'task_verify'],
    ['toudocu_search', { query: 'compatibility' }, 'search'],
    ['toudocu_changes', {}, 'changes'],
    ['toudocu_check', {}, 'check'],
  ] as const;

  for (const threadId of ['thread-a', 'thread-b']) {
    for (const [name, input, operation] of calls) {
      await harness.behavior.callAgentTool(name, input, { threadId });
      const call = harness.inspection.experimental_hostRpcCalls.at(-1)!;
      expect(call).toMatchObject({
        hostId: threadId === 'thread-a' ? 'host-a' : 'host-b',
        input: { cwd: threadId === 'thread-a' ? '/workspaces/a' : '/workspaces/b', operation },
      });
    }
  }
  await harness.lifecycle.dispose();
});

test('rejects invalid tool and RPC inputs', async () => {
  const { bb, harness } = setup();
  await plugin(bb);
  await expect(
    harness.behavior.callAgentTool(
      'toudocu_task_context',
      { taskId: 42 },
      { threadId: 'thread-a' },
    ),
  ).rejects.toThrow(/taskId is required/i);
  await expect(
    harness.behavior.callAgentTool(
      'toudocu_task_context',
      { taskId },
      { threadId: 'thread-no-env' },
    ),
  ).rejects.toThrow(/no workspace/i);
  await expect(
    harness.behavior.callRpc('bind', { threadId: 'thread-a', taskId: 'bad' }),
  ).rejects.toThrow();
  await harness.lifecycle.dispose();
});

test('bind persists in plugin KV and work starts with compact bootstrap only when ready', async () => {
  const { bb, harness } = setup();
  await plugin(bb);
  await harness.behavior.callRpc('panel', { threadId: 'thread-a' });
  const binding = await harness.behavior.callRpc('bind', { threadId: 'thread-a', taskId });
  expect(binding).toEqual({ threadId: 'thread-a', projectId: 'project-test', taskId });
  expect(await harness.behavior.callRpc('panel', { threadId: 'thread-a' })).toMatchObject({
    binding,
  });
  expect(
    harness.inspection.experimental_hostRpcCalls.filter(
      (call) => (call.input as { operation: string }).operation === 'task_list',
    ),
  ).toHaveLength(1);
  expect(
    harness.inspection.experimental_hostRpcCalls.some(
      (call) => (call.input as { operation: string }).operation === 'check',
    ),
  ).toBe(false);

  const result = await harness.behavior.callRpc('work', { threadId: 'thread-a', taskId });
  expect(result).toEqual({ threadId: 'thread-created' });
  const spawn = harness.inspection.sdk.callsTo('threads.spawn')[0]![0] as {
    environment: unknown;
    prompt: string;
  };
  expect(spawn.environment).toMatchObject({
    type: 'host',
    hostId: 'host-a',
    workspace: { type: 'managed-worktree', baseBranch: { kind: 'named', name: 'task-branch' } },
  });
  expect(spawn.prompt).toContain(`$toudocu-bb implement ${taskId}`);
  expect(spawn.prompt).toContain('Use the toudocu-bb skill.');
  expect(spawn.prompt.length).toBeLessThan(1_500);

  const readyReport = reports.task_ready;
  reports.task_ready = {
    ...(reports.task_ready as object),
    readyForWork: false,
    status: 'blocked',
  };
  await expect(harness.behavior.callRpc('work', { threadId: 'thread-a', taskId })).rejects.toThrow(
    /not ready/i,
  );
  reports.task_ready = readyReport;
  expect(harness.inspection.sdk.callsTo('threads.spawn')).toHaveLength(1);
  await harness.lifecycle.dispose();
});

test('workflow actions start in the calling thread workspace and persist task binding', async () => {
  const { bb, harness } = setup();
  await plugin(bb);

  for (const action of ['clarify', 'review', 'verify'] as const) {
    await expect(
      harness.behavior.callRpc('workflow', { threadId: 'thread-b', taskId, action }),
    ).resolves.toEqual({ threadId: 'thread-created' });
    const spawn = harness.inspection.sdk.callsTo('threads.spawn').at(-1)![0] as {
      environment: unknown;
      prompt: string;
    };
    expect(spawn.environment).toEqual({ type: 'reuse', environmentId: 'env-b' });
    expect(spawn.prompt).toMatch(new RegExp(`^\\$toudocu-bb ${action} ${taskId}\\nGoal: `));
    expect(spawn.prompt).toContain('Implement the compatibility path');
  }
  expect(harness.inspection.sdk.callsTo('threads.spawn')).toHaveLength(3);
  const reads = harness.inspection.experimental_hostRpcCalls;
  expect(reads).toHaveLength(2);
  expect(reads.map(({ hostId, input }) => [hostId, input])).toEqual([
    ['host-b', { cwd: '/workspaces/b', operation: 'project_info', fresh: true }],
    ['host-b', { cwd: '/workspaces/b', operation: 'task_list' }],
  ]);
  expect(await harness.behavior.callRpc('panel', { threadId: 'thread-created' })).toMatchObject({
    binding: { threadId: 'thread-created', projectId: 'project-test', taskId },
  });
  expect(
    harness.inspection.experimental_hostRpcCalls.some(
      (call) => (call.input as { operation: string }).operation === 'task_context',
    ),
  ).toBe(false);
  await harness.lifecycle.dispose();
});

test('project workflow uses its default source path and rejects invalid or missing tasks', async () => {
  const { bb, harness } = setup((request) =>
    request.operation === 'task_list' ? { ...reports.task_list, tasks: [] } : undefined,
  );
  await plugin(bb);

  await expect(
    harness.behavior.callRpc('workflow', { projectId: 'project-test', taskId, action: 'review' }),
  ).rejects.toThrow(/task not found/i);
  await expect(
    harness.behavior.callRpc('workflow', {
      projectId: 'project-test',
      taskId,
      action: 'implement',
    }),
  ).rejects.toThrow();
  expect(harness.inspection.sdk.callsTo('threads.spawn')).toHaveLength(0);

  const { bb: validBb, harness: validHarness } = setup();
  await plugin(validBb);
  await expect(
    validHarness.behavior.callRpc('workflow', {
      projectId: 'project-test',
      taskId,
      action: 'clarify',
    }),
  ).resolves.toEqual({ threadId: 'thread-created' });
  const spawn = validHarness.inspection.sdk.callsTo('threads.spawn')[0]![0] as {
    environment: unknown;
  };
  expect(spawn.environment).toEqual({
    type: 'host',
    hostId: 'host-project',
    workspace: { type: 'unmanaged', path: '/projects/project' },
  });
  await harness.lifecycle.dispose();
  await validHarness.lifecycle.dispose();
});

test('panel task snapshots stay isolated by thread workspace', async () => {
  const { bb, harness } = setup();
  await plugin(bb);
  await harness.behavior.callRpc('panel', { threadId: 'thread-a' });
  await harness.behavior.callRpc('panel', { threadId: 'thread-b' });
  expect(
    harness.inspection.experimental_hostRpcCalls
      .filter((call) => (call.input as { operation: string }).operation === 'task_list')
      .map((call) => [call.hostId, (call.input as { cwd: string }).cwd]),
  ).toEqual([
    ['host-a', '/workspaces/a'],
    ['host-b', '/workspaces/b'],
  ]);
  await harness.lifecycle.dispose();
});

test('mention search returns cold placeholders and keeps warm indexes per workspace', async () => {
  let finishA!: (value: unknown) => void;
  let finishB!: (value: unknown) => void;
  const signals: AbortSignal[] = [];
  const pendingA = new Promise<unknown>((resolve) => {
    finishA = resolve;
  });
  const pendingB = new Promise<unknown>((resolve) => {
    finishB = resolve;
  });
  const { bb, harness } = setup(({ operation, cwd, signal }) => {
    if (operation !== 'check') return undefined;
    if (signal) signals.push(signal);
    return cwd === '/workspaces/a' ? pendingA : pendingB;
  });
  await plugin(bb);
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  const search = (threadId: string, query: string) =>
    provider.search({
      trigger: '@',
      query,
      projectId: 'project-test',
      threadId,
    });

  const coldA = await search('thread-a', 'TASK-COMPAT-001');
  const coldB = await search('thread-b', 'TASK-COMPAT-001');
  expect(coldA[0]?.subtitle).toMatch(/loading/i);
  expect(coldB[0]?.subtitle).toMatch(/loading/i);
  expect(harness.inspection.experimental_hostRpcCalls).toMatchObject([
    { hostId: 'host-a', input: { cwd: '/workspaces/a', operation: 'check' } },
    { hostId: 'host-b', input: { cwd: '/workspaces/b', operation: 'check' } },
  ]);

  const checkB = structuredClone(reports.check) as typeof reports.check & {
    documents: Array<Record<string, unknown>>;
    knowledge: { workItems: unknown[] | null };
  };
  checkB.documents = [{ ...checkB.documents[0], sourcePath: 'b-only.md', title: 'B-only marker' }];
  checkB.knowledge.workItems = [];
  finishA(reports.check);
  finishB(checkB);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect((await search('thread-a', 'TASK-COMPAT-001')).map((item) => item.title)).toContain(
    'TASK-COMPAT-001 Implement the compatibility path',
  );
  expect((await search('thread-b', 'B-only')).map((item) => item.title)).toContain('B-only marker');
  expect((await search('thread-a', 'B-only'))[0]?.title).toBe('Search Toudocu: B-only');
  await harness.lifecycle.dispose();
  expect(signals.length).toBe(2);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});

test('new-thread project scope loads tasks, starts work and resolves mentions on its default source', async () => {
  const { bb, harness } = setup();
  await plugin(bb);

  const panel = await harness.behavior.callRpc('panel', { projectId: 'project-test' });
  expect(panel).toMatchObject({
    project: { project: { id: 'fixture' } },
    tasks: expect.arrayContaining([
      expect.objectContaining({
        task: expect.objectContaining({ id: taskId }),
        markdown: expect.any(String),
      }),
    ]),
  });
  await harness.behavior.callRpc('panel', { projectId: 'project-test' });
  expect(
    harness.inspection.experimental_hostRpcCalls.filter(
      (call) => (call.input as { operation: string }).operation === 'task_list',
    ),
  ).toHaveLength(1);
  await harness.behavior.callRpc('panel', { projectId: 'project-test', refresh: true });
  expect(
    harness.inspection.experimental_hostRpcCalls.filter(
      (call) => (call.input as { operation: string }).operation === 'task_list',
    ),
  ).toHaveLength(2);
  expect(
    harness.inspection.experimental_hostRpcCalls.some((call) =>
      ['task_candidates', 'check', 'task_context', 'task_changes'].includes(
        (call.input as { operation: string }).operation,
      ),
    ),
  ).toBe(false);

  expect(await harness.behavior.callRpc('work', { projectId: 'project-test', taskId })).toEqual({
    threadId: 'thread-created',
  });
  const spawn = harness.inspection.sdk.callsTo('threads.spawn')[0]![0] as {
    projectId: string;
    environment: unknown;
  };
  expect(spawn.projectId).toBe('project-test');
  expect(spawn.environment).toMatchObject({
    type: 'host',
    hostId: 'host-project',
    workspace: { type: 'managed-worktree', baseBranch: { kind: 'default' } },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  const provider = harness.inspection.registrations.mentionProviders[0]!;
  const mentions = await provider.search({
    trigger: '@',
    query: taskId,
    projectId: 'project-test',
    threadId: null,
  });
  const taskMention = mentions.find((item) => item.title.includes(taskId));
  expect(taskMention).toBeDefined();
  const mentionId = JSON.parse(taskMention!.id) as unknown[];
  expect(mentionId.slice(0, 2)).toEqual([{ projectId: 'project-test' }, taskId]);
  expect(await provider.resolve(taskMention!.id)).toMatchObject({
    context: expect.stringContaining(taskId),
  });

  const calls = harness.inspection.experimental_hostRpcCalls;
  expect(calls.some((call) => (call.input as { operation: string }).operation === 'search')).toBe(
    true,
  );
  expect(
    calls.every(
      (call) =>
        call.hostId === 'host-project' &&
        (call.input as { cwd: string }).cwd === '/projects/project',
    ),
  ).toBe(true);
  await harness.lifecycle.dispose();
});

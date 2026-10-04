import type { BbPluginApi } from '@get-bb/plugin-sdk';
import {
  TaskContextReportV1Schema,
  TaskReadyReportV1Schema,
  ProjectInfoV1Schema,
  TaskListReportV1Schema,
  TaskVerifyReportV1Schema,
  ChangeSetReportV1Schema,
  SearchReportV1Schema,
  ProjectReportV1Schema,
} from '@toudocu/contracts';
import {
  bindingSchema,
  hostContract,
  rpcContract,
  type ThreadTaskBinding,
  type Scope,
  scopeInput,
} from './contract.js';
import { reports, type Operation } from './toudocu/client.js';
import { bootstrap } from './bootstrap.js';

export default function plugin(bb: BbPluginApi) {
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());
  const host = bb.hosts.experimental_client({ contract: hostContract });
  async function workspace(threadId: string) {
    const thread = await bb.sdk.threads.get({ threadId });
    if (!thread.environmentId) throw new Error('This thread has no workspace yet.');
    const environment = await bb.sdk.environments.get({ environmentId: thread.environmentId });
    if (
      environment.status !== 'ready' ||
      !environment.path ||
      environment.projectId !== thread.projectId
    )
      throw new Error('The thread workspace is not ready.');
    return { thread, environment, cwd: environment.path };
  }
  async function resolveScope(scope: Scope) {
    if ('threadId' in scope) {
      const { thread, environment, cwd } = await workspace(scope.threadId);
      return {
        projectId: thread.projectId,
        hostId: environment.hostId,
        cwd,
        branchName: environment.branchName,
      };
    }
    const project = await bb.sdk.projects.get({ projectId: scope.projectId });
    const source = project.sources.find((item) => item.isDefault);
    if (!source)
      throw new Error('Choose a project with a default checkout to browse Toudocu tasks.');
    return { projectId: project.id, hostId: source.hostId, cwd: source.path, branchName: null };
  }
  async function read(scope: Scope, operation: Operation, value?: string, signal?: AbortSignal) {
    const { hostId, cwd } = await resolveScope(scope);
    return host.call(
      'read',
      {
        cwd,
        operation,
        ...(operation === 'project_info' ? { fresh: true } : {}),
        ...(value === undefined ? {} : { value }),
      },
      {
        hostId,
        signal: signal ? AbortSignal.any([signal, lifecycle.signal]) : lifecycle.signal,
      },
    );
  }
  function call(threadId: string, operation: Operation, value?: string, signal?: AbortSignal) {
    return read({ threadId }, operation, value, signal);
  }
  async function binding(threadId: string): Promise<ThreadTaskBinding | null> {
    const stored = await bb.storage.kv.get(`thread:${threadId}`);
    return stored == null ? null : bindingSchema.parse(stored);
  }
  async function liveWorkspace(scope: Scope) {
    const { hostId, cwd } = await resolveScope(scope);
    const info = ProjectInfoV1Schema.parse(
      await host.call(
        'read',
        { cwd, operation: 'project_info', fresh: true },
        { hostId, signal: lifecycle.signal },
      ),
    );
    return info.workspace ?? null;
  }
  // Share ports only after an explicit Open action. Reconcile their owners so
  // a stopped server does not leave an unrelated future process shared.
  const shared = new Map<
    string,
    { hostId: string; scope: Scope; instanceId: string; port: number }
  >();
  function declarePorts(hostId: string) {
    bb.hosts.declareSharedPorts(hostId, [
      ...new Set(
        [...shared.values()].filter((entry) => entry.hostId === hostId).map((entry) => entry.port),
      ),
    ]);
  }
  let checkingPorts = false;
  async function reconcilePorts() {
    if (checkingPorts) return;
    checkingPorts = true;
    try {
      await Promise.allSettled(
        [...shared.entries()].map(async ([key, entry]) => {
          const workspace = await liveWorkspace(entry.scope).catch(() => null);
          if (workspace?.instanceId !== entry.instanceId && shared.get(key) === entry) {
            shared.delete(key);
            declarePorts(entry.hostId);
          }
        }),
      );
    } finally {
      checkingPorts = false;
    }
  }
  bb.onDispose(() => shared.clear());
  bb.background.service('workspace-links', {
    async start(signal) {
      const timer = setInterval(() => {
        if (shared.size) void reconcilePorts();
      }, 30_000);
      try {
        if (!signal.aborted)
          await new Promise<void>((done) =>
            signal.addEventListener('abort', () => done(), { once: true }),
          );
      } finally {
        clearInterval(timer);
      }
    },
  });
  const names = (Object.keys(reports) as Operation[]).filter((name) => name !== 'task_list');
  for (const operation of names) {
    const needsTask = operation.startsWith('task_') && operation !== 'task_candidates';
    const key = needsTask ? 'taskId' : operation === 'search' ? 'query' : null;
    bb.agents.registerTool({
      name: `toudocu_${operation}`,
      description:
        operation === 'task_verify'
          ? 'Read the task verification plan. Does not execute commands.'
          : `Read Toudocu ${operation.replaceAll('_', ' ')} in this thread workspace.`,
      parameters: {
        type: 'object',
        properties: key ? { [key]: { type: 'string', minLength: 1 } } : {},
        required: key ? [key] : [],
        additionalProperties: false,
      },
      async execute(input, ctx) {
        if (!ctx.threadId) throw new Error('A thread workspace is required.');
        const data = input as Record<string, unknown>;
        const value = key ? data[key] : undefined;
        if (key && typeof value !== 'string') throw new Error(`${key} is required.`);
        const result = await call(
          ctx.threadId,
          operation,
          typeof value === 'string' ? value : undefined,
          ctx.signal,
        );
        const output = JSON.stringify(reports[operation].parse(result));
        if (new TextEncoder().encode(output).length > 1_000_000)
          throw new Error('Report exceeds the tool output limit. Narrow the request.');
        return output;
      },
    });
  }
  bb.agents.configure(() => ({
    tools: names.map((name) => `toudocu_${name}`),
    skills: ['toudocu-bb'],
  }));
  type Snapshot = {
    project: ReturnType<typeof ProjectInfoV1Schema.parse>;
    tasks: ReturnType<typeof TaskListReportV1Schema.parse>['tasks'];
  };
  const snapshots = new Map<string, { at: number; data?: Snapshot; pending?: Promise<Snapshot> }>();
  async function snapshot(scope: Scope, refresh = false) {
    const { hostId, cwd } = await resolveScope(scope);
    const key = JSON.stringify([hostId, cwd]);
    let entry = snapshots.get(key);
    if (!entry) {
      if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
      entry = { at: 0 };
      snapshots.set(key, entry);
    }
    if (entry.pending) return entry.pending;
    if (!refresh && entry.data && Date.now() - entry.at < 60_000) return entry.data;
    const target = entry;
    target.pending = Promise.all([read(scope, 'project_info'), read(scope, 'task_list')])
      .then(([info, tasks]) => {
        const data = {
          project: ProjectInfoV1Schema.parse(info),
          tasks: TaskListReportV1Schema.parse(tasks).tasks,
        };
        target.data = data;
        target.at = Date.now();
        return data;
      })
      .finally(() => {
        delete target.pending;
      });
    return target.pending;
  }
  bb.rpc.register(rpcContract, {
    workspace: liveWorkspace,
    async shareWorkspace(input) {
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      const { hostId, cwd } = await resolveScope(scope);
      const workspace = await liveWorkspace(scope);
      if (!workspace || workspace.instanceId !== input.instanceId)
        throw new Error('This Toudocu workspace is no longer running.');
      const address = new URL(workspace.url);
      // bb forwards loopback ports. A server bound only to a private interface
      // cannot be made reachable through that transport.
      if (!['localhost', '127.0.0.1', '[::1]'].includes(address.hostname))
        throw new Error('Start Toudocu on 127.0.0.1 or 0.0.0.0 to open it through bb.');
      let tunnel;
      try {
        tunnel = await bb.hosts.ensureSharedPortTunnel(hostId);
      } catch {
        throw new Error('Connect this workspace machine to bb Connect to open Toudocu remotely.');
      }
      const current = await liveWorkspace(scope);
      if (current?.instanceId !== workspace.instanceId || current.url !== workspace.url)
        throw new Error('This Toudocu workspace is no longer running.');
      const port = Number(address.port || 80);
      const key = JSON.stringify([hostId, cwd]);
      shared.set(key, { hostId, scope, instanceId: workspace.instanceId, port });
      try {
        declarePorts(hostId);
      } catch (error) {
        shared.delete(key);
        throw error;
      }
      return `https://${tunnel.label}--${port}.${tunnel.baseDomain}`;
    },
    async panel(input) {
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      const data = await snapshot(scope, input.refresh);
      const bound = 'threadId' in scope ? await binding(scope.threadId) : null;
      return { ...data, binding: bound };
    },
    async bind({ threadId, taskId }) {
      const { thread } = await workspace(threadId);
      const data = await snapshot({ threadId });
      if (!data.tasks.some((entry) => entry.task.id === taskId))
        throw new Error('Task not found in this workspace. Refresh the tasks.');
      const bound = { threadId, projectId: thread.projectId, taskId };
      await bb.storage.kv.set(`thread:${threadId}`, bound);
      return bound;
    },
    async changes(input) {
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      return ChangeSetReportV1Schema.parse(await read(scope, 'task_changes', input.taskId));
    },
    async workflow(input) {
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      const location = await resolveScope(scope);
      const tasks = (await snapshot(scope)).tasks;
      const entry = tasks.find(({ task }) => task.id === input.taskId);
      if (!entry) throw new Error('Task not found in this workspace. Refresh the tasks.');
      const titles: Record<string, string> = {
        clarify: 'Clarify',
        review: 'Review',
        verify: 'Verify',
      };
      const created = await bb.sdk.threads.spawn({
        projectId: location.projectId,
        environment:
          'threadId' in scope
            ? { type: 'reuse', environmentId: (await workspace(scope.threadId)).environment.id }
            : {
                type: 'host',
                hostId: location.hostId,
                workspace: { type: 'unmanaged', path: location.cwd },
              },
        title: `${titles[input.action]} ${input.taskId}: ${entry.task.title}`.slice(0, 200),
        prompt: `$toudocu-bb ${input.action} ${input.taskId}\nGoal: ${entry.task.title.slice(0, 300)}\nUse this workspace's task and current changes.`,
      });
      await bb.storage.kv.set(`thread:${created.id}`, {
        threadId: created.id,
        projectId: location.projectId,
        taskId: input.taskId,
      });
      return { threadId: created.id };
    },
    async work(input) {
      const { taskId } = input;
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      const location = await resolveScope(scope);
      const ready = TaskReadyReportV1Schema.parse(await read(scope, 'task_ready', taskId));
      if (!ready.readyForWork) throw new Error('This task is not ready for work.');
      const context = TaskContextReportV1Schema.parse(await read(scope, 'task_context', taskId));
      const created = await bb.sdk.threads.spawn({
        projectId: location.projectId,
        environment: {
          type: 'host',
          hostId: location.hostId,
          workspace: {
            type: 'managed-worktree',
            baseBranch: location.branchName
              ? { kind: 'named', name: location.branchName }
              : { kind: 'default' },
          },
        },
        title: `${taskId}: ${context.task.title}`.slice(0, 200),
        prompt: bootstrap(context, ready),
      });
      await bb.storage.kv.set(`thread:${created.id}`, {
        threadId: created.id,
        projectId: location.projectId,
        taskId,
      });
      return { threadId: created.id };
    },
    async verify(input) {
      const scope: Scope =
        'threadId' in input ? { threadId: input.threadId } : { projectId: input.projectId };
      return TaskVerifyReportV1Schema.parse(await read(scope, 'task_verify', input.taskId));
    },
  });
  // The host allows only two seconds for mention suggestions. Keep a bounded
  // display index; resolving a selection always re-reads the public CLI.
  type Mention = { reference: string; title: string; subtitle: string };
  const indexes = new Map<string, { at: number; items: Mention[]; loading: boolean }>();
  async function mentionIndex(scope: Scope) {
    const { hostId, cwd } = await resolveScope(scope);
    const key = JSON.stringify([hostId, cwd]);
    let index = indexes.get(key);
    if (!index) {
      if (indexes.size >= 32) indexes.delete(indexes.keys().next().value!);
      index = { at: 0, items: [], loading: false };
      indexes.set(key, index);
    }
    if (!index.loading && Date.now() - index.at > 30_000) {
      index.loading = true;
      const entry = index;
      void host
        .call('read', { cwd, operation: 'check' }, { hostId, signal: lifecycle.signal })
        .then((value) => {
          const report = ProjectReportV1Schema.parse(value);
          entry.items = report.documents.slice(0, 5000).map((doc) => ({
            reference: doc.sourcePath,
            title: doc.title,
            subtitle: doc.sourcePath,
          }));
          const tasks = (report.knowledge.workItems ?? [])
            .filter((task) => !task.archived)
            .sort(
              (a, b) =>
                Number(['done', 'cancelled'].includes(a.status.kind)) -
                Number(['done', 'cancelled'].includes(b.status.kind)),
            )
            .map((task) => ({
              reference: task.id,
              title: `${task.id} ${task.title}`,
              subtitle: task.status.label,
            }));
          entry.items = [...tasks, ...entry.items];
        })
        .catch(() => {
          entry.items = [];
        })
        .finally(() => {
          entry.loading = false;
          entry.at = Date.now();
        });
    }
    return index;
  }
  bb.ui.registerMentionProvider({
    id: 'toudocu',
    label: 'Toudocu',
    triggers: ['@'],
    async search({ threadId, projectId, query }) {
      const scope: Scope | null = threadId ? { threadId } : projectId ? { projectId } : null;
      if (!scope) return [];
      const term = query
        .replace(/^toudocu\s*/iu, '')
        .trim()
        .slice(0, 1000);
      const index = await mentionIndex(scope);
      const matches = index.items
        .filter((item) =>
          `${item.title} ${item.reference}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
        )
        .slice(0, 12);
      if (!matches.length)
        return [
          {
            id: JSON.stringify([scope, term, 'search']),
            title: term ? `Search Toudocu: ${term}` : 'Toudocu project',
            subtitle: index.loading ? 'Loading suggestions…' : 'Fetch context when sent',
          },
        ];
      return matches.map((item) => ({
        id: JSON.stringify([scope, item.reference]),
        title: item.title,
        subtitle: item.subtitle,
      }));
    },
    async resolve(itemId) {
      const value: unknown = JSON.parse(itemId);
      if (
        !Array.isArray(value) ||
        ![2, 3].includes(value.length) ||
        typeof value[1] !== 'string' ||
        (value.length === 3 && value[2] !== 'search')
      )
        throw new Error('Invalid Toudocu mention.');
      const scope = scopeInput.parse(
        typeof value[0] === 'string' ? { threadId: value[0] } : value[0],
      );
      const [, reference, mode] = value as [unknown, string, string?];
      if (mode === 'search' && !reference) {
        const project = ProjectInfoV1Schema.parse(await read(scope, 'project_info'));
        return {
          context: `Toudocu project: ${project.project.title}\nUse toudocu_task_candidates to choose work or toudocu_search for documents.`,
        };
      }
      const result = SearchReportV1Schema.parse(await read(scope, 'search', reference));
      const docs =
        mode === 'search'
          ? result.results.slice(0, 6)
          : result.results.filter((item) => item.id === reference || item.path === reference);
      if (!docs.length) throw new Error('No matching Toudocu document in this workspace.');
      return {
        context: docs
          .map(
            (doc) =>
              `Toudocu: ${doc.id ?? doc.path}\n${doc.title.slice(0, 300)}\nUse ${doc.type === 'work' ? 'toudocu_task_context' : 'toudocu_search'} for details.`,
          )
          .join('\n\n'),
      };
    },
  });
}

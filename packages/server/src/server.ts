import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import websocket from '@fastify/websocket';
import {
  AgentConsoleInputSchema,
  AgentConsoleMessageSchema,
  RepositoryFileQuerySchema,
  RepositoryFilesQuerySchema,
  ServeInstanceIdentityV1Schema,
  ToudocuError,
  type AgentConsoleState,
  type AgentConsoleMessage,
  type AgentEvent,
  type AgentPreference,
  type AgentSessionState,
  type AgentThread,
  type ChangeSetReportV1,
  type EditorContentRequest,
  type EditorCreateRequest,
  type EditorFileList,
  type EditorFileResponse,
  type EditorPreviewResponse,
  type EditorSaveRequest,
  type EditorValidationResponse,
  type ReviewState,
  type RepositoryFilesQuery,
  type RepositoryFileQuery,
  type RepositoryFileList,
  type RepositoryFileResponse,
  type PortalSnapshotV1,
  type ServeInstanceIdentityV1,
} from '@toudocu/contracts';
import { PortalState } from './state.js';
import { isLoopbackHost } from './loopback.js';
import { watchProject, type ProjectWatcher } from './watcher.js';

export interface DocumentationServerOptions {
  instance?: ServeInstanceIdentityV1;
  initialSnapshot: PortalSnapshotV1;
  rebuild(signal: AbortSignal): Promise<PortalSnapshotV1>;
  watchPaths?: readonly string[];
  assetsDirectory: string;
  brandingFiles?: ReadonlyMap<string, string>;
  projectFiles?: ReadonlyMap<string, string>;
  html: string;
  debounceMs?: number;
  onError?: (error: unknown) => void;
  editor?: {
    list(signal: AbortSignal): Promise<EditorFileList>;
    read(path: string, signal: AbortSignal): Promise<EditorFileResponse>;
    preview(input: EditorContentRequest, signal: AbortSignal): Promise<EditorPreviewResponse>;
    validate(input: EditorContentRequest, signal: AbortSignal): Promise<EditorValidationResponse>;
    save(input: EditorSaveRequest, signal: AbortSignal): Promise<void>;
    create(input: EditorCreateRequest, signal: AbortSignal): Promise<string>;
  };
  changes?: (
    query: Record<string, string | undefined>,
    signal: AbortSignal,
  ) => Promise<ChangeSetReportV1>;
  discussions?: {
    list(signal: AbortSignal): Promise<ReviewState>;
    create(input: unknown, signal: AbortSignal): Promise<ReviewState>;
    message(id: string, input: unknown, signal: AbortSignal): Promise<ReviewState>;
    update(id: string, input: unknown, signal: AbortSignal): Promise<ReviewState>;
    delete(id: string, input: unknown, signal: AbortSignal): Promise<ReviewState>;
    updateMessage(
      id: string,
      messageId: string,
      input: unknown,
      signal: AbortSignal,
    ): Promise<ReviewState>;
    deleteMessage(
      id: string,
      messageId: string,
      input: unknown,
      signal: AbortSignal,
    ): Promise<ReviewState>;
  };
  repositoryReview?: {
    list(query: RepositoryFilesQuery, signal: AbortSignal): Promise<RepositoryFileList>;
    read(query: RepositoryFileQuery, signal: AbortSignal): Promise<RepositoryFileResponse>;
  };
  agentConsole?: AgentConsoleService;
}

export interface AgentConsoleService {
  setup(provider?: string): Promise<AgentConsoleState> | AgentConsoleState;
  snapshot(): AgentSessionState;
  subscribe(listener: (event: AgentConsoleRuntimeEvent) => void): () => void;
  start(
    input: {
      taskID?: string;
      provider?: string;
      preset?: 'default' | 'full-access';
      model?: string;
      effort?: string;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  send(
    text: string,
    policy?: 'normal' | 'filesystem-read-only',
    signal?: AbortSignal,
  ): Promise<void>;
  interrupt(signal?: AbortSignal): Promise<void>;
  approve(requestID: string, decision: 'accept' | 'decline' | 'cancel'): Promise<void>;
  cancelPending(id: string): Promise<void>;
  verifyTask?(
    taskID: string,
    mode: 'dry-run' | 'run',
    confirmed: boolean,
    signal?: AbortSignal,
  ): Promise<void>;
  sendVerificationFailure?(signal?: AbortSignal): Promise<void>;
  stop(discardPending: boolean): Promise<void>;
  cleanup(): Promise<void>;
  savePreference(preference: AgentPreference, confirmed: boolean): Promise<void>;
  history(provider?: string, signal?: AbortSignal): Promise<AgentThread[]>;
  resume(
    input: { threadID: string; provider?: string; preset?: 'default' | 'full-access' },
    signal?: AbortSignal,
  ): Promise<void>;
  startTerminal(signal?: AbortSignal): Promise<void>;
  stopTerminal(signal?: AbortSignal): Promise<void>;
  writeTerminal(text: string): void;
  resizeTerminal(columns: number, rows: number): void;
  interruptTerminal(): void;
  close(): Promise<void>;
}

type AgentConsoleRuntimeEvent =
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'state'; state: AgentSessionState }
  | { kind: 'terminal'; terminal: { type: 'output' | 'exit'; data?: string } };

export interface DocumentationServer {
  app: FastifyInstance;
  state: PortalState;
  close(): Promise<void>;
}

const stateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['revision', 'rebuilding'],
  properties: {
    revision: { type: 'integer', minimum: 1 },
    rebuilding: { type: 'boolean' },
    lastError: { type: 'string' },
  },
} as const;

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const contentRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'content'],
  properties: {
    path: { type: 'string', minLength: 1 },
    content: { type: 'string', maxLength: 2 * 1024 * 1024 },
  },
} as const;

const actionHeaders = (action: string) => ({
  type: 'object',
  required: ['x-toudocu-action'],
  properties: { 'x-toudocu-action': { type: 'string', const: action } },
});

function apiStatus(error: unknown): number {
  if (!(error instanceof ToudocuError)) return 500;
  if (
    [
      'stale_digest',
      'stale_file',
      'file_exists',
      'AGENT_REVISION_CONFLICT',
      'AGENT_INBOX_BUSY',
      'AGENT_INVALID_MESSAGE',
      'agent_session_active',
      'agent_session_inactive',
      'agent_pending_conflict',
      'agent_pending_missing',
      'agent_cleanup_conflict',
      'agent_queue_full',
      'verification_confirmation_required',
      'verification_task_mismatch',
      'verification_running',
      'verification_not_failed',
      'terminal_active',
      'terminal_inactive',
    ].includes(error.code)
  )
    return 409;
  if (['file_not_found', 'AGENT_DISCUSSION_NOT_FOUND'].includes(error.code)) return 404;
  if (
    ['path_forbidden', 'invalid_origin', 'AGENT_INVALID_PATH', 'AGENT_INVALID_TARGET'].includes(
      error.code,
    )
  )
    return 403;
  if (error.code === 'unsupported_extension') return 415;
  if (error.code === 'agent_history_unsupported') return 501;
  if (['content_too_large', 'AGENT_PAYLOAD_TOO_LARGE'].includes(error.code)) return 413;
  return 400;
}

function sendApiError(reply: FastifyReply, error: unknown) {
  const typed = error instanceof ToudocuError ? error : undefined;
  return reply.code(apiStatus(error)).send({
    schemaVersion: 1,
    error: {
      code: typed?.code === 'stale_file' ? 'stale_digest' : (typed?.code ?? 'internal_error'),
      message: typed?.message ?? 'request failed',
      ...(typed?.details === undefined ? {} : { details: typed.details }),
    },
  });
}

function assertSameOrigin(request: FastifyRequest): void {
  const origin = request.headers.origin;
  const fetchSite = request.headers['sec-fetch-site'];
  if (fetchSite !== undefined && fetchSite !== 'same-origin')
    throw new ToudocuError('invalid_origin', 'cross-origin writes are forbidden');
  if (!origin) {
    if (fetchSite === 'same-origin') return;
    throw new ToudocuError('invalid_origin', 'same-origin request metadata is required');
  }
  if (origin !== `${request.protocol}://${request.headers.host}`)
    throw new ToudocuError('invalid_origin', 'cross-origin writes are forbidden');
}

function assertLoopback(request: FastifyRequest): void {
  const address = request.raw.socket?.remoteAddress;
  if (
    address &&
    address !== '::1' &&
    !address.startsWith('127.') &&
    !address.startsWith('::ffff:127.')
  ) {
    throw new ToudocuError('invalid_origin', 'Agent Console is available only on loopback');
  }
  const host = request.headers.host;
  if (!host || !isLoopbackHost(host)) {
    throw new ToudocuError('invalid_origin', 'Agent Console requires a loopback Host header');
  }
}

class AgentConsoleTransport {
  readonly #messages: { message: AgentConsoleMessage; bytes: number }[] = [];
  readonly #listeners = new Set<(message: AgentConsoleMessage) => void>();
  #sequence = 0;
  #bytes = 0;

  constructor(runtime: AgentConsoleService) {
    runtime.subscribe((event) => {
      if (event.kind === 'event') this.#publish({ kind: 'event', event: event.event });
      else if (event.kind === 'state') this.#publish({ kind: 'state', state: event.state });
      else this.#publish({ kind: 'terminal', terminal: event.terminal });
    });
  }

  subscribe(listener: (message: AgentConsoleMessage) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  replay(after: number): AgentConsoleMessage[] {
    return this.#messages
      .filter(({ message }) => message.sequence > after)
      .map(({ message }) => message);
  }

  firstSequence(): number {
    return this.#messages[0]?.message.sequence ?? this.#sequence + 1;
  }

  state(state: AgentSessionState): AgentConsoleMessage {
    return this.#append({ kind: 'state', state }, false);
  }

  #publish(payload: Omit<AgentConsoleMessage, 'sequence'>): void {
    this.#append(payload, true);
  }

  #append(payload: Omit<AgentConsoleMessage, 'sequence'>, broadcast: boolean): AgentConsoleMessage {
    const message = AgentConsoleMessageSchema.parse({ sequence: ++this.#sequence, ...payload });
    const bytes = Buffer.byteLength(JSON.stringify(message));
    this.#messages.push({ message, bytes });
    this.#bytes += bytes;
    while (this.#bytes > 3 * 1024 * 1024 && this.#messages.length > 1) {
      this.#bytes -= this.#messages.shift()!.bytes;
    }
    if (broadcast) for (const listener of this.#listeners) listener(message);
    return message;
  }
}

function requestSignal(request: FastifyRequest): { signal: AbortSignal; close(): void } {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  const close = (): void => {
    if (request.raw.aborted) abort();
  };
  request.raw.once('aborted', abort);
  request.raw.once('close', close);
  return {
    signal: controller.signal,
    close: () => {
      request.raw.off('aborted', abort);
      request.raw.off('close', close);
    },
  };
}

async function readAsset(
  root: string,
  requestedPath: string,
  signal: AbortSignal,
): Promise<{ content: Buffer; type: string } | undefined> {
  const candidate = resolve(root, requestedPath);
  const fromRoot = relative(root, candidate);
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) return undefined;
  try {
    const [canonicalRoot, canonicalFile] = await Promise.all([realpath(root), realpath(candidate)]);
    const canonicalRelative = relative(canonicalRoot, canonicalFile);
    if (canonicalRelative.startsWith('..') || isAbsolute(canonicalRelative)) return undefined;
    return {
      content: await readFile(canonicalFile, { signal }),
      type: contentTypes[extname(canonicalFile)] ?? 'application/octet-stream',
    };
  } catch (error) {
    signal.throwIfAborted();
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export function createDocumentationServer(
  options: DocumentationServerOptions,
): DocumentationServer {
  const app = fastify({ logger: false });
  void app.register(websocket);
  const state = new PortalState(options.initialSnapshot, options.rebuild, options.onError);
  const agentTransport = options.agentConsole
    ? new AgentConsoleTransport(options.agentConsole)
    : undefined;
  let watcher: ProjectWatcher | undefined;

  if (options.instance) {
    const instance = ServeInstanceIdentityV1Schema.parse(options.instance);
    app.get('/_toudocu/api/instance', async (_request, reply) =>
      reply
        .header('cache-control', 'no-store')
        .header('access-control-allow-origin', '*')
        .send(instance),
    );
  }

  app.get(
    '/_toudocu/api/portal',
    { schema: { response: { 200: { type: 'object', additionalProperties: true } } } },
    async (_request, reply) => {
      const current = state.current;
      return reply.header('x-toudocu-revision', current.revision).send(current.snapshot);
    },
  );
  app.get('/_toudocu/api/state', { schema: { response: { 200: stateSchema } } }, async () => {
    const { revision, rebuilding, lastError } = state.current;
    return { revision, rebuilding, ...(lastError ? { lastError } : {}) };
  });
  app.post(
    '/_toudocu/api/rebuild',
    {
      schema: { headers: actionHeaders('rebuild'), response: { 200: stateSchema } },
    },
    async (request, reply) =>
      reviewAction(request, reply, async (signal) => {
        await state.requestRebuild(signal);
        const { revision, rebuilding, lastError } = state.current;
        return { revision, rebuilding, ...(lastError ? { lastError } : {}) };
      }),
  );

  if (options.editor) {
    app.get('/_toudocu/api/editor/files', async (request, reply) => {
      const scope = requestSignal(request);
      try {
        return await options.editor!.list(scope.signal);
      } catch (error) {
        return sendApiError(reply, error);
      } finally {
        scope.close();
      }
    });
    app.get(
      '/_toudocu/api/editor/file',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            required: ['path'],
            properties: {
              path: { type: 'string', minLength: 1 },
              raw: { type: 'string', enum: ['1'] },
            },
          },
        },
      },
      async (request, reply) => {
        const scope = requestSignal(request);
        try {
          const query = request.query as { path: string; raw?: string };
          const result = await options.editor!.read(query.path, scope.signal);
          return query.raw === '1'
            ? reply.type('text/plain; charset=utf-8').send(result.file.content)
            : result;
        } catch (error) {
          return sendApiError(reply, error);
        } finally {
          scope.close();
        }
      },
    );
    app.post(
      '/_toudocu/api/editor/preview',
      { schema: { headers: actionHeaders('preview'), body: contentRequestSchema } },
      async (request, reply) =>
        editorAction(request, reply, (signal) =>
          options.editor!.preview(request.body as EditorContentRequest, signal),
        ),
    );
    app.post(
      '/_toudocu/api/editor/validate',
      { schema: { headers: actionHeaders('validate'), body: contentRequestSchema } },
      async (request, reply) =>
        editorAction(request, reply, (signal) =>
          options.editor!.validate(request.body as EditorContentRequest, signal),
        ),
    );
    app.put(
      '/_toudocu/api/editor/file',
      {
        schema: {
          headers: actionHeaders('save'),
          body: {
            ...contentRequestSchema,
            required: ['path', 'content', 'expectedDigest', 'confirmOverwrite'],
            properties: {
              ...contentRequestSchema.properties,
              expectedDigest: { type: 'string' },
              confirmOverwrite: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) =>
        editorAction(request, reply, async (signal) => {
          const input = request.body as EditorSaveRequest;
          await options.editor!.save(input, signal);
          await state.requestRebuild(signal);
          const result = await options.editor!.read(input.path, signal);
          return { ...result, rebuild: rebuildResult(state.current.snapshot) };
        }),
    );
    app.post(
      '/_toudocu/api/editor/create',
      {
        schema: {
          headers: actionHeaders('create'),
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['template', 'language', 'fields'],
            properties: {
              template: { type: 'string' },
              language: { type: 'string', enum: ['ru', 'en'] },
              fields: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
        },
      },
      async (request, reply) =>
        editorAction(request, reply, async (signal) => {
          const path = await options.editor!.create(request.body as EditorCreateRequest, signal);
          await state.requestRebuild(signal);
          const result = await options.editor!.read(path, signal);
          return reply
            .code(201)
            .send({ ...result, rebuild: rebuildResult(state.current.snapshot) });
        }),
    );
  }

  if (options.changes) {
    app.get(
      '/_toudocu/api/changes',
      {
        schema: {
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              ['base', 'branchBase', 'target', 'type', 'status', 'module', 'task'].map((key) => [
                key,
                { type: 'string' },
              ]),
            ),
          },
        },
      },
      async (request, reply) => {
        const scope = requestSignal(request);
        try {
          return await options.changes!(
            request.query as Record<string, string | undefined>,
            scope.signal,
          );
        } catch (error) {
          return sendApiError(reply, error);
        } finally {
          scope.close();
        }
      },
    );
  }

  if (options.repositoryReview) {
    app.get('/_toudocu/api/changes/review/repository/files', async (request, reply) =>
      reviewAction(request, reply, async (signal) => {
        assertLoopback(request);
        reply.header('Cache-Control', 'no-store');
        const parsed = RepositoryFilesQuerySchema.safeParse(request.query);
        if (!parsed.success)
          throw new ToudocuError('invalid_query', 'invalid repository file query');
        return options.repositoryReview!.list(parsed.data, signal);
      }),
    );
    app.get('/_toudocu/api/changes/review/repository/file', async (request, reply) =>
      reviewAction(request, reply, async (signal) => {
        assertLoopback(request);
        reply.header('Cache-Control', 'no-store');
        const parsed = RepositoryFileQuerySchema.safeParse(request.query);
        if (!parsed.success)
          throw new ToudocuError('invalid_query', 'invalid repository file query');
        return options.repositoryReview!.read(parsed.data, signal);
      }),
    );
  }

  if (options.discussions) {
    app.get('/_toudocu/api/agent/discussions', async (request, reply) =>
      reviewAction(request, reply, (signal) => options.discussions!.list(signal), false),
    );
    app.post(
      '/_toudocu/api/agent/discussions',
      {
        schema: {
          headers: actionHeaders('agent-discussion-create'),
          body: { type: 'object', additionalProperties: true },
        },
      },
      async (request, reply) =>
        reviewAction(request, reply, (signal) => options.discussions!.create(request.body, signal)),
    );
    app.post(
      '/_toudocu/api/agent/discussions/:id/messages',
      {
        schema: {
          headers: actionHeaders('agent-message-create'),
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
          body: { type: 'object', additionalProperties: true },
        },
      },
      async (request, reply) =>
        reviewAction(request, reply, (signal) =>
          options.discussions!.message((request.params as { id: string }).id, request.body, signal),
        ),
    );
    app.patch(
      '/_toudocu/api/agent/discussions/:id',
      {
        schema: {
          headers: actionHeaders('agent-discussion-update'),
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
          body: { type: 'object', additionalProperties: true },
        },
      },
      async (request, reply) =>
        reviewAction(request, reply, (signal) =>
          options.discussions!.update((request.params as { id: string }).id, request.body, signal),
        ),
    );
    app.delete(
      '/_toudocu/api/agent/discussions/:id',
      {
        schema: {
          headers: actionHeaders('agent-discussion-delete'),
          params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
          body: { type: 'object', additionalProperties: true },
        },
      },
      async (request, reply) =>
        reviewAction(request, reply, (signal) =>
          options.discussions!.delete((request.params as { id: string }).id, request.body, signal),
        ),
    );
    for (const method of ['PATCH', 'DELETE'] as const) {
      app.route({
        method,
        url: '/_toudocu/api/agent/discussions/:id/messages/:messageId',
        schema: {
          headers: actionHeaders(
            method === 'PATCH' ? 'agent-message-update' : 'agent-message-delete',
          ),
          params: {
            type: 'object',
            required: ['id', 'messageId'],
            properties: { id: { type: 'string' }, messageId: { type: 'string' } },
          },
          body: { type: 'object', additionalProperties: true },
        },
        handler: async (request, reply) =>
          reviewAction(request, reply, (signal) => {
            const { id, messageId } = request.params as { id: string; messageId: string };
            return method === 'PATCH'
              ? options.discussions!.updateMessage(id, messageId, request.body, signal)
              : options.discussions!.deleteMessage(id, messageId, request.body, signal);
          }),
      });
    }
  }

  if (options.agentConsole && agentTransport) {
    const runtime = options.agentConsole;
    app.get('/_toudocu/api/agent-console/', async (request, reply) => {
      try {
        assertLoopback(request);
        assertSameOrigin(request);
        const provider = (request.query as { provider?: string }).provider;
        return await runtime.setup(provider);
      } catch (error) {
        return sendApiError(reply, error);
      }
    });

    const action = (
      path: string,
      header: string,
      operation: (request: FastifyRequest, signal: AbortSignal) => Promise<void>,
      body: Record<string, unknown> = { type: 'object', additionalProperties: false },
    ): void => {
      app.post(path, { schema: { headers: actionHeaders(header), body } }, async (request, reply) =>
        reviewAction(request, reply, async (signal) => {
          assertLoopback(request);
          await operation(request, signal);
          return runtime.snapshot();
        }),
      );
    };

    action(
      '/_toudocu/api/agent-console/start',
      'agent-session-start',
      (request, signal) =>
        runtime.start(request.body as Parameters<AgentConsoleService['start']>[0], signal),
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          taskID: { type: 'string', minLength: 1 },
          provider: { type: 'string', minLength: 1 },
          preset: { type: 'string', enum: ['default', 'full-access'] },
          model: { type: 'string', maxLength: 128 },
          effort: { type: 'string', maxLength: 128 },
        },
      },
    );
    action(
      '/_toudocu/api/agent-console/stop',
      'agent-session-stop',
      (request) =>
        runtime.stop(Boolean((request.body as { discardPending?: boolean }).discardPending)),
      {
        type: 'object',
        additionalProperties: false,
        required: ['discardPending'],
        properties: { discardPending: { type: 'boolean' } },
      },
    );
    action('/_toudocu/api/agent-console/cleanup', 'agent-session-cleanup', () => runtime.cleanup());
    const verifyTask = runtime.verifyTask?.bind(runtime);
    if (verifyTask) {
      const taskBody = {
        type: 'object',
        additionalProperties: false,
        required: ['taskID'],
        properties: { taskID: { type: 'string', minLength: 1, maxLength: 256 } },
      };
      action(
        '/_toudocu/api/agent-console/verification/plan',
        'agent-verification-plan',
        (request, signal) =>
          verifyTask((request.body as { taskID: string }).taskID, 'dry-run', false, signal),
        taskBody,
      );
      action(
        '/_toudocu/api/agent-console/verify',
        'agent-task-verify',
        (request, signal) => {
          const input = request.body as { taskID: string; confirmed: boolean };
          return verifyTask(input.taskID, 'run', input.confirmed, signal);
        },
        {
          ...taskBody,
          required: ['taskID', 'confirmed'],
          properties: { ...taskBody.properties, confirmed: { type: 'boolean' } },
        },
      );
    }
    const sendVerificationFailure = runtime.sendVerificationFailure?.bind(runtime);
    if (sendVerificationFailure)
      action(
        '/_toudocu/api/agent-console/verification/send',
        'agent-verification-send',
        (_, signal) => sendVerificationFailure(signal),
      );
    action(
      '/_toudocu/api/agent-console/resume',
      'agent-session-resume',
      (request, signal) =>
        runtime.resume(request.body as Parameters<AgentConsoleService['resume']>[0], signal),
      {
        type: 'object',
        additionalProperties: false,
        required: ['threadID'],
        properties: {
          threadID: { type: 'string', minLength: 1, maxLength: 4096 },
          provider: { type: 'string', minLength: 1 },
          preset: { type: 'string', enum: ['default', 'full-access'] },
        },
      },
    );
    app.get('/_toudocu/api/agent-console/history', async (request, reply) => {
      const scope = requestSignal(request);
      try {
        assertLoopback(request);
        assertSameOrigin(request);
        const provider = (request.query as { provider?: string }).provider;
        return { schemaVersion: 1, threads: await runtime.history(provider, scope.signal) };
      } catch (error) {
        return sendApiError(reply, error);
      } finally {
        scope.close();
      }
    });
    action(
      '/_toudocu/api/agent-console/preference',
      'agent-preference-save',
      (request) => {
        const body = request.body as {
          preset: AgentPreference['launchPreset'];
          model?: string;
          effort?: string;
          confirmed: boolean;
        };
        return runtime.savePreference(
          {
            launchPreset: body.preset,
            ...(body.model ? { model: body.model } : {}),
            ...(body.effort ? { effort: body.effort } : {}),
          },
          body.confirmed,
        );
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['preset', 'confirmed'],
        properties: {
          preset: { type: 'string', enum: ['default', 'full-access'] },
          model: { type: 'string', maxLength: 128 },
          effort: { type: 'string', maxLength: 128 },
          confirmed: { type: 'boolean' },
        },
      },
    );
    action(
      '/_toudocu/api/agent-console/pending/cancel',
      'agent-pending-cancel',
      (request) => runtime.cancelPending(String((request.body as { id?: string }).id ?? '')),
      {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string', minLength: 1 } },
      },
    );
    action('/_toudocu/api/agent-console/terminal/start', 'project-terminal-start', (_, signal) =>
      runtime.startTerminal(signal),
    );
    action('/_toudocu/api/agent-console/terminal/stop', 'project-terminal-stop', (_, signal) =>
      runtime.stopTerminal(signal),
    );

    app.after(() => {
      app.get('/_toudocu/api/agent-console/ws', { websocket: true }, (socket, request) => {
        try {
          assertLoopback(request);
          assertSameOrigin(request);
        } catch {
          socket.close(1008, 'same-origin loopback connection required');
          return;
        }
        const since = Number((request.query as { since?: string }).since ?? 0);
        const first = agentTransport.firstSequence();
        if (Number.isSafeInteger(since) && since > 0 && since < first - 1) {
          socket.send(
            JSON.stringify({
              sequence: first,
              kind: 'replay_gap',
              replayGap: { after: since, before: first },
            }),
          );
        }
        for (const message of agentTransport.replay(Number.isSafeInteger(since) ? since : 0)) {
          socket.send(JSON.stringify(message));
        }
        socket.send(JSON.stringify(agentTransport.state(runtime.snapshot())));
        const unsubscribe = agentTransport.subscribe((message) => {
          if (socket.bufferedAmount > 3 * 1024 * 1024) {
            socket.close(1013, 'Agent Console client is too slow');
          } else if (socket.readyState === 1) {
            socket.send(JSON.stringify(message));
          }
        });
        socket.once('close', unsubscribe);
        socket.on('message', (data: Buffer) => {
          try {
            const input = AgentConsoleInputSchema.parse(JSON.parse(data.toString()));
            void handleAgentInput(runtime, input).catch(() =>
              socket.close(1011, 'Agent Console action failed'),
            );
          } catch {
            socket.close(1008, 'Invalid Agent Console message');
          }
        });
      });
    });
  }
  app.get('/assets/*', async (request, reply) => {
    const path = (request.params as { '*': string })['*'];
    const requestScope = requestSignal(request);
    try {
      const branding =
        options.brandingFiles?.get(`assets/${path}`) ?? options.projectFiles?.get(`assets/${path}`);
      const asset = branding
        ? await readAsset(dirname(branding), basename(branding), requestScope.signal)
        : await readAsset(options.assetsDirectory, path, requestScope.signal);
      if (!asset) return reply.code(404).send({ error: 'not found' });
      return reply.type(asset.type).send(asset.content);
    } finally {
      requestScope.close();
    }
  });

  const serveSpa = async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.url.startsWith('/_toudocu/api/')) {
      return reply.code(404).send({ error: 'not found' });
    }
    const path = (request.params as { '*'?: string })['*'];
    const source = path ? options.projectFiles?.get(path) : undefined;
    if (source) {
      const scope = requestSignal(request);
      try {
        const asset = await readAsset(dirname(source), basename(source), scope.signal);
        if (!asset) return reply.code(404).send({ error: 'not found' });
        return reply.type(asset.type).send(asset.content);
      } finally {
        scope.close();
      }
    }
    return reply.type('text/html; charset=utf-8').send(options.html);
  };
  app.get('/', serveSpa);
  app.get('/*', serveSpa);

  app.addHook('onReady', async () => {
    if (options.watchPaths?.length) {
      watcher = watchProject(
        options.watchPaths,
        () => void state.requestRebuild(),
        (error) => state.reportError(error),
        options.debounceMs,
      );
      await watcher.ready;
    }
  });
  app.addHook('onClose', async () => {
    await watcher?.close();
    await options.agentConsole?.close();
    await state.close();
  });

  return { app, state, close: () => app.close() };

  async function editorAction(
    request: FastifyRequest,
    reply: FastifyReply,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ) {
    return reviewAction(request, reply, operation);
  }

  async function reviewAction(
    request: FastifyRequest,
    reply: FastifyReply,
    operation: (signal: AbortSignal) => Promise<unknown>,
    write = true,
  ) {
    const scope = requestSignal(request);
    try {
      if (write) assertSameOrigin(request);
      return await operation(scope.signal);
    } catch (error) {
      return sendApiError(reply, error);
    } finally {
      scope.close();
    }
  }
}

function rebuildResult(snapshot: PortalSnapshotV1) {
  return {
    documents: snapshot.stats.documents,
    pages: snapshot.pages.length,
    warnings: snapshot.stats.warnings,
    errors: snapshot.stats.errors,
  };
}

async function handleAgentInput(
  runtime: AgentConsoleService,
  input: ReturnType<typeof AgentConsoleInputSchema.parse>,
): Promise<void> {
  switch (input.action) {
    case 'message':
      await runtime.send(input.text, input.policy ?? 'normal');
      return;
    case 'interrupt':
      await runtime.interrupt();
      return;
    case 'approval':
      await runtime.approve(input.requestID, input.decision);
      return;
    case 'terminal-input':
      runtime.writeTerminal(input.text);
      return;
    case 'terminal-resize':
      runtime.resizeTerminal(input.columns, input.rows);
      return;
    case 'terminal-interrupt':
      runtime.interruptTerminal();
  }
}

import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import {
  ToudocuError,
  AgentModelSchema,
  AgentThreadSchema,
  type AgentCapabilities,
  type AgentEvent,
  type AgentLaunch,
  type AgentModel,
  type AgentSettings,
  type AgentThread,
} from '@toudocu/contracts';
import { startProcess, type ManagedProcess } from '../process-runner.js';

export type AgentTurnPolicy = 'normal' | 'filesystem-read-only';
export type AgentApprovalDecision = 'accept' | 'decline' | 'cancel';
export type AgentApproval = NonNullable<AgentEvent['approval']>;

export interface AgentProviderSession {
  readonly settings: AgentSettings;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  startTurn(text: string, policy: AgentTurnPolicy, signal?: AbortSignal): Promise<string>;
  steer(turnID: string, text: string, signal?: AbortSignal): Promise<void>;
  interrupt(turnID: string, signal?: AbortSignal): Promise<void>;
  approve(requestID: string, decision: AgentApprovalDecision): Promise<void>;
  stop(): Promise<void>;
}

export interface AgentProvider {
  readonly name: string;
  readonly capabilities: AgentCapabilities;
  start(launch: AgentLaunch, signal?: AbortSignal): Promise<AgentProviderSession>;
  models?(cwd: string, signal?: AbortSignal): Promise<AgentModel[]>;
  history?(cwd: string, signal?: AbortSignal): Promise<AgentThread[]>;
  resume?(
    launch: AgentLaunch,
    threadID: string,
    signal?: AbortSignal,
  ): Promise<AgentProviderSession>;
}

interface RPCMessage {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface PendingRPC {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

interface ApprovalRequest {
  id: number | string;
  method: string;
}

export class CodexProvider implements AgentProvider {
  readonly name = 'codex';
  readonly capabilities: AgentCapabilities = {
    steering: true,
    interrupt: true,
    approvals: true,
    readOnlyTurns: true,
  };

  constructor(private readonly executable = 'codex') {}

  async start(launch: AgentLaunch, signal?: AbortSignal): Promise<AgentProviderSession> {
    const session = await this.#connect(launch, signal);
    try {
      await session.startThread(signal);
      return session;
    } catch (error) {
      await session.stop();
      throw error;
    }
  }

  async models(cwd: string, signal?: AbortSignal): Promise<AgentModel[]> {
    const session = await this.#connect({ cwd, provider: this.name, preset: 'default' }, signal);
    try {
      return await session.models(signal);
    } finally {
      await session.stop();
    }
  }

  async history(cwd: string, signal?: AbortSignal): Promise<AgentThread[]> {
    const session = await this.#connect({ cwd, provider: this.name, preset: 'default' }, signal);
    try {
      return await session.history(cwd, signal);
    } finally {
      await session.stop();
    }
  }

  async resume(
    launch: AgentLaunch,
    threadID: string,
    signal?: AbortSignal,
  ): Promise<AgentProviderSession> {
    const session = await this.#connect(launch, signal);
    try {
      await session.resumeThread(threadID, signal);
      return session;
    } catch (error) {
      await session.stop();
      throw error;
    }
  }

  async #connect(launch: AgentLaunch, signal?: AbortSignal): Promise<CodexSession> {
    const cwd = resolve(launch.cwd);
    const process = startProcess(this.executable, ['app-server', '--stdio'], {
      cwd,
      ...(signal ? { signal } : {}),
    });
    const session = new CodexSession(process, {
      launch: { ...launch, cwd, provider: this.name },
      effectiveAccess: {
        known: launch.preset === 'full-access',
        unrestricted: launch.preset === 'full-access',
      },
      capabilities: {
        ...this.capabilities,
        readOnlyTurns: launch.preset === 'full-access',
      },
    });
    try {
      await session.initialize(signal);
      return session;
    } catch (error) {
      await session.stop();
      throw error;
    }
  }
}

class CodexSession implements AgentProviderSession {
  readonly #listeners = new Set<(event: AgentEvent) => void>();
  readonly #pending = new Map<number, PendingRPC>();
  readonly #approvals = new Map<string, ApprovalRequest>();
  readonly #process: ManagedProcess;
  readonly #lines;
  #nextID = 0;
  #threadID = '';
  #closed = false;

  constructor(
    process: ManagedProcess,
    readonly settings: AgentSettings,
  ) {
    this.#process = process;
    this.#lines = createInterface({ input: process.stdout });
    this.#lines.on('line', (line) => this.#receive(line));
    void process.exited.then(
      () => this.#fail(new ToudocuError('agent_process_exited', 'Codex app-server exited')),
      (error) => this.#fail(error),
    );
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    await this.#request(
      'initialize',
      { clientInfo: { name: 'toudocu', title: 'Toudocu', version: '0.0.0-migration' } },
      signal,
    );
    this.#notify('initialized', {});
  }

  async startThread(signal?: AbortSignal): Promise<void> {
    const launch = this.settings.launch;
    const params: Record<string, unknown> = { cwd: launch.cwd, ephemeral: false };
    if (launch.model) params.model = launch.model;
    if (launch.preset === 'full-access') {
      params.sandbox = 'danger-full-access';
      params.approvalPolicy = 'never';
    }
    const result = object(await this.#request('thread/start', params, signal));
    const thread = object(result.thread);
    this.#threadID = string(thread.id);
    if (!this.#threadID)
      throw new ToudocuError('agent_protocol_error', 'Codex returned no thread identifier');
    this.#emit({ type: 'session_started', threadID: this.#threadID });
  }

  async models(signal?: AbortSignal): Promise<AgentModel[]> {
    const result = object(await this.#request('model/list', {}, signal));
    return normalizeCodexModels(result.data);
  }

  async history(cwd: string, signal?: AbortSignal): Promise<AgentThread[]> {
    const result = object(
      await this.#request(
        'thread/list',
        {
          cwd,
          limit: 50,
          sortKey: 'updated_at',
          sortDirection: 'desc',
          sourceKinds: ['appServer', 'cli', 'vscode'],
        },
        signal,
      ),
    );
    return normalizeCodexThreads(result.data);
  }

  async resumeThread(threadID: string, signal?: AbortSignal): Promise<void> {
    const stored = object(await this.#request('thread/read', { threadId: threadID }, signal));
    const storedCwd = string(object(stored.thread).cwd);
    if (!storedCwd || resolve(storedCwd) !== this.settings.launch.cwd) {
      throw new ToudocuError(
        'agent_thread_unavailable',
        'Codex thread does not belong to this repository',
      );
    }
    const params: Record<string, unknown> = {
      threadId: threadID,
      cwd: this.settings.launch.cwd,
    };
    if (this.settings.launch.preset === 'full-access') {
      params.sandbox = 'danger-full-access';
      params.approvalPolicy = 'never';
    }
    const result = object(await this.#request('thread/resume', params, signal));
    const resumedID = string(object(result.thread).id);
    if (resumedID !== threadID) {
      throw new ToudocuError('agent_protocol_error', 'Codex resumed an unexpected thread');
    }
    this.#threadID = threadID;
    this.#emit({ type: 'session_started', threadID });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async startTurn(text: string, policy: AgentTurnPolicy, signal?: AbortSignal): Promise<string> {
    const params: Record<string, unknown> = {
      threadId: this.#threadID,
      input: [{ type: 'text', text }],
      ...(this.settings.launch.model ? { model: this.settings.launch.model } : {}),
      ...(this.settings.launch.effort ? { effort: this.settings.launch.effort } : {}),
    };
    if (policy === 'filesystem-read-only') {
      if (!this.settings.capabilities.readOnlyTurns)
        throw new ToudocuError(
          'agent_policy_unsupported',
          'session does not support read-only turns',
        );
      params.sandboxPolicy = { type: 'readOnly', networkAccess: false };
    } else if (this.settings.launch.preset === 'full-access') {
      params.sandboxPolicy = { type: 'dangerFullAccess' };
    }
    const result = object(await this.#request('turn/start', params, signal));
    const turnID = string(object(result.turn).id);
    if (!turnID)
      throw new ToudocuError('agent_protocol_error', 'Codex returned no turn identifier');
    return turnID;
  }

  async steer(turnID: string, text: string, signal?: AbortSignal): Promise<void> {
    await this.#request(
      'turn/steer',
      { threadId: this.#threadID, expectedTurnId: turnID, input: [{ type: 'text', text }] },
      signal,
    );
  }

  async interrupt(turnID: string, signal?: AbortSignal): Promise<void> {
    await this.#request('turn/interrupt', { threadId: this.#threadID, turnId: turnID }, signal);
  }

  async approve(requestID: string, decision: AgentApprovalDecision): Promise<void> {
    const approval = this.#approvals.get(requestID);
    if (!approval) return;
    this.#approvals.delete(requestID);
    this.#send({ id: approval.id, result: { decision } });
  }

  async stop(): Promise<void> {
    if (this.#closed) return;
    this.#lines.close();
    this.#process.stdin.end();
    await this.#process.stop();
    this.#closed = true;
    this.#fail(new ToudocuError('agent_session_stopped', 'agent session stopped'));
  }

  #request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<unknown> {
    signal?.throwIfAborted();
    const id = ++this.#nextID;
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.#pending.delete(id);
        reject(signal?.reason ?? new Error('agent request aborted'));
      };
      this.#pending.set(id, {
        resolve: (value) => {
          signal?.removeEventListener('abort', abort);
          resolve(value);
        },
        reject: (error) => {
          signal?.removeEventListener('abort', abort);
          reject(error);
        },
      });
      signal?.addEventListener('abort', abort, { once: true });
      this.#send({ id, method, params });
      if (signal?.aborted) abort();
    });
  }

  #notify(method: string, params: Record<string, unknown>): void {
    this.#send({ method, params });
  }

  #send(message: RPCMessage): void {
    if (this.#closed) throw new ToudocuError('agent_session_closed', 'agent session is closed');
    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #receive(line: string): void {
    let message: RPCMessage;
    try {
      message = JSON.parse(line) as RPCMessage;
    } catch {
      this.#emit({ type: 'error', text: 'Codex returned invalid JSON' });
      return;
    }
    if (typeof message.id === 'number' && !message.method) {
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error)
        pending.reject(
          new ToudocuError('agent_rpc_error', message.error.message || 'Codex request failed', {
            details: message.error,
          }),
        );
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      this.#approvalRequest(message);
      return;
    }
    if (message.method) this.#notification(message.method, message.params ?? {});
  }

  #approvalRequest(message: RPCMessage): void {
    const method = message.method ?? '';
    if (
      !['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(method)
    ) {
      this.#send({ id: message.id!, error: { code: -32_601, message: 'Unsupported request' } });
      return;
    }
    const params = message.params ?? {};
    const requestID = String(message.id);
    this.#approvals.set(requestID, { id: message.id!, method });
    this.#emit({
      type: 'approval',
      approval: {
        requestID,
        kind: method.includes('fileChange') ? 'file-change' : 'command',
        reason: string(params.reason) || string(params.command),
      },
    });
  }

  #notification(method: string, params: Record<string, unknown>): void {
    if (method === 'turn/started') {
      this.#emit({ type: 'turn_started', turnID: string(object(params.turn).id) });
      return;
    }
    if (method === 'turn/completed') {
      const turn = object(params.turn);
      this.#emit({ type: 'turn_completed', turnID: string(turn.id), status: string(turn.status) });
      return;
    }
    if (method === 'item/agentMessage/delta') {
      this.#emit({
        type: 'message_delta',
        itemID: string(params.itemId),
        text: string(params.delta),
      });
      return;
    }
    if (method === 'item/commandExecution/outputDelta') {
      this.#emit({
        type: 'command_output',
        itemID: string(params.itemId),
        text: string(params.delta),
      });
      return;
    }
    if (method === 'turn/diff/updated') {
      this.#emit({ type: 'files_changed', text: string(params.diff) });
      return;
    }
    if (method === 'item/started' || method === 'item/completed') {
      this.#item(method === 'item/started', object(params.item));
      return;
    }
    if (method === 'serverRequest/resolved') {
      this.#approvals.delete(string(params.requestId));
      return;
    }
    if (method === 'error') {
      this.#emit({ type: 'error', text: string(object(params.error).message) });
    }
  }

  #item(started: boolean, item: Record<string, unknown>): void {
    const type = string(item.type);
    if (type === 'userMessage' && started) {
      const content = Array.isArray(item.content) ? item.content : [];
      const text = content
        .map((value) => string(object(value).text))
        .filter(Boolean)
        .join('\n');
      this.#emit({ type: 'user_message', itemID: string(item.id), text });
    } else if (type === 'commandExecution') {
      this.#emit({
        type: started ? 'command_started' : 'command_finished',
        itemID: string(item.id),
        command: string(item.command),
        cwd: string(item.cwd),
        status: string(item.status),
        ...(typeof item.exitCode === 'number' ? { exitCode: item.exitCode } : {}),
        ...(typeof item.durationMs === 'number' ? { durationMillis: item.durationMs } : {}),
      });
    } else if (type === 'fileChange' && !started) {
      this.#emit({ type: 'files_changed', itemID: string(item.id), status: string(item.status) });
    }
  }

  #emit(event: AgentEvent): void {
    const bounded = boundCommandOutput(event);
    for (const listener of this.#listeners) listener(bounded);
  }

  #fail(error: unknown): void {
    if (!this.#closed) this.#emit({ type: 'error', text: message(error) });
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function integer(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

export function normalizeCodexModels(value: unknown): AgentModel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(object)
    .filter((model) => model.hidden !== true)
    .map((model) =>
      AgentModelSchema.parse({
        id: string(model.id) || string(model.model),
        displayName: string(model.displayName) || string(model.id) || string(model.model),
        description: string(model.description),
        supportedReasoningEfforts: Array.isArray(model.supportedReasoningEfforts)
          ? model.supportedReasoningEfforts.map((effort) => {
              const item = object(effort);
              return {
                reasoningEffort: string(item.reasoningEffort),
                description: string(item.description),
              };
            })
          : [],
        defaultReasoningEffort: string(model.defaultReasoningEffort),
        isDefault: model.isDefault === true,
      }),
    );
}

export function normalizeCodexThreads(value: unknown): AgentThread[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const thread = object(entry);
    const name = string(thread.name);
    return AgentThreadSchema.parse({
      id: string(thread.id),
      preview: string(thread.preview),
      ...(name ? { name } : {}),
      createdAt: integer(thread.createdAt),
      updatedAt: integer(thread.updatedAt),
    });
  });
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function boundCommandOutput(event: AgentEvent): AgentEvent {
  if (event.type !== 'command_output' || !event.text) return event;
  const bytes = Buffer.from(event.text);
  const limit = 1024 * 1024;
  if (bytes.byteLength <= limit) return event;
  return { ...event, text: bytes.subarray(-limit).toString(), truncated: true };
}

import { createServer } from 'node:net';
import { resolve } from 'node:path';
import {
  ToudocuError,
  type AgentCapabilities,
  type AgentEvent,
  type AgentLaunch,
  type AgentModel,
  type AgentSettings,
} from '@toudocu/contracts';
import { runProcess, startProcess, type ManagedProcess } from '../process-runner.js';
import type {
  AgentApprovalDecision,
  AgentProvider,
  AgentProviderSession,
  AgentTurnPolicy,
} from './provider.js';
import { boundCommandOutput } from './provider.js';

export class OpenCodeProvider implements AgentProvider {
  readonly name = 'opencode';
  readonly capabilities: AgentCapabilities = {
    steering: false,
    interrupt: true,
    approvals: false,
    readOnlyTurns: false,
  };

  constructor(private readonly executable = 'opencode') {}

  async available(cwd: string): Promise<boolean> {
    try {
      const result = await runProcess(this.executable, ['--version'], {
        cwd,
        timeoutMs: 3000,
        maxOutputBytes: 4096,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async models(cwd: string, signal?: AbortSignal): Promise<AgentModel[]> {
    const result = await runProcess(this.executable, ['models', '--verbose'], {
      cwd,
      ...(signal ? { signal } : {}),
      timeoutMs: 30_000,
      maxOutputBytes: 8 * 1024 * 1024,
    });
    if (result.exitCode !== 0) {
      throw new ToudocuError(
        'agent_model_list_failed',
        `OpenCode model list failed: ${result.stderr.toString().slice(-4096)}`,
      );
    }
    return parseOpenCodeModels(result.stdout.toString());
  }

  async start(launch: AgentLaunch, signal?: AbortSignal): Promise<AgentProviderSession> {
    signal?.throwIfAborted();
    const cwd = resolve(launch.cwd);
    const port = await availablePort(signal);
    const process = startProcess(
      this.executable,
      ['serve', '--hostname', '127.0.0.1', '--port', String(port)],
      {
        cwd,
        ...(launch.preset === 'full-access'
          ? { env: { OPENCODE_PERMISSION: '{"*":"allow"}' } }
          : {}),
        ...(signal ? { signal } : {}),
      },
    );
    const settings: AgentSettings = {
      launch: { ...launch, cwd, provider: this.name },
      effectiveAccess: { known: false, unrestricted: false },
      capabilities: this.capabilities,
    };
    const session = new OpenCodeSession(`http://127.0.0.1:${port}`, cwd, process, settings);
    try {
      await session.initialize(signal);
      return session;
    } catch (error) {
      await session.stop();
      throw error;
    }
  }
}

class OpenCodeSession implements AgentProviderSession {
  readonly #listeners = new Set<(event: AgentEvent) => void>();
  readonly #stream = new AbortController();
  readonly #baseURL: string;
  readonly #cwd: string;
  readonly #process: ManagedProcess;
  readonly settings: AgentSettings;
  #sessionID = '';
  #turn = 0;
  #closed = false;
  #lastEventID = '';
  readonly #seenEventIDs = new Set<string>();

  constructor(baseURL: string, cwd: string, process: ManagedProcess, settings: AgentSettings) {
    this.#baseURL = baseURL;
    this.#cwd = cwd;
    this.#process = process;
    this.settings = settings;
    void process.exited.then(
      () => {
        if (!this.#closed) this.#emit({ type: 'error', text: 'OpenCode server exited' });
      },
      (error) => this.#emit({ type: 'error', text: message(error) }),
    );
  }

  async initialize(signal?: AbortSignal): Promise<void> {
    await this.#waitReady(signal);
    const created = record(await this.#request('POST', '/session', {}, signal));
    this.#sessionID = string(created.id);
    if (!this.#sessionID)
      throw new ToudocuError('agent_protocol_error', 'OpenCode returned no session identifier');
    this.#emit({ type: 'session_started', threadID: this.#sessionID });
    void this.#subscribe();
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async startTurn(text: string, policy: AgentTurnPolicy, signal?: AbortSignal): Promise<string> {
    if (policy !== 'normal')
      throw new ToudocuError('agent_policy_unsupported', 'OpenCode has no read-only turn');
    const body: Record<string, unknown> = { parts: [{ type: 'text', text }] };
    const model = this.settings.launch.model;
    if (model) {
      const separator = model.indexOf('/');
      if (separator < 1 || separator === model.length - 1)
        throw new ToudocuError('agent_model_invalid', 'OpenCode model must be provider/model');
      body.model = { providerID: model.slice(0, separator), modelID: model.slice(separator + 1) };
    }
    if (this.settings.launch.effort) body.variant = this.settings.launch.effort;
    await this.#request(
      'POST',
      `/session/${encodeURIComponent(this.#sessionID)}/prompt_async`,
      body,
      signal,
    );
    const turnID = `${this.#sessionID}-${++this.#turn}`;
    this.#emit({ type: 'turn_started', threadID: this.#sessionID, turnID });
    return turnID;
  }

  async steer(): Promise<void> {
    throw new ToudocuError('agent_steering_unsupported', 'OpenCode does not support steering');
  }

  async interrupt(_turnID: string, signal?: AbortSignal): Promise<void> {
    await this.#request(
      'POST',
      `/session/${encodeURIComponent(this.#sessionID)}/abort`,
      undefined,
      signal,
    );
  }

  async approve(_requestID: string, _decision: AgentApprovalDecision): Promise<void> {
    throw new ToudocuError('agent_approval_unsupported', 'OpenCode approvals are unavailable');
  }

  async stop(): Promise<void> {
    if (this.#closed) return;
    this.#stream.abort();
    if (this.#sessionID) await this.interrupt('', undefined).catch(() => undefined);
    await this.#process.stop();
    this.#closed = true;
    this.#listeners.clear();
  }

  async #waitReady(signal?: AbortSignal): Promise<void> {
    const timeout = AbortSignal.timeout(30_000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    while (!combined.aborted) {
      try {
        await this.#request('GET', '/session', undefined, combined);
        return;
      } catch {
        await delay(50, combined);
      }
    }
    combined.throwIfAborted();
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(path, this.#baseURL);
    url.searchParams.set('directory', this.#cwd);
    const response = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok)
      throw new ToudocuError(
        'agent_rpc_error',
        `OpenCode ${path} returned HTTP ${response.status}: ${(await response.text()).slice(0, 4096)}`,
      );
    if (response.status === 204) return undefined;
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }

  async #subscribe(): Promise<void> {
    while (!this.#stream.signal.aborted) {
      try {
        const url = new URL('/event', this.#baseURL);
        url.searchParams.set('directory', this.#cwd);
        const response = await fetch(url, {
          signal: this.#stream.signal,
          ...(this.#lastEventID ? { headers: { 'last-event-id': this.#lastEventID } } : {}),
        });
        if (!response.ok || !response.body)
          throw new Error(`OpenCode events: HTTP ${response.status}`);
        await this.#readEvents(response.body);
      } catch (error) {
        if (!this.#stream.signal.aborted)
          await delay(50, this.#stream.signal).catch(() => undefined);
      }
    }
  }

  async #readEvents(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = '';
    let eventID = '';
    while (!this.#stream.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) return;
      pending += value;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('id:')) {
          eventID = line.slice(3).trim();
          this.#lastEventID = eventID;
          continue;
        }
        if (!line.startsWith('data:')) continue;
        if (eventID && this.#seenEventIDs.has(eventID)) continue;
        try {
          const event = record(JSON.parse(line.slice(5).trim()));
          this.#normalize(string(event.type), record(event.properties));
          if (eventID) this.#rememberEvent(eventID);
          eventID = '';
        } catch {
          // Unknown or malformed provider events do not break the shared stream.
        }
      }
    }
  }

  #rememberEvent(eventID: string): void {
    this.#seenEventIDs.add(eventID);
    if (this.#seenEventIDs.size <= 512) return;
    const oldest = this.#seenEventIDs.values().next().value;
    if (oldest) this.#seenEventIDs.delete(oldest);
  }

  #normalize(type: string, properties: Record<string, unknown>): void {
    const sessionID = string(properties.sessionID);
    if (sessionID && sessionID !== this.#sessionID) return;
    const part = record(properties.part);
    const state = record(part.state);
    const itemID = string(part.callID) || string(part.id) || string(properties.partID);
    if (type === 'message.part.delta') {
      this.#emit({ type: 'message_delta', itemID, text: string(properties.delta) });
    } else if (type === 'message.part.updated' && part.type === 'text' && part.text) {
      this.#emit({ type: 'message_delta', itemID, text: string(part.text) });
    } else if (type === 'message.part.updated' && part.type === 'tool') {
      this.#tool(itemID, state);
    } else if (type === 'file.edited' || type === 'file.watcher.updated') {
      this.#emit({ type: 'files_changed', text: string(properties.path) });
    } else if (type === 'session.idle' || record(properties.status).type === 'idle') {
      this.#emit({ type: 'turn_completed', status: 'completed' });
    } else if (type === 'session.error') {
      this.#emit({ type: 'error', text: JSON.stringify(properties.error ?? {}) });
      this.#emit({ type: 'turn_completed', status: 'failed' });
    }
  }

  #tool(itemID: string, state: Record<string, unknown>): void {
    const status = string(state.status);
    const command = string(record(state.input).command);
    if (status === 'pending' || status === 'running') {
      this.#emit({ type: 'command_started', itemID, command, cwd: this.#cwd, status });
      return;
    }
    if (status !== 'completed' && status !== 'error') return;
    const output = string(state.output) || string(state.error);
    if (output) this.#emit({ type: 'command_output', itemID, text: output });
    const time = record(state.time);
    this.#emit({
      type: 'command_finished',
      itemID,
      command,
      cwd: this.#cwd,
      status,
      durationMillis: Math.max(0, number(time.end) - number(time.start)),
    });
  }

  #emit(event: AgentEvent): void {
    const normalized = {
      ...boundCommandOutput(event),
      ...(this.#sessionID ? { threadID: this.#sessionID } : {}),
    };
    for (const listener of this.#listeners) listener(normalized);
  }
}

function availablePort(signal?: AbortSignal): Promise<number> {
  signal?.throwIfAborted();
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    const abort = (): void => {
      server.close(() => reject(signal?.reason));
    };
    signal?.addEventListener('abort', abort, { once: true });
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        signal?.removeEventListener('abort', abort);
        if (address && typeof address !== 'string') resolvePort(address.port);
        else reject(new Error('failed to allocate OpenCode port'));
      });
    });
  });
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, reject) => {
    const timer = setTimeout(resolveDelay, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseOpenCodeModels(output: string): AgentModel[] {
  const models: AgentModel[] = [];
  let remaining = output.trim();
  while (remaining) {
    const newline = remaining.indexOf('\n');
    if (newline < 0) throw new Error('invalid verbose OpenCode model output');
    const id = remaining.slice(0, newline).trim();
    const extracted = takeJSONObject(remaining.slice(newline + 1).trimStart());
    const metadata = record(JSON.parse(extracted.json));
    const providerID = string(metadata.providerID);
    const metadataID = string(metadata.id);
    if (!id || `${providerID}/${metadataID}` !== id) {
      throw new Error(`OpenCode model metadata does not match ${id || 'empty id'}`);
    }
    const capabilities = record(metadata.capabilities);
    const variants =
      capabilities.reasoning === true
        ? Object.keys(record(metadata.variants)).sort(compareEffort)
        : [];
    const configured = string(record(metadata.options).reasoningEffort);
    models.push({
      id,
      displayName: string(metadata.name) || id,
      description: '',
      supportedReasoningEfforts: variants.map((reasoningEffort) => ({
        reasoningEffort,
        description: '',
      })),
      defaultReasoningEffort: defaultEffort(variants, configured),
      isDefault: false,
    });
    remaining = extracted.rest.trim();
  }
  return models;
}

function takeJSONObject(value: string): { json: string; rest: string } {
  if (!value.startsWith('{')) throw new Error('OpenCode model metadata must be a JSON object');
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) {
      return { json: value.slice(0, index + 1), rest: value.slice(index + 1) };
    }
  }
  throw new Error('unterminated OpenCode model metadata');
}

function compareEffort(left: string, right: string): number {
  const order = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  if (leftIndex < 0 && rightIndex < 0) return left.localeCompare(right);
  if (leftIndex < 0) return 1;
  if (rightIndex < 0) return -1;
  return leftIndex - rightIndex;
}

function defaultEffort(variants: string[], configured: string): string {
  return (
    [configured, 'medium', 'high', variants[0] ?? ''].find((item) => variants.includes(item)) ?? ''
  );
}

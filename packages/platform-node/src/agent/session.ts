import { randomUUID } from 'node:crypto';
import {
  AgentConsoleStateSchema,
  AgentSessionStateSchema,
  ToudocuError,
  type AgentConsoleState,
  type AgentEvent,
  type AgentLaunch,
  type AgentModel,
  type AgentPreference,
  type AgentSessionState,
  type AgentThread,
} from '@toudocu/contracts';
import { ProjectTerminal, type TerminalEvent } from '../pty/session.js';
import type {
  AgentApprovalDecision,
  AgentProvider,
  AgentProviderSession,
  AgentTurnPolicy,
} from './provider.js';
import { AgentPreferenceStore } from './preferences.js';

interface PendingMessage {
  id: string;
  text: string;
  state: 'queued' | 'not-sent';
  reason: string;
  position: number;
  notSent: boolean;
  policy: AgentTurnPolicy;
}

export type AgentRuntimeEvent =
  | { kind: 'event'; event: AgentEvent }
  | { kind: 'state'; state: AgentSessionState }
  | { kind: 'terminal'; terminal: TerminalEvent };

export interface AgentConsoleRuntimeOptions {
  cwd: string;
  providers: readonly AgentProvider[];
  skill: AgentConsoleState['setup']['skill'];
  preferenceStore?: Pick<AgentPreferenceStore, 'load' | 'save'>;
}

export class AgentConsoleRuntime {
  readonly #cwd: string;
  readonly #providers: Map<string, AgentProvider>;
  readonly #skill: AgentConsoleState['setup']['skill'];
  readonly #terminal: ProjectTerminal;
  readonly #preferences: Pick<AgentPreferenceStore, 'load' | 'save'>;
  readonly #listeners = new Set<(event: AgentRuntimeEvent) => void>();
  #session: AgentProviderSession | undefined;
  #unsubscribeSession: (() => void) | undefined;
  #status: 'idle' | 'running' | 'stopping' | 'failed' = 'idle';
  #activeTurn = '';
  #failure = '';
  #pending: PendingMessage[] = [];
  #approvals = new Map<string, NonNullable<AgentEvent['approval']>>();
  #operation: Promise<void> = Promise.resolve();

  constructor(options: AgentConsoleRuntimeOptions) {
    if (!options.providers.length)
      throw new ToudocuError(
        'agent_provider_unavailable',
        'at least one agent provider is required',
      );
    this.#cwd = options.cwd;
    this.#providers = new Map(options.providers.map((provider) => [provider.name, provider]));
    this.#skill = options.skill;
    this.#preferences = options.preferenceStore ?? new AgentPreferenceStore(options.cwd);
    this.#terminal = new ProjectTerminal(options.cwd);
    this.#terminal.subscribe((terminal) => {
      this.#publish({ kind: 'terminal', terminal });
      if (terminal.type === 'exit') this.#state();
    });
  }

  async setup(selectedProvider?: string): Promise<AgentConsoleState> {
    if (selectedProvider && !this.#providers.has(selectedProvider))
      throw new ToudocuError('agent_provider_unavailable', 'agent provider is unavailable');
    const selected =
      selectedProvider && this.#providers.has(selectedProvider)
        ? selectedProvider
        : this.#providers.keys().next().value!;
    const provider = this.#providers.get(selected)!;
    let models: AgentModel[] | undefined;
    try {
      models = await provider.models?.(this.#cwd);
    } catch {
      // Model discovery is optional; starting a session still accepts a model ID manually.
    }
    return AgentConsoleStateSchema.parse({
      schemaVersion: 1,
      setup: {
        availableProviders: [...this.#providers.keys()],
        selectedProvider: selected,
        preference: await this.#preferences.load(),
        ...(models ? { models } : {}),
        skill: this.#skill,
      },
      state: this.snapshot(),
    });
  }

  savePreference(preference: AgentPreference, confirmed: boolean): Promise<void> {
    if (preference.launchPreset === 'full-access' && !confirmed) {
      throw new ToudocuError(
        'agent_preference_confirmation_required',
        'full access requires confirmation',
      );
    }
    return this.#preferences.save(preference);
  }

  async history(providerName = 'codex', signal?: AbortSignal): Promise<AgentThread[]> {
    const provider = this.#providers.get(providerName);
    if (!provider?.history) {
      throw new ToudocuError('agent_history_unsupported', 'provider history is unavailable');
    }
    return provider.history(this.#cwd, signal);
  }

  resume(
    input: {
      threadID: string;
      provider?: string;
      preset?: 'default' | 'full-access';
    },
    signal?: AbortSignal,
  ): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#session) {
        throw new ToudocuError('agent_session_active', 'agent session is already active');
      }
      const provider = this.#providers.get(input.provider ?? 'codex');
      if (!provider?.resume) {
        throw new ToudocuError('agent_resume_unsupported', 'provider resume is unavailable');
      }
      const preference = await this.#preferences.load();
      const launch: AgentLaunch = {
        cwd: this.#cwd,
        provider: provider.name,
        preset: input.preset ?? preference.launchPreset,
        ...(preference.model ? { model: preference.model } : {}),
        ...(preference.effort ? { effort: preference.effort } : {}),
      };
      const session = await provider.resume(launch, input.threadID, signal);
      this.#attachSession(session);
      try {
        signal?.throwIfAborted();
      } catch (error) {
        await this.#rollbackStart(session, error);
        throw error;
      }
    });
  }

  snapshot(): AgentSessionState {
    return AgentSessionStateSchema.parse({
      active: Boolean(this.#session),
      ...(this.#session
        ? {
            status: this.#status,
            ...(this.#activeTurn ? { activeTurn: this.#activeTurn } : {}),
            pending: this.#pending,
            approvals: [...this.#approvals.values()],
            ...(this.#failure ? { failure: this.#failure } : {}),
            settings: this.#session.settings,
          }
        : {}),
      terminal: this.#terminal.snapshot(),
    });
  }

  subscribe(listener: (event: AgentRuntimeEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(
    input: {
      taskID?: string;
      provider?: string;
      preset?: 'default' | 'full-access';
      model?: string;
      effort?: string;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    return this.#exclusive(async () => {
      if (this.#session)
        throw new ToudocuError('agent_session_active', 'agent session is already active');
      const provider = this.#providers.get(input.provider ?? this.#providers.keys().next().value!);
      if (!provider)
        throw new ToudocuError('agent_provider_unavailable', 'agent provider is unavailable');
      const preference = await this.#preferences.load();
      const selectedModel = input.model ?? preference.model;
      const selectedEffort = input.effort ?? preference.effort;
      const launch: AgentLaunch = {
        cwd: this.#cwd,
        provider: provider.name,
        preset: input.preset ?? preference.launchPreset,
        ...(input.taskID ? { taskID: input.taskID } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(selectedEffort ? { effort: selectedEffort } : {}),
      };
      const session = await provider.start(launch, signal);
      this.#attachSession(session);
      try {
        signal?.throwIfAborted();
        if (input.taskID) {
          await this.#send(
            `$toudocu Continue ${input.taskID} using the installed skill and the public Toudocu CLI.`,
            'normal',
            signal,
          );
        }
      } catch (error) {
        await this.#rollbackStart(session, error);
        throw error;
      }
    });
  }

  send(text: string, policy: AgentTurnPolicy = 'normal', signal?: AbortSignal): Promise<void> {
    return this.#exclusive(() => this.#send(text, policy, signal));
  }

  interrupt(signal?: AbortSignal): Promise<void> {
    return this.#exclusive(async () => {
      if (!this.#session || !this.#activeTurn) return;
      try {
        await this.#session.interrupt(this.#activeTurn, signal);
      } catch (error) {
        for (const pending of this.#pending) {
          pending.state = 'not-sent';
          pending.reason = 'interrupt_unconfirmed';
          pending.notSent = true;
        }
        await this.#session.stop().catch(() => undefined);
        this.#status = 'failed';
        this.#failure = message(error);
        this.#state();
        throw error;
      }
    });
  }

  approve(requestID: string, decision: AgentApprovalDecision): Promise<void> {
    return this.#exclusive(async () => {
      if (!this.#session)
        throw new ToudocuError('agent_session_inactive', 'agent session is not active');
      await this.#session.approve(requestID, decision);
      this.#approvals.delete(requestID);
      this.#state();
    });
  }

  cancelPending(id: string): Promise<void> {
    return this.#exclusive(async () => {
      const index = this.#pending.findIndex((item) => item.id === id);
      if (index < 0) throw new ToudocuError('agent_pending_missing', 'pending message not found');
      this.#pending.splice(index, 1);
      this.#reposition();
      this.#state();
    });
  }

  stop(discardPending: boolean): Promise<void> {
    return this.#exclusive(async () => {
      const session = this.#session;
      if (!session) return;
      if (this.#pending.length && !discardPending)
        throw new ToudocuError('agent_pending_conflict', 'pending messages require confirmation', {
          details: { count: this.#pending.length },
        });
      this.#status = 'stopping';
      this.#state();
      try {
        await session.stop();
      } catch (error) {
        this.#status = 'failed';
        this.#failure = message(error);
        this.#state();
        throw error;
      }
      this.#clearSession();
      this.#state();
    });
  }

  cleanup(): Promise<void> {
    return this.#exclusive(async () => {
      const session = this.#session;
      if (!session) return;
      if (this.#status !== 'failed')
        throw new ToudocuError('agent_cleanup_conflict', 'only a failed session can be cleaned up');
      await session.stop();
      this.#clearSession();
      this.#state();
    });
  }

  startTerminal(signal?: AbortSignal): Promise<void> {
    return this.#exclusive(async () => {
      this.#terminal.start(signal);
      this.#state();
    });
  }

  stopTerminal(signal?: AbortSignal): Promise<void> {
    return this.#exclusive(async () => {
      await this.#terminal.stop(signal);
      this.#state();
    });
  }

  writeTerminal(text: string): void {
    this.#terminal.write(text);
  }

  resizeTerminal(columns: number, rows: number): void {
    this.#terminal.resize(columns, rows);
  }

  interruptTerminal(): void {
    this.#terminal.interrupt();
  }

  async close(): Promise<void> {
    await this.#exclusive(async () => {
      const session = this.#session;
      const results = await Promise.allSettled([session?.stop(), this.#terminal.close()]);
      const providerResult = results[0];
      if (session && providerResult?.status === 'fulfilled') {
        this.#clearSession();
      } else if (session && providerResult?.status === 'rejected') {
        this.#status = 'failed';
        this.#failure = 'provider_stop_unconfirmed';
        this.#state();
      }
      this.#listeners.clear();
      const rejected = results.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
    });
  }

  async #rollbackStart(session: AgentProviderSession, cause: unknown): Promise<void> {
    try {
      await session.stop();
      if (session === this.#session) this.#clearSession();
      this.#state();
    } catch {
      this.#status = 'failed';
      this.#failure = `provider_stop_unconfirmed: ${message(cause)}`;
      this.#state();
    }
  }

  #attachSession(session: AgentProviderSession): void {
    this.#session = session;
    this.#status = 'idle';
    this.#failure = '';
    this.#pending = [];
    this.#approvals.clear();
    this.#unsubscribeSession = session.subscribe((event) => this.#consume(session, event));
    this.#state();
  }

  async #send(text: string, policy: AgentTurnPolicy, signal?: AbortSignal): Promise<void> {
    const session = this.#session;
    if (!session || this.#status === 'failed')
      throw new ToudocuError('agent_session_inactive', 'agent session is not active');
    if (Buffer.byteLength(text) > 65_536)
      throw new ToudocuError('agent_message_too_large', 'agent message exceeds 65536 bytes');
    const itemID = randomUUID();
    if (!this.#activeTurn) {
      const turnID = await session.startTurn(text, policy, signal);
      this.#activeTurn = turnID;
      this.#status = 'running';
    } else if (policy === 'normal' && session.settings.capabilities.steering) {
      try {
        await session.steer(this.#activeTurn, text, signal);
      } catch {
        this.#queue(itemID, text, policy);
      }
    } else {
      this.#queue(itemID, text, policy);
    }
    this.#publish({ kind: 'event', event: { type: 'user_message', itemID, text } });
    this.#state();
  }

  #queue(id: string, text: string, policy: AgentTurnPolicy): void {
    if (this.#pending.length >= 32)
      throw new ToudocuError('agent_queue_full', 'agent message queue is full');
    this.#pending.push({
      id,
      text,
      state: 'queued',
      reason: 'turn_in_progress',
      position: this.#pending.length + 1,
      notSent: false,
      policy,
    });
  }

  #consume(session: AgentProviderSession, event: AgentEvent): void {
    if (session !== this.#session) return;
    if (event.type === 'turn_started') {
      this.#activeTurn = event.turnID ?? this.#activeTurn;
      this.#status = 'running';
    } else if (event.type === 'approval' && event.approval) {
      this.#approvals.set(event.approval.requestID, event.approval);
    } else if (event.type === 'turn_completed') {
      this.#activeTurn = '';
      this.#status = 'idle';
      void this.#exclusive(() => this.#startNext(session));
    } else if (event.type === 'error') {
      this.#status = 'failed';
      this.#failure = event.text ?? 'agent session failed';
      for (const pending of this.#pending) {
        pending.state = 'not-sent';
        pending.reason = 'session_failed';
        pending.notSent = true;
      }
    }
    this.#publish({ kind: 'event', event });
    this.#state();
  }

  async #startNext(session: AgentProviderSession): Promise<void> {
    if (session !== this.#session || this.#status !== 'idle' || this.#approvals.size) return;
    const index = this.#pending.findIndex((item) => !item.notSent);
    if (index < 0) return;
    const [next] = this.#pending.splice(index, 1);
    if (!next) return;
    this.#reposition();
    try {
      this.#activeTurn = await session.startTurn(next.text, next.policy);
      this.#status = 'running';
    } catch (error) {
      next.state = 'not-sent';
      next.reason = message(error);
      next.notSent = true;
      this.#pending.push(next);
      this.#reposition();
      this.#status = 'failed';
      this.#failure = message(error);
    }
    this.#state();
  }

  #clearSession(): void {
    this.#unsubscribeSession?.();
    this.#unsubscribeSession = undefined;
    this.#session = undefined;
    this.#status = 'idle';
    this.#activeTurn = '';
    this.#failure = '';
    this.#pending = [];
    this.#approvals.clear();
  }

  #reposition(): void {
    this.#pending.forEach((item, index) => (item.position = index + 1));
  }

  #state(): void {
    this.#publish({ kind: 'state', state: this.snapshot() });
  }

  #publish(event: AgentRuntimeEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.#operation.then(operation, operation);
    this.#operation = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

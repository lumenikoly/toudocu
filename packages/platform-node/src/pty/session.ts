import { resolve } from 'node:path';
import { spawn, type IDisposable, type IPty } from 'node-pty';
import { ToudocuError } from '@toudocu/contracts';

export interface TerminalEvent {
  type: 'output' | 'exit';
  data?: string;
}

export interface TerminalState {
  available: boolean;
  active: boolean;
  failure?: string;
}

type Listener = (event: TerminalEvent) => void;

function defaultShell(): { executable: string; args: string[] } {
  if (process.platform === 'win32') {
    return { executable: process.env.COMSPEC || 'cmd.exe', args: [] };
  }
  return { executable: process.env.SHELL || '/bin/sh', args: ['-i'] };
}

export class ProjectTerminal {
  readonly #cwd: string;
  readonly #listeners = new Set<Listener>();
  #process: IPty | undefined;
  #subscriptions: IDisposable[] = [];
  #exit: Promise<void> | undefined;
  #resolveExit: (() => void) | undefined;
  #failure = '';
  #stopping = false;
  #abortSignal: AbortSignal | undefined;
  #abortListener: (() => void) | undefined;

  constructor(cwd: string) {
    this.#cwd = resolve(cwd);
  }

  snapshot(): TerminalState {
    return {
      available: true,
      active: this.#process !== undefined,
      ...(this.#failure ? { failure: this.#failure } : {}),
    };
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  start(signal?: AbortSignal): void {
    signal?.throwIfAborted();
    if (this.#process)
      throw new ToudocuError('terminal_active', 'project terminal is already active');
    const shell = defaultShell();
    let child: IPty;
    try {
      child = spawn(shell.executable, shell.args, {
        cwd: this.#cwd,
        env: { ...process.env, TERM: 'xterm-256color' },
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
      });
    } catch (error) {
      throw new ToudocuError('terminal_spawn_failed', 'failed to start project terminal', {
        cause: error,
      });
    }
    this.#failure = '';
    this.#stopping = false;
    this.#process = child;
    this.#exit = new Promise<void>((resolveExit) => {
      this.#resolveExit = resolveExit;
    });
    this.#subscriptions = [
      child.onData((data) =>
        this.#publish({ type: 'output', data: Buffer.from(data).toString('base64') }),
      ),
      child.onExit(({ exitCode }) => {
        if (this.#process !== child) return;
        this.#process = undefined;
        if (!this.#stopping && exitCode !== 0)
          this.#failure = `terminal exited with code ${exitCode}`;
        this.#resolveExit?.();
        this.#removeAbortListener();
        this.#disposeSubscriptions();
        this.#publish({ type: 'exit' });
      }),
    ];
    if (signal) {
      this.#abortSignal = signal;
      this.#abortListener = () => void this.stop().catch(() => undefined);
      signal.addEventListener('abort', this.#abortListener, { once: true });
      if (signal.aborted) this.#abortListener();
    }
  }

  write(data: string): void {
    if (!this.#process)
      throw new ToudocuError('terminal_inactive', 'project terminal is not active');
    this.#process.write(data);
  }

  resize(columns: number, rows: number): void {
    if (columns < 2 || columns > 500 || rows < 2 || rows > 500)
      throw new ToudocuError('invalid_terminal_size', 'terminal size is outside 2..500');
    if (!this.#process)
      throw new ToudocuError('terminal_inactive', 'project terminal is not active');
    this.#process.resize(columns, rows);
  }

  interrupt(): void {
    this.write('\x03');
  }

  async stop(signal?: AbortSignal): Promise<void> {
    const child = this.#process;
    const exited = this.#exit;
    if (!child || !exited) return;
    this.#stopping = true;
    child.kill();
    await ensureExit(child, exited);
    signal?.throwIfAborted();
  }

  async close(signal?: AbortSignal): Promise<void> {
    await this.stop(signal);
    this.#listeners.clear();
  }

  #publish(event: TerminalEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  #disposeSubscriptions(): void {
    for (const subscription of this.#subscriptions) subscription.dispose();
    this.#subscriptions = [];
    this.#resolveExit = undefined;
    this.#exit = undefined;
  }

  #removeAbortListener(): void {
    if (this.#abortSignal && this.#abortListener) {
      this.#abortSignal.removeEventListener('abort', this.#abortListener);
    }
    this.#abortSignal = undefined;
    this.#abortListener = undefined;
  }
}

async function ensureExit(child: IPty, exited: Promise<void>): Promise<void> {
  if (await settlesWithin(exited, 3000)) return;
  child.kill('SIGKILL');
  if (await settlesWithin(exited, 1000)) return;
  throw new ToudocuError('terminal_stop_unconfirmed', 'project terminal did not exit');
}

async function settlesWithin(promise: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout(false), milliseconds);
  });
  const settled = promise.then(() => true);
  const result = await Promise.race([settled, timeout]);
  if (timer) clearTimeout(timer);
  return result;
}

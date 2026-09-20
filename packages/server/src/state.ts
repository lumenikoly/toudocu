import type { PortalSnapshotV1 } from '@toudocu/contracts';

export interface PortalRevision {
  revision: number;
  snapshot: PortalSnapshotV1;
  rebuilding: boolean;
  lastError?: string;
}

export class PortalState {
  readonly #controller = new AbortController();
  readonly #rebuild: (signal: AbortSignal) => Promise<PortalSnapshotV1>;
  readonly #onError: ((error: unknown) => void) | undefined;
  #current: PortalRevision;
  #pending = false;
  #drain: Promise<void> | undefined;

  constructor(
    initialSnapshot: PortalSnapshotV1,
    rebuild: (signal: AbortSignal) => Promise<PortalSnapshotV1>,
    onError?: (error: unknown) => void,
  ) {
    this.#current = { revision: 1, snapshot: initialSnapshot, rebuilding: false };
    this.#rebuild = rebuild;
    this.#onError = onError;
  }

  get current(): PortalRevision {
    return this.#current;
  }

  async requestRebuild(signal?: AbortSignal): Promise<void> {
    if (this.#controller.signal.aborted) return Promise.resolve();
    this.#pending = true;
    this.#drain ??= Promise.resolve()
      .then(() => this.#run())
      .finally(() => {
        this.#drain = undefined;
      });
    if (!signal) return this.#drain;
    signal.throwIfAborted();
    let abort!: () => void;
    const aborted = new Promise<void>((_resolve, reject) => {
      abort = () => reject(signal.reason ?? new Error('request aborted'));
      signal.addEventListener('abort', abort, { once: true });
    });
    try {
      await Promise.race([this.#drain, aborted]);
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.#current = { ...this.#current, rebuilding: false, lastError: message };
    this.#onError?.(error);
  }

  async close(): Promise<void> {
    this.#controller.abort();
    await this.#drain;
  }

  async #run(): Promise<void> {
    while (this.#pending && !this.#controller.signal.aborted) {
      this.#pending = false;
      this.#current = { ...this.#current, rebuilding: true };
      try {
        const snapshot = await this.#rebuild(this.#controller.signal);
        this.#controller.signal.throwIfAborted();
        this.#current = {
          revision: this.#current.revision + 1,
          snapshot,
          rebuilding: false,
        };
      } catch (error) {
        if (this.#controller.signal.aborted) break;
        this.reportError(error);
      }
    }
    if (this.#current.rebuilding) this.#current = { ...this.#current, rebuilding: false };
  }
}

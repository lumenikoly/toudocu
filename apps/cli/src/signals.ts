interface SignalTarget {
  once(signal: NodeJS.Signals, listener: () => void): unknown;
  removeListener(signal: NodeJS.Signals, listener: () => void): unknown;
}

export function installSignalHandlers(
  controller: AbortController,
  target: SignalTarget = process,
): () => void {
  const abort = (signal: NodeJS.Signals): void => {
    if (controller.signal.aborted) {
      return;
    }
    const reason = Object.assign(new Error(`received ${signal}`), { signal });
    controller.abort(reason);
  };
  const onInterrupt = (): void => abort('SIGINT');
  const onTerminate = (): void => abort('SIGTERM');
  target.once('SIGINT', onInterrupt);
  target.once('SIGTERM', onTerminate);

  return (): void => {
    target.removeListener('SIGINT', onInterrupt);
    target.removeListener('SIGTERM', onTerminate);
  };
}

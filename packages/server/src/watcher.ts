import chokidar, { type FSWatcher } from 'chokidar';

export interface ProjectWatcher {
  ready: Promise<void>;
  close(): Promise<void>;
}

export function watchProject(
  paths: readonly string[],
  rebuild: () => void,
  onError: (error: unknown) => void,
  debounceMs = 75,
): ProjectWatcher {
  const watcher: FSWatcher = chokidar.watch([...paths], {
    ignoreInitial: true,
    atomic: true,
    awaitWriteFinish: {
      stabilityThreshold: debounceMs,
      pollInterval: Math.max(10, debounceMs / 3),
    },
  });
  const ready = new Promise<void>((resolve) => watcher.once('ready', resolve));
  let timer: ReturnType<typeof setTimeout> | undefined;
  watcher.on('all', () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, debounceMs);
  });
  watcher.on('error', onError);
  return {
    ready,
    async close(): Promise<void> {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}

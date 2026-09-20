import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToudocuError } from '@toudocu/contracts';

interface NativeBinding {
  tryLock(path: string): object | null;
  unlock(lock: object): void;
  publishNoReplace(source: string, destination: string): void;
}

export interface NativeLock {
  readonly handle: object;
}

let loadedBinding: NativeBinding | undefined;

function nativeCandidates(): string[] {
  const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
  const packageDirectory = join(moduleDirectory, '..');
  const platformDirectory = `${process.platform}-${process.arch}`;
  return [
    join(packageDirectory, 'native', 'prebuilds', platformDirectory, 'toudocu-native.node'),
    join(packageDirectory, 'native', 'build', platformDirectory, 'toudocu-native.node'),
  ];
}

function loadBinding(): NativeBinding {
  if (loadedBinding) {
    return loadedBinding;
  }
  const candidate = nativeCandidates().find((path) => existsSync(path));
  if (!candidate) {
    throw new ToudocuError(
      'AGENT_NATIVE_HELPER_UNAVAILABLE',
      'the native agent-feedback helper is not installed for this platform',
    );
  }
  try {
    loadedBinding = createRequire(import.meta.url)(candidate) as NativeBinding;
  } catch (error) {
    throw new ToudocuError(
      'AGENT_NATIVE_HELPER_UNAVAILABLE',
      'the native agent-feedback helper could not be loaded',
      { cause: error },
    );
  }
  return loadedBinding;
}

export function tryLockReviewFile(path: string): NativeLock | undefined {
  const lock = loadBinding().tryLock(path);
  if (lock === null) {
    return undefined;
  }
  return { handle: lock };
}

export function unlockReviewFile(lock: NativeLock): void {
  loadBinding().unlock(lock.handle);
}

export function publishNoReplace(source: string, destination: string): void {
  loadBinding().publishNoReplace(source, destination);
}

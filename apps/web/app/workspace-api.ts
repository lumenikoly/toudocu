import { useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function jsonRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const value = (await response.json()) as { error?: { message?: string; details?: unknown } };
  if (!response.ok)
    throw new ApiError(
      value.error?.message ?? `HTTP ${response.status}`,
      response.status,
      value.error?.details,
    );
  return value;
}

export function action(
  method: string,
  name: string,
  body: unknown,
  signal?: AbortSignal,
): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', 'x-toudocu-action': name },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

export function useInitial<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then(setValue)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);
  return { value, setValue, error, setError };
}

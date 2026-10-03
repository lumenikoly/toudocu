import type { SourceRange } from './common.js';

/** Internal failure; transports choose their own public error representation. */
export class ToudocuError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly path?: string;
  readonly range?: SourceRange;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    options: {
      exitCode?: number;
      path?: string;
      range?: SourceRange;
      details?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ToudocuError';
    this.code = code;
    this.exitCode = options.exitCode ?? 1;
    if (options.path !== undefined) this.path = options.path;
    if (options.range !== undefined) this.range = options.range;
    if (options.details !== undefined) this.details = options.details;
  }
}

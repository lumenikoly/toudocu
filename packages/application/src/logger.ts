export type LoggerSink = (value: string) => void;

export interface LoggerOptions {
  debug?: boolean;
  sink?: LoggerSink;
}

export interface Logger {
  debug(message: string, details?: Record<string, unknown>): void;
  error(error: unknown, details?: Record<string, unknown>): void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const debug = options.debug === true;
  const sink = options.sink ?? (() => {});

  function write(record: Record<string, unknown>): void {
    if (!debug) {
      return;
    }
    sink(`${safeJson(record)}\n`);
  }

  return {
    debug(message, details) {
      write({
        level: 'debug',
        message,
        ...(details === undefined ? {} : { details }),
      });
    },
    error(error, details) {
      if (!debug) {
        return;
      }
      const record: Record<string, unknown> = {
        level: 'error',
        error: describeError(error),
      };
      if (details !== undefined) {
        record.details = details;
      }
      write(record);
    },
  };
}

function describeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  return {
    name: error.name,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({
      level: 'error',
      error: { message: 'failed to serialize log record' },
    });
  }
}

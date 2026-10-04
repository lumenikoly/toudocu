import { expect, test } from 'vitest';
import { createLogger } from './logger.js';

test('default logger stays silent without inspecting disabled input', () => {
  const stderr: string[] = [];
  let inspected = false;
  const error = {
    get message(): string {
      inspected = true;
      return 'not emitted';
    },
  };
  const logger = createLogger({ sink: (value) => stderr.push(value) });

  logger.debug('not emitted', { error });
  logger.error(error);

  expect(stderr).toEqual([]);
  expect(inspected).toBe(false);
});

test('debug logger writes JSON records to the injected sink only', () => {
  const stdout = ['{"schemaVersion":"changes.v1"}\n'];
  const stderr: string[] = [];
  const error = new Error('broken input');
  const logger = createLogger({
    debug: true,
    sink: (value) => stderr.push(value),
  });

  logger.debug('reading project', { path: 'docs' });
  logger.error(error, { command: 'check' });

  expect(stdout).toEqual(['{"schemaVersion":"changes.v1"}\n']);
  expect(stderr).toHaveLength(2);
  expect(JSON.parse(stderr[0] ?? '')).toEqual({
    level: 'debug',
    message: 'reading project',
    details: { path: 'docs' },
  });
  expect(JSON.parse(stderr[1] ?? '')).toMatchObject({
    level: 'error',
    error: {
      name: 'Error',
      message: 'broken input',
    },
    details: { command: 'check' },
  });
  expect(JSON.parse(stderr[1] ?? '').error.stack).toContain('Error: broken input');
});

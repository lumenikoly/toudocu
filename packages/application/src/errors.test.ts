import { expect, test } from 'vitest';
import { ToudocuError, SourceRangeSchema } from '@toudocu/contracts';

test('typed errors retain source range, cause and transport-independent failure details', () => {
  const range = SourceRangeSchema.parse({
    start: { offset: 4, line: 2, column: 1 },
    end: { offset: 9, line: 2, column: 6 },
  });
  const cause = new Error('underlying error');
  const error = new ToudocuError('invalid_source', 'Invalid source', {
    exitCode: 2,
    path: 'docs/index.md',
    range,
    details: { field: 'status' },
    cause,
  });
  expect(error).toMatchObject({
    code: 'invalid_source',
    exitCode: 2,
    path: 'docs/index.md',
    range,
    details: { field: 'status' },
    cause,
  });
  expect(new ToudocuError('failure', 'Failed').exitCode).toBe(1);
  expect(
    SourceRangeSchema.safeParse({ start: { offset: -1, line: 0, column: 0 }, end: range.end })
      .success,
  ).toBe(false);
});

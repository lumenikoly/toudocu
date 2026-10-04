import { expect, test } from 'vitest';
import { normalizeTableCell } from './table-cell.js';

test('matches Go semantic table-cell normalization at the edges', () => {
  expect(normalizeTableCell(['  ``value``  '], 0)).toBe('value');
  expect(normalizeTableCell(['  **value  '], 0)).toBe('**value');
  expect(normalizeTableCell([' **—** '], 0)).toBe('');
  expect(normalizeTableCell(['\u0085  left  middle  right  \u0085'], 0)).toBe(
    'left  middle  right',
  );
  expect(normalizeTableCell(['value'], undefined)).toBe('');
});
